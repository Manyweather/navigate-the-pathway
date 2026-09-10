begin;

-- Shared student identity metadata. These affiliations deliberately do not grant
-- GENESIS organization membership or publishing access.
create table if not exists public.platform_student_affiliations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  affiliation_type text not null check (affiliation_type in ('interest_group','student_council')),
  organization_id uuid references public.genesis_organizations(id),
  designation text not null default 'member' check (designation in ('member','officer','leader','student_council')),
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  check (
    (affiliation_type='interest_group' and organization_id is not null and designation<>'student_council')
    or (affiliation_type='student_council' and organization_id is null and designation='student_council')
  ),
  unique nulls not distinct (student_id, affiliation_type, organization_id)
);

create index if not exists platform_student_affiliations_student_active_idx
  on public.platform_student_affiliations(student_id, affiliation_type)
  where ended_at is null;

create or replace function public.platform_save_student_affiliations(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=public.current_profile_user_id();
  organization_ids jsonb:=coalesce(payload->'organizationIds','[]'::jsonb);
  student_council boolean:=coalesce((payload->>'studentCouncil')::boolean,false);
  selected_count integer;
begin
  if jsonb_typeof(organization_ids)<>'array' then raise exception 'Organization selections must be a list' using errcode='22023'; end if;
  if not exists(
    select 1 from public.experience_role_assignments r
    where r.user_id=actor and r.role='student' and r.revoked_at is null
  ) then raise exception 'An active student role is required' using errcode='42501'; end if;
  if exists(select 1 from jsonb_array_elements_text(organization_ids) value where value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    then raise exception 'Choose valid student organizations' using errcode='22023'; end if;
  if (select count(distinct value) from jsonb_array_elements_text(organization_ids) value)>50
    then raise exception 'Choose no more than 50 student organizations' using errcode='22023'; end if;
  if exists(
    select 1 from jsonb_array_elements_text(organization_ids) value
    where not exists(select 1 from public.genesis_organizations g where g.id=value::uuid and g.archived_at is null)
  ) then raise exception 'Choose organizations from the current Roseman directory' using errcode='22023'; end if;

  update public.platform_student_affiliations a set ended_at=now(),updated_at=now()
  where a.student_id=actor and a.affiliation_type='interest_group' and a.ended_at is null
    and not exists(select 1 from jsonb_array_elements_text(organization_ids) value where value::uuid=a.organization_id);

  insert into public.platform_student_affiliations(student_id,affiliation_type,organization_id,designation,created_by)
  select actor,'interest_group',g.id,'member',actor
  from public.genesis_organizations g
  where g.archived_at is null and g.id in (select distinct value::uuid from jsonb_array_elements_text(organization_ids) value)
  on conflict(student_id,affiliation_type,organization_id) do update set ended_at=null,updated_at=now();

  if student_council then
    insert into public.platform_student_affiliations(student_id,affiliation_type,organization_id,designation,created_by)
    values(actor,'student_council',null,'student_council',actor)
    on conflict(student_id,affiliation_type,organization_id) do update set ended_at=null,updated_at=now();
  else
    update public.platform_student_affiliations set ended_at=now(),updated_at=now()
    where student_id=actor and affiliation_type='student_council' and ended_at is null;
  end if;

  select count(*)::integer into selected_count from public.platform_student_affiliations
  where student_id=actor and affiliation_type='interest_group' and ended_at is null;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key)
  select p.active_organization_id,actor,'platform_student_affiliations_updated','profile',actor,
    jsonb_build_object('interestGroupCount',selected_count,'studentCouncil',student_council),
    coalesce((select r.experience_key from public.experience_role_assignments r where r.user_id=actor and r.role='student' and r.revoked_at is null order by case r.experience_key when 'pathway' then 1 when 'oaca' then 2 else 3 end limit 1),'pathway')
  from public.profiles p where p.user_id=actor;
  return jsonb_build_object('interestGroupCount',selected_count,'studentCouncil',student_council);
end $$;

-- A Creator is a platform principal. Synchronize that principal into every
-- experience while retaining explicit experience rows for auditable scoping.
create or replace function public.sync_platform_creator_access(target_user uuid,target_organization uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if target_user is null or target_organization is null or not exists(
    select 1 from public.permission_assignments p
    where p.user_id=target_user and p.permission_key='platform.creator'
      and p.organization_id=target_organization and p.revoked_at is null
  ) then raise exception 'Active Creator permission is required' using errcode='42501'; end if;

  insert into public.experience_role_assignments(user_id,experience_key,role,organization_id,granted_by,revoked_at)
  select target_user,e.key,'creator',target_organization,target_user,null from public.experiences e
  on conflict(user_id,experience_key,role,organization_id,program_id,cohort_id)
  do update set revoked_at=null,granted_at=now();

  insert into public.experience_role_assignments(user_id,experience_key,role,organization_id,granted_by,revoked_at)
  values
    (target_user,'oaca','administrator',target_organization,target_user,null),
    (target_user,'genesis','administrator',target_organization,target_user,null)
  on conflict(user_id,experience_key,role,organization_id,program_id,cohort_id)
  do update set revoked_at=null,granted_at=now();

  insert into public.genesis_organization_memberships(organization_id,user_id,role,status,approved_by,approved_at)
  select g.id,target_user,'administrator','approved',target_user,now()
  from public.genesis_organizations g where g.archived_at is null and g.pilot_available
  on conflict(organization_id,user_id,role)
  do update set status='approved',approved_by=target_user,approved_at=now();
end $$;

create or replace function public.sync_platform_creator_access_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.permission_key='platform.creator' and new.revoked_at is null then
    perform public.sync_platform_creator_access(new.user_id,new.organization_id);
  end if;
  return new;
end $$;

drop trigger if exists sync_platform_creator_access_after_grant on public.permission_assignments;
create trigger sync_platform_creator_access_after_grant
after insert or update of revoked_at on public.permission_assignments
for each row execute function public.sync_platform_creator_access_trigger();

do $$
declare creator record;
begin
  for creator in select distinct user_id,organization_id from public.permission_assignments
    where permission_key='platform.creator' and revoked_at is null
  loop
    perform public.sync_platform_creator_access(creator.user_id,creator.organization_id);
  end loop;
end $$;

alter table public.platform_student_affiliations enable row level security;
create policy platform_student_affiliations_self_read on public.platform_student_affiliations
for select to authenticated using(student_id=public.current_profile_user_id());

revoke all on function public.platform_save_student_affiliations(jsonb), public.sync_platform_creator_access(uuid,uuid) from public,anon;
grant select on public.platform_student_affiliations to authenticated;
grant execute on function public.platform_save_student_affiliations(jsonb) to authenticated;
grant execute on function public.sync_platform_creator_access(uuid,uuid) to service_role;

commit;
