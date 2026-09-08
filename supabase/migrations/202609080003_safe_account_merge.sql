begin;
create table public.pathway_account_merges (
 id uuid primary key default gen_random_uuid(), primary_user_id uuid not null references auth.users(id), secondary_user_id uuid not null unique references auth.users(id),
 actor_id uuid not null references auth.users(id), backup_reference text not null, manifest jsonb not null, created_at timestamptz not null default now()
);
alter table public.pathway_account_merges enable row level security;
revoke all on public.pathway_account_merges from anon,authenticated;
grant all on public.pathway_account_merges to service_role;

create function public.pathway_merge_preview(primary_user_id uuid,secondary_user_id uuid,actor_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public,evaluation,pg_temp as $$
declare a public.profiles; b public.profiles; issues jsonb:='[]'; counts jsonb:='{}'; t record; n bigint; pe text; se text;
begin
 select * into a from public.profiles where user_id=primary_user_id;
 select * into b from public.profiles where user_id=secondary_user_id;
 if not exists(select 1 from public.permission_assignments where user_id=actor_user_id and permission_key='platform.creator' and revoked_at is null and organization_id=a.active_organization_id)
 or not exists(select 1 from public.permission_assignments where user_id=actor_user_id and permission_key='accounts.manage' and revoked_at is null and organization_id=a.active_organization_id)
 then raise exception 'Creator account management permission required' using errcode='42501'; end if;
 select email into pe from auth.users where id=primary_user_id; select email into se from auth.users where id=secondary_user_id;
 if primary_user_id=secondary_user_id or a.user_id is null or b.user_id is null then issues:=issues||'"Choose two existing account profiles"'::jsonb; end if;
 if a.active_organization_id is distinct from b.active_organization_id or a.active_program_id is distinct from b.active_program_id then issues:=issues||'"Accounts belong to different programs or organizations"'::jsonb; end if;
 if exists(select 1 from public.account_auth_identities where auth_user_id in (primary_user_id,secondary_user_id) and canonical_user_id<>auth_user_id) then issues:=issues||'"Select canonical accounts rather than an already-linked sign-in identity"'::jsonb; end if;
 if exists(select 1 from public.account_lifecycle where user_id in (primary_user_id,secondary_user_id) and status<>'active') then issues:=issues||'"Resolve account retention or lifecycle holds before merging"'::jsonb; end if;
 if exists(select 1 from public.profile_analysis_attributes x join public.profile_analysis_attributes y on y.user_id=primary_user_id where x.user_id=secondary_user_id and (to_jsonb(x)-'user_id'-'updated_at')<>(to_jsonb(y)-'user_id'-'updated_at')) then issues:=issues||'"Research profile attributes conflict; evaluation review is required"'::jsonb; end if;
 if exists(select 1 from public.artifacts x join public.artifacts y on y.student_id=primary_user_id and y.artifact_type='staging_survey' and y.content->>'waveId'=x.content->>'waveId' where x.student_id=secondary_user_id and x.artifact_type='staging_survey') then issues:=issues||'"Both accounts contain a pilot survey for the same wave; evaluation review is required"'::jsonb; end if;
 if exists(select 1 from public.pathway_appointments where requester_id in (primary_user_id,secondary_user_id) and recipient_id in (primary_user_id,secondary_user_id)) then issues:=issues||'"Merging would create a self-appointment"'::jsonb; end if;
 if a.status in ('suspended','archived') or b.status in ('suspended','archived') then issues:=issues||'"Resolve account lifecycle restrictions before merging"'::jsonb; end if;
 if exists(select 1 from evaluation.assignments s join evaluation.assignments d on d.wave_id=s.wave_id where s.user_id=secondary_user_id and d.user_id=primary_user_id) then issues:=issues||'"Both accounts have assignments for the same survey wave; evaluation review is required"'::jsonb; end if;
 if exists(select 1 from public.attendance s join public.attendance d on d.session_id=s.session_id where s.student_id=secondary_user_id and d.student_id=primary_user_id and s.status<>d.status) then issues:=issues||'"Attendance statuses conflict for the same session"'::jsonb; end if;
 if exists(select 1 from public.role_assignments s join public.role_assignments d on d.role=s.role and d.organization_id=s.organization_id and d.program_id is not distinct from s.program_id and d.cohort_id is not distinct from s.cohort_id where s.user_id=secondary_user_id and d.user_id=primary_user_id and (s.revoked_at is null)<>(d.revoked_at is null)) then issues:=issues||'"Active and revoked role assignments conflict"'::jsonb; end if;
 if exists(select 1 from public.permission_assignments s join public.permission_assignments d on d.permission_key=s.permission_key and d.organization_id=s.organization_id and d.program_id is not distinct from s.program_id where s.user_id=secondary_user_id and d.user_id=primary_user_id and (s.revoked_at is null)<>(d.revoked_at is null)) then issues:=issues||'"Active and revoked permissions conflict"'::jsonb; end if;
 if exists(select 1 from public.principal_assignments s join public.principal_assignments d on d.user_id=primary_user_id where s.user_id=secondary_user_id and s.principal_type<>d.principal_type and s.revoked_at is null and d.revoked_at is null) then issues:=issues||'"Creator and PI must remain separate people"'::jsonb; end if;
 if exists(select 1 from public.pathway_conversations where participant_a=least(primary_user_id,secondary_user_id) and participant_b=greatest(primary_user_id,secondary_user_id)) or exists(select 1 from public.advisor_assignments where advisor_id in (primary_user_id,secondary_user_id) and student_id in (primary_user_id,secondary_user_id)) then issues:=issues||'"Merging would create a self-conversation or self-advisor assignment"'::jsonb; end if;
 if exists(select 1 from public.pathway_calendar_connections s join public.pathway_calendar_connections d on d.provider=s.provider and d.provider_account_id=s.provider_account_id where s.user_id=secondary_user_id and d.user_id=primary_user_id ) then issues:=issues||'"Disconnect duplicate calendar connections before merging"'::jsonb; end if;
 if exists(select 1 from public.pathway_conversations s join public.pathway_conversations d on d.program_id=s.program_id and d.kind='dm' and s.kind='dm' and (case when s.participant_a=secondary_user_id then s.participant_b else s.participant_a end)=(case when d.participant_a=primary_user_id then d.participant_b else d.participant_a end) where secondary_user_id in (s.participant_a,s.participant_b) and primary_user_id in (d.participant_a,d.participant_b)) then issues:=issues||'"Both accounts have a DM with the same person; conversation review is required"'::jsonb; end if;
 for t in select * from (values ('public','account_auth_identities','canonical_user_id'),('public','role_assignments','user_id'),('public','permission_assignments','user_id'),('public','attendance','student_id'),('public','artifacts','student_id'),('public','portfolio_documents','student_id'),('public','advising_packets','student_id'),('evaluation','assignments','user_id'),('evaluation','response_sets','user_id'),('public','pathway_page_views','user_id'),('public','pathway_support_reviews','student_id'),('public','pathway_calendar_connections','user_id'),('public','pathway_notifications','user_id')) as x(s,t,c) loop
   execute format('select count(*) from %I.%I where %I=$1',t.s,t.t,t.c) into n using secondary_user_id;
   counts:=counts||jsonb_build_object(t.t,n);
 end loop;
 -- Include every relationship to an authentication identity, including historical authorship.
 for t in select ns.nspname s,cl.relname t,at.attname c from pg_constraint fk join pg_class cl on cl.oid=fk.conrelid join pg_namespace ns on ns.oid=cl.relnamespace join pg_attribute at on at.attrelid=cl.oid and at.attnum=any(fk.conkey) where fk.contype='f' and fk.confrelid='auth.users'::regclass and ns.nspname in ('public','evaluation') loop
   execute format('select count(*) from %I.%I where %I=$1',t.s,t.t,t.c) into n using secondary_user_id;
   counts:=counts||jsonb_build_object(t.s||'.'||t.t||'.'||t.c,n);
 end loop;
 return jsonb_build_object('primaryUserId',primary_user_id,'secondaryUserId',secondary_user_id,'primaryEmail',pe,'secondaryEmail',se,'issues',issues,'counts',counts,'ready',jsonb_array_length(issues)=0);
end $$;

-- Ownership paths follow every linked authentication identity after a merge.
create or replace function public.portfolio_object_is_owned(object_name text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.account_auth_identities i join public.profiles f on f.user_id=i.canonical_user_id where i.canonical_user_id=public.current_profile_user_id() and i.auth_user_id::text=(storage.foldername(object_name))[1] and f.status in ('active','invited'));
$$;
create or replace function public.portfolio_object_is_shared(object_name text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.portfolio_documents d join public.packet_items i on i.item_type='portfolio_document' and i.item_id=d.id join public.advising_packets p on p.id=i.packet_id
 where (d.storage_path=object_name or exists(select 1 from public.portfolio_document_revisions r where r.document_id=d.id and r.storage_path=object_name))
 and p.advisor_id=public.current_profile_user_id() and p.status='active' and p.revoked_at is null and (p.expires_at is null or p.expires_at>now()) and public.staff_mfa_verified() and public.is_assigned_advisor(d.student_id,d.program_id));
$$;

create function public.pathway_merge_accounts(primary_user_id uuid,secondary_user_id uuid,actor_user_id uuid,backup_reference text) returns jsonb
language plpgsql security definer set search_path=public,evaluation,pg_temp as $$
declare preview jsonb; t record; snap jsonb:='{}'; rows jsonb; audit_id uuid;
begin
 if length(trim(backup_reference))<8 then raise exception 'A verified recoverable backup reference is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('account-merge',0));
 perform 1 from public.profiles where user_id in (primary_user_id,secondary_user_id) order by user_id for update;
 preview:=public.pathway_merge_preview(primary_user_id,secondary_user_id,actor_user_id);
 if not (preview->>'ready')::boolean then raise exception 'Merge blocked: %',preview->'issues'; end if;
 -- Preserve original authorship and an audit manifest; never delete auth users.
 insert into public.pathway_account_merges(primary_user_id,secondary_user_id,actor_id,backup_reference,manifest) values(primary_user_id,secondary_user_id,actor_user_id,backup_reference,preview) returning id into audit_id;
 update public.account_auth_identities set is_primary=false where canonical_user_id in (primary_user_id,secondary_user_id);
 update public.account_auth_identities set canonical_user_id=primary_user_id,is_primary=(auth_user_id=primary_user_id) where canonical_user_id in (primary_user_id,secondary_user_id);
 insert into public.role_assignments(user_id,role,organization_id,program_id,cohort_id,granted_by,granted_at,revoked_at)
 select primary_user_id,role,organization_id,program_id,cohort_id,granted_by,granted_at,revoked_at from public.role_assignments where user_id=secondary_user_id on conflict do nothing;
 insert into public.permission_assignments(user_id,permission_key,organization_id,program_id,granted_by,granted_at,revoked_at)
 select primary_user_id,permission_key,organization_id,program_id,granted_by,granted_at,revoked_at from public.permission_assignments where user_id=secondary_user_id on conflict do nothing;
 insert into public.enrollments(student_id,organization_id,program_id,cohort_id,status,enrolled_at)
 select primary_user_id,organization_id,program_id,cohort_id,status,enrolled_at from public.enrollments where student_id=secondary_user_id on conflict do nothing;
 -- Reuse the primary attendance row only for identical statuses, retaining both histories.
 update public.attendance_changes ch set attendance_id=d.id from public.attendance s,public.attendance d where ch.attendance_id=s.id and s.student_id=secondary_user_id and d.student_id=primary_user_id and s.session_id=d.session_id;
 update public.attendance s set student_id=primary_user_id where s.student_id=secondary_user_id and not exists(select 1 from public.attendance d where d.student_id=primary_user_id and d.session_id=s.session_id);
 insert into public.advisor_assignments(advisor_id,student_id,organization_id,program_id,cohort_id,starts_at,ends_at,created_by) select case when advisor_id=secondary_user_id then primary_user_id else advisor_id end,case when student_id=secondary_user_id then primary_user_id else student_id end,organization_id,program_id,cohort_id,starts_at,ends_at,created_by from public.advisor_assignments where advisor_id=secondary_user_id or student_id=secondary_user_id on conflict do nothing;
 -- Historical advisor rows remain attached to their original identity.
 /* update public.advisor_assignments set advisor_id=case when advisor_id=secondary_user_id then primary_user_id else advisor_id end,student_id=case when student_id=secondary_user_id then primary_user_id else student_id end where advisor_id=secondary_user_id or student_id=secondary_user_id; */
 for t in select * from (values ('public','artifacts','student_id'),('public','portfolio_documents','student_id'),('public','advising_packets','student_id'),('public','advising_packets','advisor_id'),('evaluation','assignments','user_id'),('evaluation','consent_records','user_id'),('evaluation','withdrawals','user_id'),('public','survey_completion_projection','user_id'),('public','grant_outcome_checkpoints','student_id'),('public','pathway_page_views','user_id'),('public','pathway_support_sources','student_id'),('public','pathway_support_reviews','student_id'),('public','pathway_notifications','user_id'),('public','pathway_calendar_connections','user_id'),('public','pathway_calendar_oauth_states','user_id'),('public','pathway_roster_imports','actor_id'),('public','pathway_roster_rows','user_id')) as x(s,t,c) loop
   execute format('update %I.%I set %I=$1 where %I=$2',t.s,t.t,t.c,t.c) using primary_user_id,secondary_user_id;
 end loop;
 -- Submitted responses retain their original user_id for immutable provenance;
 -- their assignment now belongs to the canonical account.
 update public.pathway_appointments set requester_id=case when requester_id=secondary_user_id then primary_user_id else requester_id end,recipient_id=case when recipient_id=secondary_user_id then primary_user_id else recipient_id end,
 proposal=case when proposal->>'requested_by'=secondary_user_id::text then jsonb_set(proposal,'{requested_by}',to_jsonb(primary_user_id)) else proposal end where requester_id=secondary_user_id or recipient_id=secondary_user_id;
 update public.pathway_conversations set participant_a=least(case when participant_a=secondary_user_id then primary_user_id else participant_a end,case when participant_b=secondary_user_id then primary_user_id else participant_b end),participant_b=greatest(case when participant_a=secondary_user_id then primary_user_id else participant_a end,case when participant_b=secondary_user_id then primary_user_id else participant_b end) where secondary_user_id in (participant_a,participant_b);
 insert into public.pathway_message_reads(conversation_id,user_id,read_at) select conversation_id,primary_user_id,read_at from public.pathway_message_reads where user_id=secondary_user_id on conflict(conversation_id,user_id) do update set read_at=greatest(pathway_message_reads.read_at,excluded.read_at);
 update public.principal_assignments set user_id=primary_user_id where user_id=secondary_user_id and not exists(select 1 from public.principal_assignments where user_id=primary_user_id);
 insert into public.account_lifecycle(user_id,organization_id,program_id,status,deactivated_by,deactivated_at,purge_eligible_at,restored_by,restored_at,retention_note,updated_at) select primary_user_id,organization_id,program_id,status,deactivated_by,deactivated_at,purge_eligible_at,restored_by,restored_at,retention_note,updated_at from public.account_lifecycle where user_id=secondary_user_id on conflict do nothing;
 insert into public.profile_analysis_attributes(user_id,organization_id,program_id,institution,class_year,first_generation,socioeconomic_indicator,gender,race_ethnicity,approved_for_analysis,consented_at,updated_at) select primary_user_id,organization_id,program_id,institution,class_year,first_generation,socioeconomic_indicator,gender,race_ethnicity,approved_for_analysis,consented_at,updated_at from public.profile_analysis_attributes where user_id=secondary_user_id on conflict do nothing;
 update public.profiles set status='archived',updated_at=now() where user_id=secondary_user_id;
 insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) select active_organization_id,actor_user_id,'account_identities_merged','profile',primary_user_id::text,preview||jsonb_build_object('mergeId',audit_id) from public.profiles where user_id=primary_user_id;
 return preview||jsonb_build_object('merged',true,'mergeId',audit_id);
end $$;

-- Retire the unsafe legacy entrypoint, including automatic merges from add-email.
create or replace function public.merge_pilot_auth_identities(primary_user_id uuid,secondary_user_id uuid,actor_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 raise exception 'Use the merge preview and provide a verified backup reference';
end $$;
revoke all on function public.pathway_merge_preview(uuid,uuid,uuid),public.pathway_merge_accounts(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.pathway_merge_preview(uuid,uuid,uuid),public.pathway_merge_accounts(uuid,uuid,uuid,text) to service_role;
commit;

