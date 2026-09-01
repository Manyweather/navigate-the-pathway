-- Run only in the Navigate staging Supabase project after the first Auth user exists.
-- Replace the two placeholders before execution. This file is never an automatic migration.

begin;

do $$
declare
  v_target_user_id uuid := 'REPLACE_WITH_AUTH_USER_UUID';
  v_target_email text := 'REPLACE_WITH_ADMIN_EMAIL';
  v_organization_id uuid;
  v_program_id uuid;
  v_cohort_id uuid;
begin
  if not exists (select 1 from auth.users where id = v_target_user_id and lower(email) = lower(v_target_email)) then
    raise exception 'The staging Auth user and email do not match';
  end if;

  insert into public.organizations (name, slug)
  values ('Roseman University College of Medicine', 'roseman-com')
  on conflict (slug) do update set name = excluded.name
  returning id into v_organization_id;

  insert into public.programs (organization_id, name, slug, settings)
  values (v_organization_id, 'Navigate the Pathway Staging Pilot', 'navigate-pathway-staging', '{"environment":"staging"}'::jsonb)
  on conflict (organization_id, slug) do update set name = excluded.name, settings = excluded.settings
  returning id into v_program_id;

  select cohort.id into v_cohort_id
  from public.cohorts cohort
  where cohort.program_id = v_program_id and cohort.name = 'Fictional Staging Cohort'
  limit 1;

  if v_cohort_id is null then
    insert into public.cohorts (organization_id, program_id, name, status)
    values (v_organization_id, v_program_id, 'Fictional Staging Cohort', 'active')
    returning id into v_cohort_id;
  end if;

  insert into public.profiles (
    user_id,
    display_name,
    active_organization_id,
    active_program_id,
    active_cohort_id,
    status
  ) values (
    v_target_user_id,
    split_part(v_target_email, '@', 1),
    v_organization_id,
    v_program_id,
    v_cohort_id,
    'active'
  )
  on conflict (user_id) do update set
    active_organization_id = excluded.active_organization_id,
    active_program_id = excluded.active_program_id,
    active_cohort_id = excluded.active_cohort_id,
    status = 'active';

  insert into public.role_assignments (
    user_id,
    role,
    organization_id,
    program_id,
    cohort_id,
    granted_by
  )
  select v_target_user_id, assigned_role, v_organization_id, v_program_id, v_cohort_id, v_target_user_id
  from unnest(array['student', 'advisor', 'administrator']) as assigned_role
  on conflict do nothing;

  insert into public.permission_assignments (
    user_id,
    permission_key,
    organization_id,
    program_id,
    granted_by
  ) values (
    v_target_user_id,
    'evaluation.identifiable_results',
    v_organization_id,
    v_program_id,
    v_target_user_id
  )
  on conflict do nothing;

  insert into public.audit_events (
    organization_id,
    actor_id,
    event_type,
    subject_type,
    subject_id,
    metadata
  ) values (
    v_organization_id,
    v_target_user_id,
    'staging_first_administrator_bootstrapped',
    'profile',
    v_target_user_id::text,
    jsonb_build_object('environment', 'staging', 'roles', array['student', 'advisor', 'administrator'])
  );
end;
$$;

commit;
