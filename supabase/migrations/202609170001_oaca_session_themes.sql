begin;

alter table public.oaca_import_batches
  add column dataset_mode text not null default 'live' check(dataset_mode in ('live','demo')),
  add column import_timezone text not null default 'America/Los_Angeles',
  add column narrative_processing boolean not null default false,
  add column theme_rule_version text not null default 'compass-themes-v1';
alter table public.oaca_historical_sessions
  add column dataset_mode text not null default 'live' check(dataset_mode in ('live','demo')),
  add column student_key_hash text,
  add column provider_key_hash text,
  add column source_attendance text,
  add column submitted_duration_minutes numeric,
  add column note_state text not null default 'disabled' check(note_state in ('disabled','missing','uncategorized','categorized')),
  add column theme_matches jsonb not null default '[]',
  add column theme_override text[],
  add column theme_reviewed_by uuid references public.profiles(user_id),
  add column theme_reviewed_at timestamptz;
alter table public.oaca_historical_sessions alter column duration_minutes type numeric using duration_minutes::numeric;
create index oaca_sessions_mode_student on public.oaca_historical_sessions(organization_id,dataset_mode,student_key_hash,starts_at);

create table public.oaca_session_narratives (
  session_id uuid primary key references public.oaca_historical_sessions(id) on delete cascade,
  fields jsonb not null,
  rule_version text not null,
  created_at timestamptz not null default now()
);
alter table public.oaca_session_narratives enable row level security;
revoke all on public.oaca_session_narratives from public,anon,authenticated;
grant all on public.oaca_session_narratives to service_role;

