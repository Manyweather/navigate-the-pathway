begin;

create or replace function public.pilot_approve_sso_identity(pending_user_id uuid, roster_entry_id uuid, actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare pending_record public.pilot_pending_sso_identities%rowtype; roster_record public.pilot_staff_roster_entries%rowtype; workspace record; workspace_role text; core_role text; roster_capability text;
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
  for roster_capability in select jsonb_array_elements_text(coalesce(roster_record.view_bundle->'capabilities','[]'::jsonb)) loop
    insert into public.experience_capability_assignments(user_id,experience_key,capability,organization_id,program_id,granted_by,revoked_at) values(pending_record.auth_user_id,'oaca',roster_capability,roster_record.organization_id,roster_record.program_id,actor_user_id,null) on conflict(user_id,experience_key,capability,organization_id,program_id) do update set revoked_at=null,granted_by=actor_user_id,granted_at=now();
  end loop;
  if 'creator'=any(roster_record.roles) then insert into public.permission_assignments(user_id,permission_key,organization_id,program_id,granted_by,revoked_at) values(pending_record.auth_user_id,'platform.creator',roster_record.organization_id,roster_record.program_id,actor_user_id,null) on conflict(user_id,permission_key,organization_id,program_id) do update set revoked_at=null,granted_by=actor_user_id,granted_at=now(); end if;
  if 'principal_investigator'=any(roster_record.roles) then insert into public.permission_assignments(user_id,permission_key,organization_id,program_id,granted_by,revoked_at) values(pending_record.auth_user_id,'platform.principal_investigator',roster_record.organization_id,roster_record.program_id,actor_user_id,null) on conflict(user_id,permission_key,organization_id,program_id) do update set revoked_at=null,granted_by=actor_user_id,granted_at=now(); end if;
  update public.pilot_pending_sso_identities set status='approved',matched_roster_entry_id=roster_record.id,reviewed_by=actor_user_id,reviewed_at=now() where auth_user_id=pending_record.auth_user_id;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(roster_record.organization_id,actor_user_id,'sso_identity_roster_approved','auth_user',pending_record.auth_user_id::text,jsonb_build_object('rosterEntryId',roster_record.id,'email',roster_record.email,'ssoProviderId',pending_record.sso_provider_id));
  return jsonb_build_object('userId',pending_record.auth_user_id,'email',pending_record.email,'rosterEntryId',roster_record.id,'status','approved');
end $$;

-- Roster changes and their corresponding grants commit together. Historical
-- assignments are revoked, never deleted, and other organization scopes remain.
create function public.pilot_reconcile_roster_access(roster_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  r public.pilot_staff_roster_entries%rowtype;
  identity record; target uuid; allowed boolean; workspace record; value text;
begin
  select * into strict r from public.pilot_staff_roster_entries where id=roster_id for update;
  for identity in select * from public.pilot_pending_sso_identities where matched_roster_entry_id=r.id loop
    select canonical_user_id into target from public.account_auth_identities where auth_user_id=identity.auth_user_id;
    target := coalesce(target,identity.auth_user_id);
    allowed := r.status='approved' and identity.status='approved' and identity.email=r.email;

    update public.role_assignments set revoked_at=now()
      where user_id=target and organization_id=r.organization_id and program_id is not distinct from r.program_id
      and cohort_id is not distinct from r.cohort_id and revoked_at is null
      and (not allowed or not (role=any(r.roles)));
    update public.experience_role_assignments a set revoked_at=now()
      where user_id=target and organization_id=r.organization_id and program_id is not distinct from r.program_id
      and cohort_id is not distinct from r.cohort_id and revoked_at is null
      and (not allowed or not coalesce((r.workspace_roles->a.experience_key) ? a.role,false));
    update public.experience_capability_assignments a set revoked_at=now()
      where user_id=target and experience_key='oaca' and organization_id=r.organization_id
      and program_id is not distinct from r.program_id and revoked_at is null
      and (not allowed or not coalesce((r.view_bundle->'capabilities') ? a.capability,false));
    update public.permission_assignments set revoked_at=now()
      where user_id=target and organization_id=r.organization_id and program_id is not distinct from r.program_id
      and revoked_at is null and permission_key in ('platform.creator','platform.principal_investigator')
      and (not allowed or not (replace(permission_key,'platform.','')=any(r.roles)));

    if allowed then
      update public.profiles set display_name=r.display_name,updated_at=now() where user_id=target;
      foreach value in array r.roles loop
        if value in ('advisor','administrator','faculty','staff') then
          insert into public.role_assignments(user_id,role,organization_id,program_id,cohort_id,granted_by)
            values(target,value,r.organization_id,r.program_id,r.cohort_id,r.approved_by)
            on conflict(user_id,role,organization_id,program_id,cohort_id) do update set revoked_at=null,granted_by=excluded.granted_by,granted_at=now();
        end if;
        if value in ('creator','principal_investigator') then
          insert into public.permission_assignments(user_id,permission_key,organization_id,program_id,granted_by)
            values(target,'platform.'||value,r.organization_id,r.program_id,r.approved_by)
            on conflict(user_id,permission_key,organization_id,program_id) do update set revoked_at=null,granted_by=excluded.granted_by,granted_at=now();
        end if;
      end loop;
      for workspace in select entry.key,entry.value from jsonb_each(r.workspace_roles) entry loop
        for value in select jsonb_array_elements_text(workspace.value) loop
          insert into public.experience_role_assignments(user_id,experience_key,role,organization_id,program_id,cohort_id,granted_by)
            values(target,workspace.key,value,r.organization_id,r.program_id,r.cohort_id,r.approved_by)
            on conflict(user_id,experience_key,role,organization_id,program_id,cohort_id) do update set revoked_at=null,granted_by=excluded.granted_by,granted_at=now();
        end loop;
      end loop;
      for value in select jsonb_array_elements_text(coalesce(r.view_bundle->'capabilities','[]'::jsonb)) loop
        insert into public.experience_capability_assignments(user_id,experience_key,capability,organization_id,program_id,granted_by)
          values(target,'oaca',value,r.organization_id,r.program_id,r.approved_by)
          on conflict(user_id,experience_key,capability,organization_id,program_id) do update set revoked_at=null,granted_by=excluded.granted_by,granted_at=now();
      end loop;
    end if;
  end loop;
end $$;
revoke all on function public.pilot_reconcile_roster_access(uuid) from public,anon,authenticated;

create function public.pilot_roster_access_changed() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_table_name='pilot_staff_roster_entries' then
    perform public.pilot_reconcile_roster_access(new.id);
    insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata)
      values(new.organization_id,new.approved_by,'roster_grants_reconciled','sso_roster_entry',new.id::text,jsonb_build_object('status',new.status));
  elsif new.matched_roster_entry_id is not null then
    perform public.pilot_reconcile_roster_access(new.matched_roster_entry_id);
  end if;
  return new;
end $$;
revoke all on function public.pilot_roster_access_changed() from public,anon,authenticated;
create trigger pilot_roster_reconcile after update of email,display_name,roles,workspace_roles,view_bundle,status
  on public.pilot_staff_roster_entries for each row execute function public.pilot_roster_access_changed();
create trigger pilot_identity_reconcile after update of status,matched_roster_entry_id,email
  on public.pilot_pending_sso_identities for each row
  when (old.status is distinct from new.status or old.matched_roster_entry_id is distinct from new.matched_roster_entry_id or old.email is distinct from new.email)
  execute function public.pilot_roster_access_changed();

commit;
