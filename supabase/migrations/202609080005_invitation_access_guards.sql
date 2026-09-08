begin;
alter table public.permissions enable row level security;
revoke insert,update,delete,truncate,references,trigger on public.permissions from anon,authenticated;
create policy permission_catalog_read on public.permissions for select to authenticated using (true);

-- Apply the same access boundary to the existing invitation RPC as roster imports.
create or replace function public.admin_assign_invited_user(target_user_id uuid,target_email text,target_roles text[],target_organization_id uuid,target_program_id uuid,target_cohort_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=public.current_profile_user_id(); assigned_role text;
begin
 if not public.staff_mfa_verified() or not public.has_role('administrator',target_organization_id,target_program_id,target_cohort_id) or not public.has_capability('accounts.manage',target_organization_id,target_program_id) then raise exception 'Administrator MFA, account management and scope are required' using errcode='42501'; end if;
 if actor=target_user_id then raise exception 'Use another principal to change your own access' using errcode='42501'; end if;
 if exists(select 1 from public.permission_assignments where user_id=target_user_id and permission_key in ('platform.creator','platform.principal_investigator') and revoked_at is null) then raise exception 'Principal access is managed through principal governance' using errcode='42501'; end if;
 if target_program_id is null or not exists(select 1 from public.programs where id=target_program_id and organization_id=target_organization_id) or (target_cohort_id is not null and not exists(select 1 from public.cohorts where id=target_cohort_id and program_id=target_program_id and organization_id=target_organization_id)) then raise exception 'Invalid program or cohort'; end if;
 if exists(select 1 from public.profiles where user_id=target_user_id and (active_organization_id<>target_organization_id or active_program_id<>target_program_id)) then raise exception 'Account belongs to another scope' using errcode='42501'; end if;
 if not exists(select 1 from public.account_auth_identities where auth_user_id=target_user_id and canonical_user_id=target_user_id and email=lower(target_email)) then raise exception 'Use the canonical account and primary email'; end if;
 if cardinality(target_roles) not between 1 and 3 then raise exception 'Choose assigned roles'; end if;
 insert into public.profiles(user_id,display_name,active_organization_id,active_program_id,active_cohort_id) values(target_user_id,split_part(target_email,'@',1),target_organization_id,target_program_id,target_cohort_id) on conflict(user_id) do nothing;
 foreach assigned_role in array target_roles loop
   if assigned_role not in ('student','advisor','administrator') then raise exception 'Invalid role'; end if;
   insert into public.role_assignments(user_id,role,organization_id,program_id,cohort_id,granted_by) values(target_user_id,assigned_role,target_organization_id,target_program_id,target_cohort_id,actor) on conflict do nothing;
 end loop;
 insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(target_organization_id,actor,'account_invited','profile',target_user_id::text,jsonb_build_object('roles',target_roles));return '{"ok":true}';
end $$;
revoke all on function public.admin_assign_invited_user(uuid,text,text[],uuid,uuid,uuid) from public,anon;
grant execute on function public.admin_assign_invited_user(uuid,text,text[],uuid,uuid,uuid) to authenticated;
commit;