create function public.oaca_can_read_imported_narrative(target uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.staff_mfa_verified() and exists (
   select 1 from public.oaca_historical_sessions s where s.id=target and (
     (s.dataset_mode='demo' and public.oaca_can_manage_imports(s.organization_id)) or
     (s.dataset_mode='live' and exists(select 1 from public.oaca_advisor_assignments a join public.oaca_providers p on p.id=a.provider_id
       where a.student_id=s.student_id and a.ended_at is null and p.user_id=public.current_profile_user_id() and p.organization_id=s.organization_id))
   )
 );
$$;
create policy oaca_narratives_assigned on public.oaca_session_narratives for select to authenticated using(public.oaca_can_read_imported_narrative(session_id));
grant select on public.oaca_session_narratives to authenticated;

-- Preserve the original entry points internally; their wrappers validate new metadata.
alter function public.oaca_create_import_batch(jsonb) rename to oaca_create_import_batch_v1;
revoke all on function public.oaca_create_import_batch_v1(jsonb) from public,anon,authenticated;
create function public.oaca_create_import_batch(payload jsonb) returns public.oaca_import_batches
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.oaca_import_batches; mode text:=coalesce(payload->>'datasetMode','live'); zone text:=coalesce(payload->>'timezone','America/Los_Angeles');
begin
 if mode not in ('live','demo') or not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Choose a valid dataset mode and IANA timezone'; end if;
 if mode='demo' and payload->>'datasetType'<>'penji_sessions' then raise exception 'Demo mode supports session history'; end if;
 b:=public.oaca_create_import_batch_v1(payload||jsonb_build_object('containsRealStudentData',mode='live'));
 update public.oaca_import_batches set dataset_mode=mode,import_timezone=zone,narrative_processing=coalesce((payload->>'narrativeProcessing')::boolean,false),schema_version=2 where id=b.id returning * into b;
 return b;
end $$;

alter function public.oaca_save_import_mapping(jsonb) rename to oaca_save_import_mapping_v1;
revoke all on function public.oaca_save_import_mapping_v1(jsonb) from public,anon,authenticated;
create function public.oaca_save_import_mapping(payload jsonb) returns public.oaca_import_batches
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.oaca_import_batches;
begin
 select * into b from public.oaca_import_batches where id=(payload->>'batchId')::uuid for update;
 if not found or not public.oaca_can_manage_imports(b.organization_id) then raise exception 'Import access denied' using errcode='42501'; end if;
 if b.status not in ('awaiting_scan','needs_mapping','ready_for_review') then raise exception 'Mapping is locked after review'; end if;
 if exists(select 1 from jsonb_each_text(payload->'columnMapping') m where m.value is not null and not(m.value=any(b.source_headers))) then raise exception 'Mapped columns must exist in the source'; end if;
 return public.oaca_save_import_mapping_v1(payload);
end $$;

-- Scan state is never bypassed, including on a retry or a demo import.
create function public.oaca_import_preview_source(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.oaca_import_batches; f public.platform_files;
begin
 select * into b from public.oaca_import_batches where id=(payload->>'batchId')::uuid;
 if not found or not public.oaca_can_manage_imports(b.organization_id) then raise exception 'Import access denied' using errcode='42501'; end if;
 select * into f from public.platform_files where id=b.file_id;
 if f.scan_status<>'clean' or b.dataset_type<>'penji_sessions' then raise exception 'A scanned session CSV is required'; end if;
 return jsonb_build_object('storagePath',f.storage_path,'originalName',f.original_name,'timezone',b.import_timezone,'narrativeProcessing',b.narrative_processing,'columnMapping',b.column_mapping,'cohortLabel',b.cohort_label);
end $$;

create function public.oaca_claim_session_import() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.oaca_import_jobs; b public.oaca_import_batches;
begin
 update public.oaca_import_batches pending_batch set status='needs_mapping' from public.platform_files f where pending_batch.file_id=f.id and pending_batch.status='awaiting_scan' and f.scan_status='clean';
 update public.oaca_import_jobs set status='failed',last_error_code='retry_limit',locked_until=null where status='running' and locked_until<now() and attempts>=3;
 update public.oaca_import_batches failed_batch set status='failed' from public.oaca_import_jobs failed_job where failed_job.batch_id=failed_batch.id and failed_job.status='failed' and failed_batch.status in ('approved','importing');
 select * into j from public.oaca_import_jobs where attempts<3 and ((status='pending' and run_after<=now()) or (status='running' and locked_until<now())) order by run_after for update skip locked limit 1;
 if not found then return null; end if;
 select * into b from public.oaca_import_batches where id=j.batch_id;
 update public.oaca_import_jobs set status='running',attempts=attempts+1,locked_until=now()+interval '5 minutes' where id=j.id;
 return to_jsonb(b)||jsonb_build_object('job_id',j.id,'attempt',j.attempts+1);
end $$;

create function public.oaca_fail_session_import(job_id uuid, error_code text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.oaca_import_jobs;
begin
 update public.oaca_import_jobs set status=case when attempts>=3 then 'failed' else 'pending' end,run_after=now()+interval '1 minute'*power(2,attempts),locked_until=null,last_error_code=case when error_code in ('security_scan_incomplete','unsupported_file','invalid_csv','import_failed') then error_code else 'import_failed' end where id=job_id returning * into j;
 if j.status='failed' then update public.oaca_import_batches set status='failed',quality_summary=jsonb_build_object('errorCode',j.last_error_code) where id=j.batch_id; end if;
end $$;

create function public.oaca_retry_session_import(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.oaca_import_batches;
begin
 select * into b from public.oaca_import_batches where id=(payload->>'batchId')::uuid for update;
 if not found or not public.oaca_can_manage_imports(b.organization_id) then raise exception 'Import access denied' using errcode='42501'; end if;
 if b.status<>'failed' or b.reviewed_at is null or not exists(select 1 from public.platform_files where id=b.file_id and scan_status='clean') then raise exception 'Only a reviewed, clean, failed import can be retried'; end if;
 update public.oaca_import_jobs set status='pending',attempts=0,run_after=now(),locked_until=null,last_error_code=null where batch_id=b.id;
 update public.oaca_import_batches set status='approved' where id=b.id;
 insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,experience_key) values(b.organization_id,public.current_profile_user_id(),'oaca_import_retried','oaca_import_batch',b.id,'oaca');
 return jsonb_build_object('queued',true);
end $$;

alter function public.oaca_process_import_batch(uuid,jsonb,text) rename to oaca_process_import_batch_v1;
revoke all on function public.oaca_process_import_batch_v1(uuid,jsonb,text) from public,anon,authenticated,service_role;
create function public.oaca_process_import_batch(batch_id uuid, normalized_rows jsonb, processor_version text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.oaca_import_batches; r jsonb; issue jsonb; sid uuid; student uuid; student_hash text; session_hash text; added integer:=0; duplicates integer:=0; invalid integer:=0; matched integer:=0; n integer:=0; service text; result jsonb;
begin
 select * into b from public.oaca_import_batches where id=batch_id for update;
 if not found or b.status not in ('approved','importing') then raise exception 'Import batch is not approved'; end if;
 if not exists(select 1 from public.platform_files where id=b.file_id and scan_status='clean') then raise exception 'Original must pass security scan'; end if;
 if b.dataset_type='student_roster' then return public.oaca_process_import_batch_v1(batch_id,normalized_rows,processor_version); end if;
 update public.oaca_import_batches set status='importing',started_at=coalesce(started_at,now()) where id=b.id;
 delete from public.oaca_import_row_issues where oaca_import_row_issues.batch_id=b.id;
 for r in select value from jsonb_array_elements(normalized_rows) loop
   n:=n+1; sid:=null; student:=null;
   begin
     for issue in select value from jsonb_array_elements(coalesce(r->'issues','[]')) loop
       insert into public.oaca_import_row_issues(batch_id,row_number,severity,issue_code,message) values(b.id,coalesce((r->>'source_row_number')::integer,n),issue->>'severity',issue->>'code',issue->>'message');
     end loop;
     if exists(select 1 from jsonb_array_elements(coalesce(r->'issues','[]')) i where i->>'severity'='error') then invalid:=invalid+1; continue; end if;
     if nullif(r->>'source_session_id','') is null or nullif(r->>'student_external_id','') is null or nullif(r->>'status','') is null then raise exception 'Missing required values'; end if;
     student_hash:=encode(digest(b.source_system||':'||lower(trim(r->>'student_external_id')),'sha256'),'hex');
     -- Live hashes remain compatible with earlier imports; demo keys have a separate namespace.
     session_hash:=encode(digest(case when b.dataset_mode='demo' then 'demo:' else '' end||b.source_system||':'||trim(r->>'source_session_id'),'sha256'),'hex');
     if b.dataset_mode='live' then
       select l.profile_id into student from public.oaca_external_identity_links l where l.organization_id=b.organization_id and l.source_system=b.source_system and l.entity_kind='student' and l.external_key_hash=student_hash and l.match_status='matched';
       if student is null and position('@' in r->>'student_external_id')>1 then
         select i.canonical_user_id into student from public.account_auth_identities i where lower(i.email)=lower(trim(r->>'student_external_id')) and exists(select 1 from public.experience_role_assignments a where a.user_id=i.canonical_user_id and a.organization_id=b.organization_id and a.experience_key='oaca' and a.role='student' and a.revoked_at is null) limit 1;
       end if;
     end if;
     service:=case when lower(r->>'service_type') like '%tutor%' then 'peer_tutoring' when lower(r->>'service_type') like '%career%' then 'career_advising' when lower(r->>'service_type') like '%advis%' then 'academic_advising' else 'other' end;
     insert into public.oaca_historical_sessions(organization_id,import_batch_id,source_session_hash,student_id,student_key_hash,provider_key_hash,dataset_mode,source_created_at,starts_at,ends_at,duration_minutes,submitted_duration_minutes,service_key,course_or_subject,session_format,modality,source_status,source_attendance,attendance_count,cohort_label,cancelled_at,source_row_number,note_state,theme_matches)
     values(b.organization_id,b.id,session_hash,student,student_hash,case when nullif(r->>'provider_external_id','') is not null then encode(digest(b.source_system||':'||lower(trim(r->>'provider_external_id')),'sha256'),'hex') end,b.dataset_mode,nullif(r->>'session_created_at','')::timestamptz,(r->>'session_start_at')::timestamptz,nullif(r->>'session_end_at','')::timestamptz,(r->>'duration_minutes')::numeric,nullif(r->>'submitted_duration_minutes','')::numeric,service,left(r->>'course_or_subject',160),left(r->>'format',60),left(r->>'modality',60),left(r->>'status',60),left(r->>'source_attendance',60),case lower(r->>'source_attendance') when 'present' then 1 when 'absent' then 0 else null end,coalesce(nullif(r->>'cohort_label',''),b.cohort_label),nullif(r->>'cancelled_at','')::timestamptz,coalesce((r->>'source_row_number')::integer,n),case when b.narrative_processing then coalesce(r->'theme_analysis'->>'state','missing') else 'disabled' end,case when b.narrative_processing then coalesce(r->'theme_analysis'->'matches','[]') else '[]' end)
     on conflict(organization_id,source_session_hash) do nothing returning id into sid;
     if sid is null then duplicates:=duplicates+1; continue; end if;
     if b.narrative_processing and coalesce(r->'narrative_fields','{}')<>'{}'::jsonb then
       insert into public.oaca_session_narratives(session_id,fields,rule_version) values(sid,r->'narrative_fields',b.theme_rule_version);
     end if;
     added:=added+1;
     if student is not null then matched:=matched+1; end if;
   exception when others then
     invalid:=invalid+1;
     insert into public.oaca_import_row_issues(batch_id,row_number,severity,issue_code,message) values(b.id,coalesce((r->>'source_row_number')::integer,n),'error','row_validation_failed','Row failed normalized schema validation; no raw value was retained.');
   end;
 end loop;
 result:=jsonb_build_object('insertedRows',added,'duplicateRows',duplicates,'invalidRows',invalid,'matchedStudentRows',matched,'datasetMode',b.dataset_mode,'themeRuleVersion',b.theme_rule_version);
 update public.oaca_import_batches set status=case when invalid>0 then 'completed_with_issues' else 'completed' end,total_rows=n,valid_rows=added+duplicates,invalid_rows=invalid,matched_students=matched,quality_summary=result,processor_version=left(oaca_process_import_batch.processor_version,100),completed_at=now(),updated_at=now() where id=b.id;
 update public.oaca_import_jobs set status='completed',locked_until=null,last_error_code=null where oaca_import_jobs.batch_id=b.id;
 insert into public.audit_events(organization_id,event_type,subject_type,subject_id,metadata,experience_key) values(b.organization_id,'oaca_import_completed','oaca_import_batch',b.id,result,'oaca');
 return result;
end $$;

create function public.oaca_imported_narratives(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; target uuid:=(payload->>'sessionId')::uuid;
begin
 if not public.oaca_can_read_imported_narrative(target) then raise exception 'Assigned student access is required' using errcode='42501'; end if;
 select jsonb_build_object('sessionId',s.id,'fields',coalesce(n.fields,'{}'),'matches',s.theme_matches,'override',s.theme_override,'ruleVersion',n.rule_version) into result from public.oaca_historical_sessions s left join public.oaca_session_narratives n on n.session_id=s.id where s.id=target;
 insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,experience_key) select organization_id,public.current_profile_user_id(),'oaca_narrative_viewed','oaca_historical_session',id,'oaca' from public.oaca_historical_sessions where id=target;
 return result;
end $$;

create function public.oaca_review_session_themes(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid:=(payload->>'sessionId')::uuid; chosen text[];
begin
 if not public.oaca_can_read_imported_narrative(target) then raise exception 'Assigned student access is required' using errcode='42501'; end if;
 if jsonb_typeof(payload->'themes')<>'array' then raise exception 'Choose theme categories'; end if;
 select array_agg(distinct value) into chosen from jsonb_array_elements_text(payload->'themes'); chosen:=coalesce(chosen,'{}');
 if not(chosen<@array['study_strategies','exam_preparation','time_management','academic_planning','wellbeing','study_environment','tutoring_resources','career_exploration','follow_up']) then raise exception 'Unsupported theme'; end if;
 update public.oaca_historical_sessions set theme_override=chosen,theme_reviewed_by=public.current_profile_user_id(),theme_reviewed_at=now() where id=target;
 insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) select organization_id,public.current_profile_user_id(),'oaca_themes_reviewed','oaca_historical_session',id,jsonb_build_object('themes',chosen),'oaca' from public.oaca_historical_sessions where id=target;
 return jsonb_build_object('saved',true);
end $$;

-- Bounded, access-controlled navigation to notes; identifiers never enter aggregate output.
create function public.oaca_narrative_review_list(payload jsonb) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (
   select s.id as "sessionId",s.starts_at as "startsAt",s.source_row_number as "sourceRow",s.note_state as "noteState",s.theme_reviewed_at as "reviewedAt"
   from public.oaca_historical_sessions s where s.import_batch_id=(payload->>'batchId')::uuid and public.oaca_can_read_imported_narrative(s.id)
   order by s.source_row_number limit 100 offset greatest(0,coalesce((payload->>'offset')::integer,0))
 ) t;
$$;

revoke all on function public.oaca_can_read_imported_narrative(uuid),public.oaca_create_import_batch(jsonb),public.oaca_save_import_mapping(jsonb),public.oaca_claim_session_import(),public.oaca_fail_session_import(uuid,text),public.oaca_retry_session_import(jsonb),public.oaca_process_import_batch(uuid,jsonb,text),public.oaca_imported_narratives(jsonb),public.oaca_review_session_themes(jsonb),public.oaca_narrative_review_list(jsonb) from public,anon,authenticated;
grant execute on function public.oaca_can_read_imported_narrative(uuid),public.oaca_create_import_batch(jsonb),public.oaca_save_import_mapping(jsonb),public.oaca_retry_session_import(jsonb),public.oaca_imported_narratives(jsonb),public.oaca_review_session_themes(jsonb),public.oaca_narrative_review_list(jsonb) to authenticated;
grant execute on function public.oaca_claim_session_import(),public.oaca_fail_session_import(uuid,text),public.oaca_process_import_batch(uuid,jsonb,text) to service_role;
revoke all on function public.oaca_import_preview_source(jsonb) from public,anon;
grant execute on function public.oaca_import_preview_source(jsonb) to authenticated;

commit;
