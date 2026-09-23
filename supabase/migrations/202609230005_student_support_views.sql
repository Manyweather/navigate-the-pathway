begin;
create table public.pilot_student_view_overrides(
 organization_id uuid not null references public.organizations(id),staff_id uuid not null references public.profiles(user_id),student_id uuid not null references public.profiles(user_id),
 allowed boolean not null,updated_by uuid not null references public.profiles(user_id),updated_at timestamptz not null default now(),primary key(organization_id,staff_id,student_id)
);
alter table public.pilot_student_view_overrides enable row level security;
revoke all on public.pilot_student_view_overrides from anon,authenticated;
create function public.pilot_student_view(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.current_profile_user_id();org uuid;target uuid;result jsonb; permitted boolean;
begin
 select active_organization_id into org from public.profiles where user_id=u and status='active';
 if org is null or not public.staff_mfa_verified() or not exists(select 1 from public.experience_role_assignments where user_id=u and organization_id=org and revoked_at is null and role in ('creator','administrator','advisor','staff','faculty','mentor')) then raise exception 'Active staff access required';end if;
 if action='access_directory' then
  if not public.pilot_is_creator(org) then raise exception 'Creator permission required';end if;
  select jsonb_build_object('people',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name)),'[]') from public.profiles where active_organization_id=org and status='active'),'overrides',(select coalesce(jsonb_agg(to_jsonb(o)),'[]') from public.pilot_student_view_overrides o where organization_id=org)) into result;
 elsif action='override' then
  if not public.pilot_is_creator(org) then raise exception 'Creator permission required';end if;
  if (select count(*) from public.profiles where user_id in ((payload->>'staffId')::uuid,(payload->>'studentId')::uuid) and active_organization_id=org and status='active')<>2 then raise exception 'Select two active accounts in this organization';end if;
  insert into public.pilot_student_view_overrides values(org,(payload->>'staffId')::uuid,(payload->>'studentId')::uuid,(payload->>'allowed')::boolean,u,now()) on conflict(organization_id,staff_id,student_id) do update set allowed=excluded.allowed,updated_by=u,updated_at=now();result:='{"ok":true}';
 elsif action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'name',p.display_name)),'[]') into result from public.profiles p where p.active_organization_id=org and p.status='active' and p.user_id<>u and coalesce((select allowed from public.pilot_student_view_overrides where organization_id=org and staff_id=u and student_id=p.user_id),public.is_assigned_advisor(p.user_id));
 elsif action='read' then
  target:=(payload->>'studentId')::uuid;
  select coalesce((select allowed from public.pilot_student_view_overrides where organization_id=org and staff_id=u and student_id=target),public.is_assigned_advisor(target)) into permitted;
  if not permitted or not exists(select 1 from public.profiles where user_id=target and active_organization_id=org and status='active') then raise exception 'Student-facing access is not assigned';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'startsAt',a.starts_at,'subject',a.subject,'status',a.status,'recap',case when e.recap_published_at is not null then e.student_recap else null end) order by a.starts_at desc),'[]') into result from public.oaca_appointments a left join public.oaca_encounter_records e on e.appointment_id=a.id where a.organization_id=org and a.student_id=target and (exists(select 1 from public.oaca_providers where id=a.provider_id and user_id=u) or public.is_assigned_advisor(target) or exists(select 1 from public.pilot_student_view_overrides where organization_id=org and staff_id=u and student_id=target and allowed));
 else raise exception 'Unknown student-view action';end if;
 insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(org,auth.uid(),'pilot_student_view_'||action,'student',target,'{}');return result;
end $$;
revoke all on function public.pilot_student_view(text,jsonb) from public,anon;
grant execute on function public.pilot_student_view(text,jsonb) to authenticated;
commit;
