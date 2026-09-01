begin;

create table if not exists public.pilot_runtime_config (
  singleton boolean primary key default true check (singleton),
  environment text not null default 'production' check (environment in ('staging', 'production')),
  updated_at timestamptz not null default now()
);

insert into public.pilot_runtime_config (singleton, environment)
values (true, 'production')
on conflict (singleton) do nothing;

alter table public.pilot_runtime_config enable row level security;
revoke all on public.pilot_runtime_config from public, anon, authenticated;

create or replace function public.pilot_environment()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select environment from public.pilot_runtime_config where singleton = true;
$$;

revoke all on function public.pilot_environment() from public, anon;
grant execute on function public.pilot_environment() to authenticated;

create or replace function public.pilot_authorization_context()
returns jsonb language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
declare profile_record public.profiles; result jsonb;
begin
  select * into profile_record from public.profiles where user_id = auth.uid();
  if profile_record.user_id is null then raise exception 'No pilot profile is assigned to this account' using errcode = '42501'; end if;
  select jsonb_build_object(
    'userId', auth.uid(),
    'displayName', profile_record.display_name,
    'email', coalesce((select email from auth.users where id = auth.uid()), ''),
    'roles', coalesce((select jsonb_agg(distinct role order by role) from public.role_assignments where user_id = auth.uid() and revoked_at is null), '[]'::jsonb),
    'activeOrganizationId', profile_record.active_organization_id,
    'activeProgramId', profile_record.active_program_id,
    'activeCohortId', profile_record.active_cohort_id,
    'capabilities', coalesce((select jsonb_agg(distinct permission_key order by permission_key) from public.permission_assignments where user_id = auth.uid() and revoked_at is null), '[]'::jsonb),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'environment', public.pilot_environment()
  ) into result;
  return result;
end;
$$;
grant execute on function public.pilot_authorization_context() to authenticated;

create or replace function public.configure_staging_tri_role_fixture(target_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare org_id uuid; program_id uuid; cohort_id uuid;
begin
  if public.pilot_environment() <> 'staging' then raise exception 'The tri-role fixture is staging-only' using errcode = '42501'; end if;
  if not public.staff_mfa_verified() or not public.has_role('administrator', null, null, null) then raise exception 'A staging administrator with MFA is required' using errcode = '42501'; end if;
  insert into public.organizations (name, slug) values ('Fictional Roseman Pilot', 'fictional-roseman-pilot') on conflict (slug) do update set name = excluded.name returning id into org_id;
  insert into public.programs (organization_id, name, slug) values (org_id, 'Navigate Fictional Program', 'navigate-fictional') on conflict (organization_id, slug) do update set name = excluded.name returning id into program_id;
  insert into public.cohorts (organization_id, program_id, name, status) values (org_id, program_id, 'Fictional Staging Cohort', 'active') returning id into cohort_id;
  insert into public.profiles (user_id, display_name, active_organization_id, active_program_id, active_cohort_id, status) values (target_user_id, 'Staging Role Reviewer', org_id, program_id, cohort_id, 'active') on conflict (user_id) do update set active_organization_id = org_id, active_program_id = program_id, active_cohort_id = cohort_id, status = 'active';
  insert into public.role_assignments (user_id, role, organization_id, program_id, cohort_id, granted_by) select target_user_id, role, org_id, program_id, cohort_id, auth.uid() from unnest(array['student', 'advisor', 'administrator']) role on conflict do nothing;
  return jsonb_build_object('ok', true, 'organizationId', org_id, 'programId', program_id, 'cohortId', cohort_id);
end;
$$;
grant execute on function public.configure_staging_tri_role_fixture(uuid) to authenticated;

commit;
