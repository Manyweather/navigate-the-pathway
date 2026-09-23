begin;

create table if not exists public.pilot_auth_configuration (
  singleton boolean primary key default true check(singleton),
  roseman_sso_provider_id uuid,
  trust_roseman_saml_as_mfa boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.pilot_auth_configuration(singleton) values(true) on conflict(singleton) do nothing;

create or replace function public.staff_mfa_verified()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(auth.jwt()->>'aal','')='aal2' or exists(
    select 1 from public.pilot_auth_configuration c,jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) method
    where c.singleton and c.trust_roseman_saml_as_mfa and method->>'method'='sso/saml'
      and method->>'provider'=c.roseman_sso_provider_id::text
  );
$$;

create table if not exists public.pilot_staff_roster_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid references public.programs(id) on delete cascade,
  cohort_id uuid references public.cohorts(id) on delete cascade,
  email text not null,
  display_name text not null,
  roles text[] not null default array['advisor']::text[],
  workspace_roles jsonb not null default '{"oaca":["advisor"]}'::jsonb,
  status text not null default 'approved' check(status in ('approved','revoked')),
  source_id text,
  provenance jsonb not null default '{}'::jsonb,
  approved_by uuid not null references public.profiles(user_id),
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(email=lower(trim(email)) and email like '%@%'),
  check(roles <@ array['advisor','administrator','faculty','staff','creator']::text[]),
  unique(organization_id,email)
);

