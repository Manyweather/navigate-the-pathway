begin;
create function public.pilot_reports(export_requested boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.current_profile_user_id();org uuid;admin boolean;data jsonb;
begin
 select active_organization_id into org from public.profiles where user_id=u and status='active';
 if org is null or not public.staff_mfa_verified() then raise exception 'Active staff access with MFA is required';end if;
 admin:=public.has_capability('oaca.analytics',org) or public.pilot_is_creator(org) or exists(select 1 from public.experience_role_assignments where user_id=u and organization_id=org and experience_key='oaca' and role='administrator' and revoked_at is null);
 if not admin and not public.oaca_is_active_advisor(org) then raise exception 'Reporting permission required';end if;
 with visits as (
 select a.id::text id,'visit' kind,a.student_id::text "studentId",p.display_name "studentName",a.provider_id::text "providerId",coalesce(pp.display_name,'') "providerName",s.name service,coalesce(a.subject,'') topic,coalesce(v.campus,'Summerlin') campus,coalesce(v.name,'') location,a.starts_at "startsAt",a.status,null::text attendance,extract(epoch from(a.ends_at-a.starts_at))/60 "scheduledMinutes",a.reported_minutes "reportedMinutes",'pilot appointments' source,null::text "occurrenceId"
 from public.oaca_appointments a join public.profiles p on p.user_id=a.student_id join public.oaca_service_lines s on s.id=a.service_line_id left join public.oaca_providers pr on pr.id=a.provider_id left join public.profiles pp on pp.user_id=pr.user_id left join public.pilot_venues v on v.id=a.venue_id
 where a.organization_id=org and a.sandbox and a.starts_at is not null and (admin or pr.user_id=u or public.is_assigned_advisor(a.student_id))
 ), history as (
 select 'import:'||a.id,'visit',coalesce(a.student_id::text,a.student_key_hash),coalesce(p.display_name,'Unlinked imported student'),coalesce(a.provider_id::text,a.provider_key_hash),coalesce(pp.display_name,'Unlinked provider'),a.service_key,coalesce(a.topic_category,''),coalesce(a.campus,''),''::text,a.starts_at,a.source_status,a.source_attendance,a.duration_minutes,a.submitted_duration_minutes,'imported demo',null::text
 from public.oaca_historical_sessions a left join public.profiles p on p.user_id=a.student_id left join public.oaca_providers pr on pr.id=a.provider_id left join public.profiles pp on pp.user_id=pr.user_id
 where a.organization_id=org and a.dataset_mode='demo' and (admin or pr.user_id=u or public.is_assigned_advisor(a.student_id))
 ), events as (
 select 'event:'||e.id||':'||coalesce(r.student_id::text,'empty'),'event',r.student_id::text,coalesce(p.display_name,''),e.created_by::text,coalesce(pp.display_name,''),'Event',e.title,coalesce(v.campus,'Summerlin'),coalesce(e.location,''),e.starts_at,coalesce(r.status,e.status),r.attendance_status,extract(epoch from(e.ends_at-e.starts_at))/60,null::numeric,'pilot events',e.id::text
 from public.oaca_events e left join public.oaca_event_registrations r on r.event_id=e.id left join public.profiles p on p.user_id=r.student_id left join public.profiles pp on pp.user_id=e.created_by left join public.pilot_venues v on v.id=e.venue_id
 where e.organization_id=org and (admin or public.oaca_can_manage_event(e.id))
 ), all_rows as (select * from visits union all select * from history union all select * from events)
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into data from (select * from all_rows order by "startsAt" desc,id limit 10001) q;
 insert into public.audit_events(organization_id,actor_id,event_type,subject_type,metadata) values(org,auth.uid(),case when export_requested then 'pilot_report_export' else 'pilot_report_read' end,'operational_report','{"dataset":"fictional_pilot"}');
 return jsonb_build_object('rows',data,'generatedAt',now(),'offeredMinutes',null,'truncated',jsonb_array_length(data)>10000);
end $$;
revoke all on function public.pilot_reports(boolean) from public,anon;
grant execute on function public.pilot_reports(boolean) to authenticated;
commit;
