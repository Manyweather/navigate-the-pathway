begin;

-- Additive access-model extensions for the Roseman staff pilot.
alter table public.experiences drop constraint if exists experiences_key_check;
alter table public.experiences add constraint experiences_key_check check (key in ('pathway','oaca','genesis','facilities'));
insert into public.experiences (key,name,settings) values
  ('facilities','Facilities Dashboard','{"featureFlag":"experience.facilities"}')
on conflict (key) do update set name=excluded.name,settings=public.experiences.settings || excluded.settings;
insert into public.experience_feature_flags (experience_key,enabled,sandbox_only) values
  ('facilities',true,true)
on conflict (experience_key) do nothing;

alter table public.experience_role_assignments drop constraint if exists experience_role_assignments_role_check;
alter table public.experience_role_assignments add constraint experience_role_assignments_role_check check (role in ('student','advisor','faculty','staff','administrator','creator','principal_investigator','mentor','community_liaison','requester'));

alter table public.pilot_staff_roster_entries add column if not exists role_title text;
alter table public.pilot_staff_roster_entries add column if not exists view_bundle jsonb not null default '{}'::jsonb;
alter table public.pilot_staff_roster_entries drop constraint if exists pilot_staff_roster_entries_roles_check;
alter table public.pilot_staff_roster_entries add constraint pilot_staff_roster_entries_roles_check check (roles <@ array['advisor','administrator','faculty','staff','creator','principal_investigator']::text[]);
alter table public.pilot_staff_roster_entries add constraint pilot_staff_roster_entries_access_check check (cardinality(roles) > 0 or jsonb_typeof(workspace_roles) = 'object');

create index if not exists pilot_staff_roster_source_idx on public.pilot_staff_roster_entries(organization_id,source_id);

create or replace function public.current_experience_memberships()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'experienceKey', grouped.experience_key,
    'experienceName', e.name,
    'roles', grouped.roles,
    'capabilities', grouped.capabilities,
    'status', 'active',
    'featureEnabled', coalesce(f.enabled, false),
    'sandboxOnly', coalesce(f.sandbox_only, true)
  ) order by case grouped.experience_key when 'pathway' then 1 when 'oaca' then 2 when 'genesis' then 3 else 4 end), '[]'::jsonb)
  from (
    select r.experience_key, jsonb_agg(distinct r.role) as roles,
      coalesce((select jsonb_agg(distinct c.capability) from public.experience_capability_assignments c
        where c.user_id = public.current_profile_user_id() and c.experience_key = r.experience_key and c.revoked_at is null), '[]'::jsonb) as capabilities
    from public.experience_role_assignments r
    where r.user_id = public.current_profile_user_id() and r.revoked_at is null
    group by r.experience_key
  ) grouped
  join public.experiences e on e.key = grouped.experience_key and e.status = 'active'
  left join public.experience_feature_flags f on f.experience_key = grouped.experience_key;
$$;