create table if not exists public.pilot_pending_sso_identities (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  sso_provider_id uuid not null,
  display_name text,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  matched_roster_entry_id uuid references public.pilot_staff_roster_entries(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(user_id),
  reviewed_at timestamptz,
  check(email=lower(trim(email)) and email like '%@%')
);

create index if not exists pilot_staff_roster_status_idx on public.pilot_staff_roster_entries(organization_id,status,email);
create index if not exists pilot_pending_sso_status_idx on public.pilot_pending_sso_identities(status,last_seen_at desc);

alter table public.pilot_staff_roster_entries enable row level security;
alter table public.pilot_pending_sso_identities enable row level security;
alter table public.pilot_auth_configuration enable row level security;

-- A canonical Creator identity transfer changes the owner on the existing active
-- principal row. It is safe only after the destination already has the Creator
-- permission; ordinary deletion and revocation remain blocked.
create or replace function public.pathway_guard_creator() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_table_name='principal_assignments' then
    if old.principal_type<>'creator' or old.revoked_at is not null then return coalesce(new,old); end if;
    if tg_op='UPDATE' and new.principal_type='creator' and new.revoked_at is null and new.organization_id=old.organization_id then
      if new.user_id=old.user_id or exists(select 1 from public.permission_assignments where user_id=new.user_id and permission_key='platform.creator' and organization_id=old.organization_id and revoked_at is null) then return new; end if;
    end if;
    if not exists(select 1 from public.principal_assignments where organization_id=old.organization_id and principal_type='creator' and revoked_at is null and id<>old.id) then raise exception 'The last Creator cannot be removed' using errcode='42501'; end if;
  elsif tg_table_name='permission_assignments' then
    if old.permission_key<>'platform.creator' or old.revoked_at is not null then return coalesce(new,old); end if;
    if tg_op='UPDATE' and new.permission_key='platform.creator' and new.revoked_at is null and new.user_id=old.user_id and new.organization_id=old.organization_id then return new; end if;
    if exists(select 1 from public.principal_assignments where user_id=old.user_id and organization_id=old.organization_id and principal_type='creator' and revoked_at is null) then raise exception 'Transfer Creator ownership through principal governance first' using errcode='42501'; end if;
  end if;
  return coalesce(new,old);
end $$;

create or replace function public.pilot_approve_sso_identity(pending_user_id uuid, roster_entry_id uuid, actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  pending_record public.pilot_pending_sso_identities%rowtype;
  roster_record public.pilot_staff_roster_entries%rowtype;
  workspace record;
  workspace_role text;
  core_role text;
begin
  if not exists(select 1 from public.permission_assignments where user_id=actor_user_id and permission_key='platform.creator' and revoked_at is null)
  then raise exception 'Creator permission is required' using errcode='42501'; end if;

  select * into pending_record from public.pilot_pending_sso_identities where auth_user_id=pending_user_id for update;
  select * into roster_record from public.pilot_staff_roster_entries where id=roster_entry_id for update;
  if pending_record.auth_user_id is null or pending_record.status<>'pending' then raise exception 'Choose one pending SSO identity' using errcode='23514'; end if;
  if roster_record.id is null or roster_record.status<>'approved' then raise exception 'Choose one approved roster entry' using errcode='23514'; end if;
  if pending_record.email<>roster_record.email then raise exception 'The SSO identity must exactly match the roster email' using errcode='23514'; end if;
  if exists(select 1 from public.pilot_pending_sso_identities where email=pending_record.email and status='pending' and auth_user_id<>pending_record.auth_user_id)
  then raise exception 'More than one pending identity uses this email; review the identity provider records first' using errcode='23514'; end if;

  insert into public.profiles(user_id,display_name,active_organization_id,active_program_id,active_cohort_id,status)
  values(pending_record.auth_user_id,roster_record.display_name,roster_record.organization_id,roster_record.program_id,roster_record.cohort_id,'active')
  on conflict(user_id) do update set display_name=excluded.display_name,active_organization_id=excluded.active_organization_id,
    active_program_id=excluded.active_program_id,active_cohort_id=excluded.active_cohort_id,status='active',updated_at=now();

  update public.account_auth_identities set canonical_user_id=pending_record.auth_user_id,is_primary=true,verified_at=coalesce(verified_at,now())
  where auth_user_id=pending_record.auth_user_id;

  foreach core_role in array roster_record.roles loop
    if core_role in ('advisor','administrator') then
      insert into public.role_assignments(user_id,role,organization_id,program_id,cohort_id,granted_by,revoked_at)
      values(pending_record.auth_user_id,core_role,roster_record.organization_id,roster_record.program_id,roster_record.cohort_id,actor_user_id,null)
      on conflict(user_id,role,organization_id,program_id,cohort_id) do update set revoked_at=null,granted_by=actor_user_id,granted_at=now();
    end if;
  end loop;

  for workspace in select key,value from jsonb_each(roster_record.workspace_roles) loop
    if workspace.key not in ('pathway','oaca','genesis') or jsonb_typeof(workspace.value)<>'array' then
      raise exception 'Roster workspace roles are invalid' using errcode='22023';
    end if;
    for workspace_role in select jsonb_array_elements_text(workspace.value) loop
      insert into public.experience_role_assignments(user_id,experience_key,role,organization_id,program_id,cohort_id,granted_by,revoked_at)
      values(pending_record.auth_user_id,workspace.key,workspace_role,roster_record.organization_id,roster_record.program_id,roster_record.cohort_id,actor_user_id,null)
      on conflict(user_id,experience_key,role,organization_id,program_id,cohort_id) do update set revoked_at=null,granted_by=actor_user_id,granted_at=now();
    end loop;
  end loop;

  if 'creator'=any(roster_record.roles) then
    insert into public.permission_assignments(user_id,permission_key,organization_id,program_id,granted_by,revoked_at)
    values(pending_record.auth_user_id,'platform.creator',roster_record.organization_id,roster_record.program_id,actor_user_id,null)
    on conflict(user_id,permission_key,organization_id,program_id) do update set revoked_at=null,granted_by=actor_user_id,granted_at=now();
  end if;

  update public.pilot_pending_sso_identities set status='approved',matched_roster_entry_id=roster_record.id,reviewed_by=actor_user_id,reviewed_at=now()
  where auth_user_id=pending_record.auth_user_id;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata)
  values(roster_record.organization_id,actor_user_id,'sso_identity_roster_approved','auth_user',pending_record.auth_user_id::text,
    jsonb_build_object('rosterEntryId',roster_record.id,'email',roster_record.email,'ssoProviderId',pending_record.sso_provider_id));
  return jsonb_build_object('userId',pending_record.auth_user_id,'email',pending_record.email,'rosterEntryId',roster_record.id,'status','approved');
end $$;

create or replace function public.pilot_merge_canonical_accounts(primary_user_id uuid,secondary_user_id uuid,actor_user_id uuid,backup_reference text)
returns jsonb language plpgsql security definer set search_path=public,evaluation,pg_temp as $$
declare result jsonb; target_organization_id uuid;
begin
  select active_organization_id into target_organization_id from public.profiles where user_id=primary_user_id;
  result:=public.pathway_merge_accounts(primary_user_id,secondary_user_id,actor_user_id,backup_reference);
  if exists(select 1 from public.permission_assignments where user_id=secondary_user_id and permission_key='platform.creator' and revoked_at is null) then
    update public.permission_assignments set revoked_at=now() where user_id=secondary_user_id and permission_key='platform.creator' and revoked_at is null;
    update public.experience_role_assignments set revoked_at=now() where user_id=secondary_user_id and role='creator' and revoked_at is null;
    if (select count(*) from public.permission_assignments where permission_key='platform.creator' and organization_id=target_organization_id and revoked_at is null)<>1
    then raise exception 'Creator transfer did not produce one active Creator permission' using errcode='23514'; end if;
  end if;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata)
  values(target_organization_id,actor_user_id,'canonical_identity_merge_verified','profile',primary_user_id::text,jsonb_build_object('secondaryUserId',secondary_user_id,'oneCreatorVerified',true));
  return result||jsonb_build_object('oneCreatorVerified',true);
end $$;

revoke all on table public.pilot_auth_configuration,public.pilot_staff_roster_entries,public.pilot_pending_sso_identities from anon,authenticated;
revoke all on function public.pilot_approve_sso_identity(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.pilot_merge_canonical_accounts(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.pilot_approve_sso_identity(uuid,uuid,uuid),public.pilot_merge_canonical_accounts(uuid,uuid,uuid,text) to service_role;

commit;
