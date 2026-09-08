begin;
create or replace function public.pathway_pair(a uuid,b uuid,o uuid,p uuid,for_dm boolean default false) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare sa boolean; sb boolean; pol public.pathway_communication_policy;
begin
 if a=b then return false; end if;
 sa:=public.pathway_role(a,'student',o,p); sb:=public.pathway_role(b,'student',o,p);
 if sa and sb then return false; end if;
 select * into pol from public.pathway_communication_policy where program_id=p;
 if (sa or sb) and (not for_dm or coalesce(pol.student_advisor,true)) and exists(
   select 1 from public.advisor_assignments x where x.organization_id=o and x.program_id=p
   and x.student_id=case when sa then a else b end and x.advisor_id=case when sa then b else a end
   and public.pathway_role(x.advisor_id,'advisor',o,p,x.cohort_id) and public.pathway_role(x.student_id,'student',o,p,x.cohort_id)
   and x.starts_at<=now() and (x.ends_at is null or x.ends_at>now())) then return true; end if;
 -- A multi-role administrator may still contact a non-student advisor in scope.
 -- The unconditional two-student denial above always takes precedence.
 return (not for_dm or coalesce(pol.administrator_advisor,true)) and exists(
   select 1 from public.role_assignments ra join public.role_assignments rb on ra.organization_id=rb.organization_id
   where ra.user_id=a and rb.user_id=b and ra.organization_id=o and (ra.program_id is null or ra.program_id=p)
   and (rb.program_id is null or rb.program_id=p) and ra.revoked_at is null and rb.revoked_at is null
   and (ra.cohort_id is null or rb.cohort_id is null or ra.cohort_id=rb.cohort_id)
   and ((ra.role='administrator' and rb.role='advisor') or (ra.role='advisor' and rb.role='administrator'))
   and public.pathway_role(a,ra.role,o,p) and public.pathway_role(b,rb.role,o,p));
end $$;

create function public.pathway_guard_creator() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_table_name='principal_assignments' then
   if old.principal_type<>'creator' or old.revoked_at is not null then return coalesce(new,old); end if;
   if tg_op='UPDATE' and new.principal_type='creator' and new.revoked_at is null and new.organization_id=old.organization_id then return new; end if;
   if not exists(select 1 from public.principal_assignments where organization_id=old.organization_id and principal_type='creator' and revoked_at is null and id<>old.id) then raise exception 'The last Creator cannot be removed' using errcode='42501'; end if;
 elsif tg_table_name='permission_assignments' then
   if old.permission_key<>'platform.creator' or old.revoked_at is not null then return coalesce(new,old); end if;
   if tg_op='UPDATE' and new.permission_key='platform.creator' and new.revoked_at is null and new.user_id=old.user_id and new.organization_id=old.organization_id then return new; end if;
   if exists(select 1 from public.principal_assignments where user_id=old.user_id and organization_id=old.organization_id and principal_type='creator' and revoked_at is null) then raise exception 'Transfer Creator ownership through principal governance first' using errcode='42501'; end if;
 end if;
 return coalesce(new,old);
end $$;
create trigger preserve_last_creator before delete or update on public.principal_assignments for each row execute function public.pathway_guard_creator();
create trigger preserve_creator_permission before delete or update on public.permission_assignments for each row execute function public.pathway_guard_creator();
revoke all on function public.pathway_guard_creator() from public,anon,authenticated;
commit;
