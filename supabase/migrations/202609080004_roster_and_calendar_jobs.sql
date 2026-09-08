begin;
create function public.pathway_apply_roster_row(import_id uuid,row_number integer,actor uuid,primary_id uuid,secondary_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.pathway_roster_imports; row_entry public.pathway_roster_rows; v jsonb; c uuid; advisor uuid; existing boolean;
begin
 select * into job from public.pathway_roster_imports where id=import_id and actor_id=actor;
 if job.id is null or not public.pathway_role(actor,'administrator',job.organization_id,job.program_id) or not exists(select 1 from public.permission_assignments where user_id=actor and permission_key='accounts.manage' and organization_id=job.organization_id and (program_id is null or program_id=job.program_id) and revoked_at is null) then raise exception 'Import permission was revoked' using errcode='42501'; end if;
 select * into row_entry from public.pathway_roster_rows r where r.import_id=job.id and r.row_number=pathway_apply_roster_row.row_number for update;
 if row_entry.status in ('created','updated') then return '{"ok":true}'; end if;
 v:=row_entry.values;c:=(v->>'cohort_id')::uuid;
 if not exists(select 1 from public.role_assignments where user_id=actor and role='administrator' and organization_id=job.organization_id and (program_id is null or program_id=job.program_id) and (cohort_id is null or cohort_id=c) and revoked_at is null) then raise exception 'Cohort access was revoked' using errcode='42501'; end if;
 if not exists(select 1 from public.account_auth_identities where canonical_user_id=primary_id and email=lower(v->>'primary_email')) then raise exception 'Primary account identity mismatch'; end if;
 if row_entry.user_id is not null and row_entry.user_id<>primary_id then raise exception 'Account changed since preview; preview again'; end if;
 if secondary_id is not null and (not exists(select 1 from auth.users where id=secondary_id and lower(email)=lower(v->>'secondary_email')) or exists(select 1 from public.profiles where user_id=secondary_id and user_id<>primary_id) or exists(select 1 from public.account_auth_identities where auth_user_id=secondary_id and canonical_user_id not in (secondary_id,primary_id))) then raise exception 'Secondary account requires explicit merge'; end if;
 if primary_id=actor then raise exception 'Use another principal to change your own access'; end if;
 existing:=exists(select 1 from public.profiles where user_id=primary_id);
 if existing and not exists(select 1 from public.role_assignments where user_id=primary_id and organization_id=job.organization_id and (program_id is null or program_id=job.program_id) and revoked_at is null) then raise exception 'Existing account is outside this program'; end if;
 if exists(select 1 from public.permission_assignments where user_id=primary_id and permission_key in ('platform.creator','platform.principal_investigator') and revoked_at is null) then raise exception 'Principal accounts cannot be changed by roster import'; end if;
 if coalesce(v->>'advisor_email','')<>'' then
   select canonical_user_id into advisor from public.account_auth_identities where email=lower(v->>'advisor_email');
   if advisor is null or not public.pathway_role(advisor,'advisor',job.organization_id,job.program_id,c) or advisor=primary_id then raise exception 'Advisor is not active in this cohort; import advisors first'; end if;
 end if;
 insert into public.profiles(user_id,display_name,active_organization_id,active_program_id,active_cohort_id,status) values(primary_id,v->>'name',job.organization_id,job.program_id,c,'invited') on conflict(user_id) do update set display_name=excluded.display_name,updated_at=now();
 insert into public.role_assignments(user_id,role,organization_id,program_id,cohort_id,granted_by) values(primary_id,v->>'role',job.organization_id,job.program_id,c,actor)
 on conflict(user_id,role,organization_id,program_id,cohort_id) do nothing;
 if v->>'role'='student' then
   insert into public.enrollments(student_id,organization_id,program_id,cohort_id,status) values(primary_id,job.organization_id,job.program_id,c,'invited') on conflict(student_id,program_id) do nothing;
   if advisor is not null and not exists(select 1 from public.advisor_assignments where advisor_id=advisor and student_id=primary_id and program_id=job.program_id and (ends_at is null or ends_at>now())) then
     insert into public.advisor_assignments(advisor_id,student_id,organization_id,program_id,cohort_id,created_by) values(advisor,primary_id,job.organization_id,job.program_id,c,actor);
   end if;
 end if;
 if secondary_id is not null then update public.account_auth_identities set canonical_user_id=primary_id,is_primary=false,added_by=actor where auth_user_id=secondary_id; end if;
 update public.pathway_roster_rows r set status=case when existing then 'updated' else 'created' end,user_id=primary_id,error=null where r.import_id=job.id and r.row_number=pathway_apply_roster_row.row_number;
 insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(job.organization_id,actor,'roster_row_imported','profile',primary_id::text,jsonb_build_object('importId',job.id,'row',pathway_apply_roster_row.row_number));
 return jsonb_build_object('ok',true,'userId',primary_id);
end $$;

create function public.pathway_calendar_feed(owner_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(e)),'[]') from (
   select 'appointment:'||a.id as event_key,jsonb_build_object('id',a.id,'title',a.title,'starts_at',a.starts_at,'ends_at',a.ends_at,'status',case when public.pathway_pair(a.requester_id,a.recipient_id,a.organization_id,a.program_id) then a.status else 'cancelled' end,'version',a.version) as event
   from public.pathway_appointments a where owner_id in (a.requester_id,a.recipient_id) and a.status in ('accepted','cancelled') and (a.ends_at>now()-interval '30 days' or exists(select 1 from public.pathway_calendar_events where event_key='appointment:'||a.id))
   union all
   select 'session:'||s.id,jsonb_build_object('id',s.id,'title',s.title,'starts_at',s.starts_at,'ends_at',s.ends_at,'status',s.status,'topic',s.topic)
   from public.sessions s where s.status in ('scheduled','cancelled') and s.ends_at>now()-interval '30 days' and exists(select 1 from public.role_assignments r join public.profiles f on f.user_id=r.user_id where r.user_id=owner_id and f.status in ('active','invited') and r.organization_id=s.organization_id and (r.program_id is null or r.program_id=s.program_id) and (s.cohort_id is null or r.cohort_id is null or r.cohort_id=s.cohort_id) and r.revoked_at is null)
 ) e;
$$;
revoke all on function public.pathway_apply_roster_row(uuid,integer,uuid,uuid,uuid),public.pathway_calendar_feed(uuid) from public,anon,authenticated;
grant execute on function public.pathway_apply_roster_row(uuid,integer,uuid,uuid,uuid),public.pathway_calendar_feed(uuid) to service_role;
commit;