create or replace function public.require_experience_membership(requested_experience text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if requested_experience not in ('pathway','oaca','genesis','facilities') then raise exception 'Unknown experience' using errcode = '22023'; end if;
  if not exists (select 1 from public.experience_role_assignments where user_id = public.current_profile_user_id() and experience_key = requested_experience and revoked_at is null)
  then raise exception 'Experience membership required' using errcode = '42501'; end if;
end $$;

create or replace function public.pilot_approve_sso_identity(pending_user_id uuid, roster_entry_id uuid, actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare pending_record public.pilot_pending_sso_identities%rowtype; roster_record public.pilot_staff_roster_entries%rowtype; workspace record; workspace_role text; core_role text; capability text;
begin
  if not exists(select 1 from public.permission_assignments where user_id=actor_user_id and permission_key='platform.creator' and revoked_at is null) then raise exception 'Creator permission is required' using errcode='42501'; end if;
  select * into pending_record from public.pilot_pending_sso_identities where auth_user_id=pending_user_id for update;
  select * into roster_record from public.pilot_staff_roster_entries where id=roster_entry_id for update;
  if pending_record.auth_user_id is null or pending_record.status<>'pending' then raise exception 'Choose one pending SSO identity' using errcode='23514'; end if;
  if roster_record.id is null or roster_record.status<>'approved' then raise exception 'Choose one approved roster entry' using errcode='23514'; end if;
  if pending_record.email<>roster_record.email then raise exception 'The SSO identity must exactly match the roster email' using errcode='23514'; end if;
  if exists(select 1 from public.pilot_pending_sso_identities where email=pending_record.email and status='pending' and auth_user_id<>pending_record.auth_user_id) then raise exception 'More than one pending identity uses this email; review the identity provider records first' using errcode='23514'; end if;
  insert into public.profiles(user_id,display_name,active_organization_id,active_program_id,active_cohort_id,status) values(pending_record.auth_user_id,roster_record.display_name,roster_record.organization_id,roster_record.program_id,roster_record.cohort_id,'active') on conflict(user_id) do update set display_name=excluded.display_name,active_organization_id=excluded.active_organization_id,active_program_id=excluded.active_program_id,active_cohort_id=excluded.active_cohort_id,status='active',updated_at=now();
  update public.account_auth_identities set canonical_user_id=pending_record.auth_user_id,is_primary=true,verified_at=coalesce(verified_at,now()) where auth_user_id=pending_record.auth_user_id;
  foreach core_role in array roster_record.roles loop
    if core_role in ('advisor','administrator','faculty','staff') then
      insert into public.role_assignments(user_id,role,organization_id,program_id,cohort_id,granted_by,revoked_at) values(pending_record.auth_user_id,core_role,roster_record.organization_id,roster_record.program_id,roster_record.cohort_id,actor_user_id,null) on conflict(user_id,role,organization_id,program_id,cohort_id) do update set revoked_at=null,granted_by=actor_user_id,granted_at=now();
    end if;
  end loop;
  for workspace in select key,value from jsonb_each(roster_record.workspace_roles) loop
    if workspace.key not in ('pathway','oaca','genesis','facilities') or jsonb_typeof(workspace.value)<>'array' then raise exception 'Roster workspace roles are invalid' using errcode='22023'; end if;
    for workspace_role in select jsonb_array_elements_text(workspace.value) loop
      insert into public.experience_role_assignments(user_id,experience_key,role,organization_id,program_id,cohort_id,granted_by,revoked_at) values(pending_record.auth_user_id,workspace.key,workspace_role,roster_record.organization_id,roster_record.program_id,roster_record.cohort_id,actor_user_id,null) on conflict(user_id,experience_key,role,organization_id,program_id,cohort_id) do update set revoked_at=null,granted_by=actor_user_id,granted_at=now();
    end loop;
  end loop;
  for capability in select jsonb_array_elements_text(coalesce(roster_record.view_bundle->'capabilities','[]'::jsonb)) loop
    insert into public.experience_capability_assignments(user_id,experience_key,capability,organization_id,program_id,granted_by,revoked_at) values(pending_record.auth_user_id,'oaca',capability,roster_record.organization_id,roster_record.program_id,actor_user_id,null) on conflict(user_id,experience_key,capability,organization_id,program_id) do update set revoked_at=null,granted_by=actor_user_id,granted_at=now();
  end loop;
  if 'creator'=any(roster_record.roles) then insert into public.permission_assignments(user_id,permission_key,organization_id,program_id,granted_by,revoked_at) values(pending_record.auth_user_id,'platform.creator',roster_record.organization_id,roster_record.program_id,actor_user_id,null) on conflict(user_id,permission_key,organization_id,program_id) do update set revoked_at=null,granted_by=actor_user_id,granted_at=now(); end if;
  if 'principal_investigator'=any(roster_record.roles) then insert into public.permission_assignments(user_id,permission_key,organization_id,program_id,granted_by,revoked_at) values(pending_record.auth_user_id,'platform.principal_investigator',roster_record.organization_id,roster_record.program_id,actor_user_id,null) on conflict(user_id,permission_key,organization_id,program_id) do update set revoked_at=null,granted_by=actor_user_id,granted_at=now(); end if;
  update public.pilot_pending_sso_identities set status='approved',matched_roster_entry_id=roster_record.id,reviewed_by=actor_user_id,reviewed_at=now() where auth_user_id=pending_record.auth_user_id;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(roster_record.organization_id,actor_user_id,'sso_identity_roster_approved','auth_user',pending_record.auth_user_id::text,jsonb_build_object('rosterEntryId',roster_record.id,'email',roster_record.email,'ssoProviderId',pending_record.sso_provider_id));
  return jsonb_build_object('userId',pending_record.auth_user_id,'email',pending_record.email,'rosterEntryId',roster_record.id,'status','approved');
end $$;

commit;
