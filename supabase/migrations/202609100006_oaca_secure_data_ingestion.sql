begin;

-- CSV and legacy Excel MIME values are accepted only for controlled imports.
alter table public.platform_files drop constraint if exists platform_files_mime_type_check;
alter table public.platform_files add constraint platform_files_mime_type_check check (mime_type in (
  'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg','image/png','text/csv','application/csv','application/vnd.ms-excel'
));
update storage.buckets set allowed_mime_types=array[
  'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg','image/png','text/csv','application/csv','application/vnd.ms-excel'
] where id='platform-files';

create table public.oaca_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_id uuid not null references public.platform_files(id),
  source_system text not null check(source_system in ('penji','student_information_system','other')),
  dataset_type text not null check(dataset_type in ('student_roster','penji_sessions')),
  cohort_label text,
  period_starts_on date,
  period_ends_on date,
  contains_real_student_data boolean not null default true,
  schema_version integer not null default 1 check(schema_version>0),
  source_headers text[] not null default '{}',
  column_mapping jsonb not null default '{}'::jsonb,
  status text not null default 'awaiting_scan' check(status in ('awaiting_scan','needs_mapping','validating','ready_for_review','approved','importing','completed','completed_with_issues','failed','rejected')),
  total_rows integer not null default 0 check(total_rows>=0),
  valid_rows integer not null default 0 check(valid_rows>=0),
  invalid_rows integer not null default 0 check(invalid_rows>=0),
  matched_students integer not null default 0 check(matched_students>=0),
  quality_summary jsonb not null default '{}'::jsonb,
  requested_by uuid not null references public.profiles(user_id),
  reviewed_by uuid references public.profiles(user_id),
  reviewed_at timestamptz,
  processor_version text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(period_ends_on is null or period_starts_on is null or period_ends_on>=period_starts_on)
);

create table public.oaca_import_row_issues (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.oaca_import_batches(id) on delete cascade,
  row_number integer not null check(row_number>0),
  severity text not null check(severity in ('warning','error')),
  issue_code text not null,
  field_key text,
  message text not null,
  created_at timestamptz not null default now()
);

-- Raw external identifiers never enter reporting tables. Only SHA-256 hashes are retained here.
create table public.oaca_external_identity_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null,
  entity_kind text not null check(entity_kind in ('student','provider')),
  external_key_hash text not null check(external_key_hash ~ '^[0-9a-f]{64}$'),
  profile_id uuid references public.profiles(user_id) on delete set null,
  match_status text not null check(match_status in ('matched','unmatched','ambiguous','retired')),
  source_batch_id uuid not null references public.oaca_import_batches(id),
  matched_at timestamptz,
  unique(organization_id,source_system,entity_kind,external_key_hash)
);

create table public.oaca_student_dimensions (
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cohort_label text not null,
  expected_graduation_year integer check(expected_graduation_year between 2000 and 2200),
  program_start_date date,
  current_phase text,
  current_year text,
  campus text,
  enrollment_status text,
  effective_from date not null default current_date,
  effective_to date,
  source_batch_id uuid not null references public.oaca_import_batches(id),
  created_at timestamptz not null default now(),
  primary key(student_id,organization_id,effective_from),
  check(effective_to is null or effective_to>=effective_from)
);

create table public.oaca_historical_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_batch_id uuid not null references public.oaca_import_batches(id),
  source_session_hash text not null check(source_session_hash ~ '^[0-9a-f]{64}$'),
  student_id uuid references public.profiles(user_id) on delete set null,
  provider_id uuid references public.oaca_providers(id) on delete set null,
  source_created_at timestamptz,
  starts_at timestamptz not null,
  ends_at timestamptz,
  duration_minutes integer check(duration_minutes between 0 and 1440),
  service_key text not null check(service_key in ('academic_advising','career_advising','peer_tutoring','other')),
  course_or_subject text,
  topic_category text,
  session_format text,
  modality text,
  source_status text not null,
  attendance_count integer check(attendance_count between 0 and 100),
  reschedule_count integer check(reschedule_count between 0 and 100),
  cancelled_at timestamptz,
  exam_block_key text,
  cohort_label text,
  campus text,
  source_row_number integer not null check(source_row_number>0),
  imported_at timestamptz not null default now(),
  unique(organization_id,source_session_hash),
  check(ends_at is null or ends_at>=starts_at)
);

create table public.oaca_import_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null unique references public.oaca_import_batches(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','running','completed','failed')),
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  last_error_code text,
  created_at timestamptz not null default now()
);

create index oaca_import_batches_org_created_idx on public.oaca_import_batches(organization_id,created_at desc);
create index oaca_import_issues_batch_idx on public.oaca_import_row_issues(batch_id,severity,row_number);
create index oaca_historical_sessions_org_start_idx on public.oaca_historical_sessions(organization_id,starts_at);
create index oaca_historical_sessions_student_idx on public.oaca_historical_sessions(student_id,starts_at desc) where student_id is not null;
create index oaca_student_dimensions_cohort_idx on public.oaca_student_dimensions(organization_id,cohort_label,effective_from);

create function public.oaca_can_manage_imports(org uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.staff_mfa_verified() and (
    exists(select 1 from public.experience_role_assignments r where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.organization_id=org and r.role='administrator' and r.revoked_at is null)
    or exists(select 1 from public.experience_capability_assignments c where c.user_id=public.current_profile_user_id() and c.experience_key='oaca' and c.organization_id=org and c.capability='oaca.import.manage' and c.revoked_at is null)
  );
$$;

create function public.oaca_can_view_aggregate_analytics(org uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.staff_mfa_verified() and (
    exists(select 1 from public.experience_role_assignments r where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.organization_id=org and r.role='administrator' and r.revoked_at is null)
    or exists(select 1 from public.experience_capability_assignments c where c.user_id=public.current_profile_user_id() and c.experience_key='oaca' and c.organization_id=org and c.capability='oaca.analytics.aggregate' and c.revoked_at is null)
  );
$$;

create function public.oaca_create_import_batch(payload jsonb) returns public.oaca_import_batches
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=public.current_profile_user_id(); org uuid; f public.platform_files; result public.oaca_import_batches; dataset text:=payload->>'datasetType'; source text:=coalesce(nullif(payload->>'sourceSystem',''),'penji');
begin
  select r.organization_id into org from public.experience_role_assignments r join public.profiles p on p.user_id=r.user_id where r.user_id=actor and r.experience_key='oaca' and r.revoked_at is null and r.organization_id is not null order by (r.organization_id=p.active_organization_id) desc,(r.role='administrator') desc limit 1;
  if org is null or not public.oaca_can_manage_imports(org) then raise exception 'OACA import management capability and MFA are required' using errcode='42501'; end if;
  if dataset not in ('student_roster','penji_sessions') or source not in ('penji','student_information_system','other') then raise exception 'Choose a supported import type' using errcode='22023'; end if;
  select * into f from public.platform_files where id=(payload->>'fileId')::uuid and owner_id=actor and experience_key='oaca' and archived_at is null;
  if not found or f.mime_type not in ('text/csv','application/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') then raise exception 'Choose a private CSV or XLSX upload' using errcode='22023'; end if;
  insert into public.oaca_import_batches(organization_id,file_id,source_system,dataset_type,cohort_label,period_starts_on,period_ends_on,contains_real_student_data,source_headers,status,requested_by)
  values(org,f.id,source,dataset,nullif(left(coalesce(payload->>'cohortLabel',''),100),''),nullif(payload->>'periodStartsOn','')::date,nullif(payload->>'periodEndsOn','')::date,coalesce((payload->>'containsRealStudentData')::boolean,true),coalesce(array(select left(value,120) from jsonb_array_elements_text(coalesce(payload->'sourceHeaders','[]'::jsonb)) with ordinality h(value,position) where position<=100 and nullif(trim(value),'') is not null),'{}'),case when f.scan_status='clean' then 'needs_mapping' else 'awaiting_scan' end,actor)
  returning * into result;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,actor,'oaca_import_created','oaca_import_batch',result.id,jsonb_build_object('datasetType',dataset,'sourceSystem',source,'fileId',f.id,'containsRealStudentData',result.contains_real_student_data),'oaca');
  return result;
end $$;

create function public.oaca_save_import_mapping(payload jsonb) returns public.oaca_import_batches
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=public.current_profile_user_id(); batch public.oaca_import_batches; f public.platform_files; mapping jsonb:=coalesce(payload->'columnMapping','{}'::jsonb); result public.oaca_import_batches; required_keys text[]; allowed_keys text[];
begin
  select * into batch from public.oaca_import_batches where id=(payload->>'batchId')::uuid;
  if not found or not public.oaca_can_manage_imports(batch.organization_id) then raise exception 'This import is outside your authorized scope' using errcode='42501'; end if;
  select * into f from public.platform_files where id=batch.file_id;
  if f.scan_status<>'clean' then raise exception 'The original file must pass its security scan before mapping' using errcode='23514'; end if;
  if batch.dataset_type='penji_sessions' then
    required_keys:=array['source_session_id','student_external_id','session_start_at','service_type','status'];
    allowed_keys:=array['source_session_id','student_external_id','provider_external_id','session_created_at','session_start_at','session_end_at','duration_minutes','service_type','course_or_subject','topic_category','format','modality','status','attendance_count','exam_block_key','cohort_label','campus','reschedule_count','cancelled_at'];
  else
    required_keys:=array['student_external_id','cohort_label','expected_graduation_year'];
    allowed_keys:=array['student_external_id','institutional_email','cohort_label','expected_graduation_year','program_start_date','current_phase','current_year','campus','active_status'];
  end if;
  if not (mapping ?& required_keys) or exists(select 1 from jsonb_array_elements_text(to_jsonb(required_keys)) k where nullif(mapping->>k,'') is null)
     or exists(select 1 from jsonb_object_keys(mapping) k where not (k=any(allowed_keys)))
     or (batch.dataset_type='penji_sessions' and nullif(mapping->>'session_end_at','') is null and nullif(mapping->>'duration_minutes','') is null)
  then raise exception 'Complete the required mapping without unsupported or duplicate analytic fields' using errcode='23514'; end if;
  if exists(select 1 from jsonb_each_text(mapping) a join jsonb_each_text(mapping) b on a.key<b.key and lower(a.value)=lower(b.value)) then raise exception 'One source column cannot map to two fields' using errcode='23514'; end if;
  update public.oaca_import_batches set column_mapping=mapping,status='ready_for_review',updated_at=now() where id=batch.id returning * into result;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(batch.organization_id,actor,'oaca_import_mapping_saved','oaca_import_batch',batch.id,jsonb_build_object('schemaVersion',batch.schema_version,'mappedFields',(select count(*) from jsonb_object_keys(mapping))),'oaca');
  return result;
end $$;

create function public.oaca_review_import_batch(payload jsonb) returns public.oaca_import_batches
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=public.current_profile_user_id(); batch public.oaca_import_batches; decision text:=payload->>'decision'; result public.oaca_import_batches;
begin
  select * into batch from public.oaca_import_batches where id=(payload->>'batchId')::uuid for update;
  if not found or not public.oaca_can_manage_imports(batch.organization_id) then raise exception 'This import is outside your authorized scope' using errcode='42501'; end if;
  if batch.status<>'ready_for_review' or decision not in ('approve','reject') then raise exception 'This import is not ready for that decision' using errcode='23514'; end if;
  if decision='approve' and batch.contains_real_student_data and batch.requested_by=actor then raise exception 'A second authorized reviewer must approve real student data' using errcode='42501'; end if;
  update public.oaca_import_batches set status=case when decision='approve' then 'approved' else 'rejected' end,reviewed_by=actor,reviewed_at=now(),updated_at=now() where id=batch.id returning * into result;
  if decision='approve' then insert into public.oaca_import_jobs(batch_id) values(batch.id) on conflict(batch_id) do nothing; end if;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(batch.organization_id,actor,'oaca_import_'||case when decision='approve' then 'approved' else 'rejected' end,'oaca_import_batch',batch.id,jsonb_build_object('containsRealStudentData',batch.contains_real_student_data),'oaca');
  return result;
end $$;

-- A trusted background processor calls this RPC with normalized rows only. It is not exposed to signed-in clients.
create function public.oaca_process_import_batch(batch_id uuid, normalized_rows jsonb, processor_version text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare batch public.oaca_import_batches; row_data jsonb; n integer:=0; valid integer:=0; invalid integer:=0; matched integer:=0; student_hash text; provider_hash text; session_hash text; student_profile uuid; provider_profile uuid; provider_key uuid; start_time timestamptz; end_time timestamptz; duration integer; service text; email text;
begin
  select * into batch from public.oaca_import_batches where id=batch_id for update;
  if not found or batch.status not in ('approved','importing') then raise exception 'Import batch is not approved'; end if;
  update public.oaca_import_batches set status='importing',started_at=coalesce(started_at,now()),processor_version=left(processor_version,100),updated_at=now() where id=batch.id;
  delete from public.oaca_import_row_issues where oaca_import_row_issues.batch_id=batch.id;
  for row_data in select value from jsonb_array_elements(coalesce(normalized_rows,'[]'::jsonb)) loop
    n:=n+1; student_profile:=null; provider_profile:=null; provider_key:=null;
    begin
      student_hash:=encode(digest(batch.source_system||':'||lower(trim(row_data->>'student_external_id')),'sha256'),'hex');
      if nullif(row_data->>'student_external_id','') is null then raise exception 'student_external_id is required'; end if;
      if batch.dataset_type='student_roster' then
        email:=lower(trim(coalesce(row_data->>'institutional_email','')));
        if email<>'' then select canonical_user_id into student_profile from public.account_auth_identities where lower(account_auth_identities.email)=email limit 1; end if;
        insert into public.oaca_external_identity_links(organization_id,source_system,entity_kind,external_key_hash,profile_id,match_status,source_batch_id,matched_at)
        values(batch.organization_id,batch.source_system,'student',student_hash,student_profile,case when student_profile is null then 'unmatched' else 'matched' end,batch.id,case when student_profile is not null then now() end)
        on conflict(organization_id,source_system,entity_kind,external_key_hash) do update set profile_id=coalesce(excluded.profile_id,oaca_external_identity_links.profile_id),match_status=case when coalesce(excluded.profile_id,oaca_external_identity_links.profile_id) is null then 'unmatched' else 'matched' end,source_batch_id=excluded.source_batch_id,matched_at=case when coalesce(excluded.profile_id,oaca_external_identity_links.profile_id) is not null then now() end;
        if student_profile is not null then
          insert into public.oaca_student_dimensions(student_id,organization_id,cohort_label,expected_graduation_year,program_start_date,current_phase,current_year,campus,enrollment_status,effective_from,source_batch_id)
          values(student_profile,batch.organization_id,left(row_data->>'cohort_label',100),nullif(row_data->>'expected_graduation_year','')::integer,nullif(row_data->>'program_start_date','')::date,nullif(left(coalesce(row_data->>'current_phase',''),60),''),nullif(left(coalesce(row_data->>'current_year',''),20),''),nullif(left(coalesce(row_data->>'campus',''),120),''),nullif(left(coalesce(row_data->>'active_status',''),60),''),coalesce(nullif(row_data->>'effective_from','')::date,batch.period_starts_on,current_date),batch.id)
          on conflict(student_id,organization_id,effective_from) do update set cohort_label=excluded.cohort_label,expected_graduation_year=excluded.expected_graduation_year,program_start_date=excluded.program_start_date,current_phase=excluded.current_phase,current_year=excluded.current_year,campus=excluded.campus,enrollment_status=excluded.enrollment_status,source_batch_id=excluded.source_batch_id;
          matched:=matched+1;
        end if;
      else
        select profile_id into student_profile from public.oaca_external_identity_links where organization_id=batch.organization_id and source_system=batch.source_system and entity_kind='student' and external_key_hash=student_hash and match_status='matched';
        if student_profile is null and position('@' in row_data->>'student_external_id')>1 then select i.canonical_user_id into student_profile from public.account_auth_identities i where lower(i.email)=lower(trim(row_data->>'student_external_id')) limit 1; end if;
        insert into public.oaca_external_identity_links(organization_id,source_system,entity_kind,external_key_hash,profile_id,match_status,source_batch_id,matched_at)
        values(batch.organization_id,batch.source_system,'student',student_hash,student_profile,case when student_profile is null then 'unmatched' else 'matched' end,batch.id,case when student_profile is not null then now() end)
        on conflict(organization_id,source_system,entity_kind,external_key_hash) do update set profile_id=coalesce(excluded.profile_id,oaca_external_identity_links.profile_id),match_status=case when coalesce(excluded.profile_id,oaca_external_identity_links.profile_id) is null then 'unmatched' else 'matched' end,source_batch_id=excluded.source_batch_id,matched_at=case when coalesce(excluded.profile_id,oaca_external_identity_links.profile_id) is not null then now() end;
        if nullif(row_data->>'provider_external_id','') is not null then
          provider_hash:=encode(digest(batch.source_system||':'||lower(trim(row_data->>'provider_external_id')),'sha256'),'hex');
          select profile_id into provider_profile from public.oaca_external_identity_links where organization_id=batch.organization_id and source_system=batch.source_system and entity_kind='provider' and external_key_hash=provider_hash and match_status='matched';
          if provider_profile is null and position('@' in row_data->>'provider_external_id')>1 then select i.canonical_user_id into provider_profile from public.account_auth_identities i where lower(i.email)=lower(trim(row_data->>'provider_external_id')) limit 1; end if;
          insert into public.oaca_external_identity_links(organization_id,source_system,entity_kind,external_key_hash,profile_id,match_status,source_batch_id,matched_at)
          values(batch.organization_id,batch.source_system,'provider',provider_hash,provider_profile,case when provider_profile is null then 'unmatched' else 'matched' end,batch.id,case when provider_profile is not null then now() end)
          on conflict(organization_id,source_system,entity_kind,external_key_hash) do update set profile_id=coalesce(excluded.profile_id,oaca_external_identity_links.profile_id),match_status=case when coalesce(excluded.profile_id,oaca_external_identity_links.profile_id) is null then 'unmatched' else 'matched' end,source_batch_id=excluded.source_batch_id,matched_at=case when coalesce(excluded.profile_id,oaca_external_identity_links.profile_id) is not null then now() end;
          select id into provider_key from public.oaca_providers where organization_id=batch.organization_id and user_id=provider_profile limit 1;
        end if;
        session_hash:=encode(digest(batch.source_system||':'||trim(row_data->>'source_session_id'),'sha256'),'hex');
        start_time:=(row_data->>'session_start_at')::timestamptz;
        end_time:=nullif(row_data->>'session_end_at','')::timestamptz;
        duration:=nullif(row_data->>'duration_minutes','')::integer;
        if duration is null and end_time is not null then duration:=round(extract(epoch from (end_time-start_time))/60); end if;
        if end_time is null and duration is not null then end_time:=start_time+make_interval(mins=>duration); end if;
        service:=case when lower(coalesce(row_data->>'service_type','')) like '%tutor%' then 'peer_tutoring' when lower(coalesce(row_data->>'service_type','')) like '%career%' then 'career_advising' when lower(coalesce(row_data->>'service_type','')) like '%advis%' then 'academic_advising' else 'other' end;
        insert into public.oaca_historical_sessions(organization_id,import_batch_id,source_session_hash,student_id,provider_id,source_created_at,starts_at,ends_at,duration_minutes,service_key,course_or_subject,topic_category,session_format,modality,source_status,attendance_count,reschedule_count,cancelled_at,exam_block_key,cohort_label,campus,source_row_number)
        values(batch.organization_id,batch.id,session_hash,student_profile,provider_key,nullif(row_data->>'session_created_at','')::timestamptz,start_time,end_time,duration,service,nullif(left(coalesce(row_data->>'course_or_subject',''),160),''),nullif(left(coalesce(row_data->>'topic_category',''),120),''),nullif(left(coalesce(row_data->>'format',''),60),''),nullif(left(coalesce(row_data->>'modality',''),60),''),left(row_data->>'status',60),coalesce(nullif(row_data->>'attendance_count','')::integer,case when lower(row_data->>'status') in ('completed','attended') then 1 else 0 end),coalesce(nullif(row_data->>'reschedule_count','')::integer,0),nullif(row_data->>'cancelled_at','')::timestamptz,nullif(left(coalesce(row_data->>'exam_block_key',''),100),''),coalesce(nullif(left(coalesce(row_data->>'cohort_label',''),100),''),batch.cohort_label),nullif(left(coalesce(row_data->>'campus',''),120),''),n)
        on conflict(organization_id,source_session_hash) do nothing;
        if student_profile is not null then matched:=matched+1; else insert into public.oaca_import_row_issues(batch_id,row_number,severity,issue_code,field_key,message) values(batch.id,n,'warning','student_unmatched','student_external_id','Student could not be matched; the session remains excluded from student-level views.'); end if;
      end if;
      valid:=valid+1;
    exception when others then
      invalid:=invalid+1;
      insert into public.oaca_import_row_issues(batch_id,row_number,severity,issue_code,field_key,message) values(batch.id,n,'error','row_validation_failed',null,'Row failed normalized schema validation; no raw value was retained.');
    end;
  end loop;
  update public.oaca_import_batches set status=case when invalid>0 then 'completed_with_issues' else 'completed' end,total_rows=n,valid_rows=valid,invalid_rows=invalid,matched_students=matched,quality_summary=jsonb_build_object('validRows',valid,'invalidRows',invalid,'matchedStudentRows',matched,'notesImported',false),completed_at=now(),updated_at=now() where id=batch.id;
  update public.oaca_import_jobs set status='completed',attempts=attempts+1,locked_until=null where oaca_import_jobs.batch_id=batch.id;
  insert into public.audit_events(organization_id,event_type,subject_type,subject_id,metadata,experience_key) values(batch.organization_id,'oaca_import_completed','oaca_import_batch',batch.id,jsonb_build_object('totalRows',n,'validRows',valid,'invalidRows',invalid,'matchedStudentRows',matched,'processorVersion',left(processor_version,100)),'oaca');
  return jsonb_build_object('batchId',batch.id,'totalRows',n,'validRows',valid,'invalidRows',invalid,'matchedStudentRows',matched);
end $$;

create function public.oaca_aggregate_analytics(payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid; minimum_group integer:=10; from_date date:=nullif(payload->>'from','')::date; to_date date:=nullif(payload->>'to','')::date; result jsonb;
begin
  select r.organization_id into org from public.experience_role_assignments r join public.profiles p on p.user_id=r.user_id where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.revoked_at is null and r.organization_id is not null order by (r.organization_id=p.active_organization_id) desc limit 1;
  if org is null or not public.oaca_can_view_aggregate_analytics(org) then raise exception 'Aggregate analytics capability and MFA are required' using errcode='42501'; end if;
  select jsonb_build_object(
    'minimumGroupSize',minimum_group,
    'coverageStart',(select min(starts_at) from public.oaca_historical_sessions where organization_id=org),
    'coverageEnd',(select max(starts_at) from public.oaca_historical_sessions where organization_id=org),
    'totals',(select jsonb_build_object('sessions',count(*),'studentCount',count(distinct student_id),'hours',round(coalesce(sum(duration_minutes),0)::numeric/60,1),'completionRate',case when count(*)=0 then null else round(100.0*count(*) filter(where lower(source_status) in ('completed','attended'))/count(*),1) end,'noShowRate',case when count(*)=0 then null else round(100.0*count(*) filter(where lower(source_status) in ('no_show','no show'))/count(*),1) end,'rescheduleRate',case when count(*)=0 then null else round(100.0*count(*) filter(where reschedule_count>0)/count(*),1) end,'averageWaitDays',round(avg(extract(epoch from (starts_at-source_created_at))/86400)::numeric,1)) from public.oaca_historical_sessions where organization_id=org and (from_date is null or starts_at>=from_date) and (to_date is null or starts_at<to_date+1)),
    'services',coalesce((select jsonb_agg(jsonb_build_object('serviceKey',service_key,'studentCount',student_count,'sessions',case when student_count<minimum_group then null else sessions end,'hours',case when student_count<minimum_group then null else hours end,'suppressed',student_count<minimum_group) order by service_key) from (select service_key,count(distinct student_id) student_count,count(*) sessions,round(coalesce(sum(duration_minutes),0)::numeric/60,1) hours from public.oaca_historical_sessions where organization_id=org and (from_date is null or starts_at>=from_date) and (to_date is null or starts_at<to_date+1) group by service_key) grouped),'[]'::jsonb),
    'cohorts',coalesce((select jsonb_agg(jsonb_build_object('cohortLabel',cohort_label,'studentCount',student_count,'sessions',case when student_count<minimum_group then null else sessions end,'hours',case when student_count<minimum_group then null else hours end,'noShowRate',case when student_count<minimum_group then null else no_show_rate end,'suppressed',student_count<minimum_group) order by cohort_label) from (select coalesce(s.cohort_label,d.cohort_label,'Unassigned') cohort_label,count(distinct s.student_id) student_count,count(*) sessions,round(coalesce(sum(s.duration_minutes),0)::numeric/60,1) hours,round(100.0*count(*) filter(where lower(s.source_status) in ('no_show','no show'))/nullif(count(*),0),1) no_show_rate from public.oaca_historical_sessions s left join lateral (select cohort_label from public.oaca_student_dimensions d where d.student_id=s.student_id and d.organization_id=s.organization_id and d.effective_from<=s.starts_at::date and (d.effective_to is null or d.effective_to>=s.starts_at::date) order by d.effective_from desc limit 1) d on true where s.organization_id=org and (from_date is null or s.starts_at>=from_date) and (to_date is null or s.starts_at<to_date+1) group by coalesce(s.cohort_label,d.cohort_label,'Unassigned')) grouped),'[]'::jsonb)
  ) into result;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_aggregate_analytics_viewed','oaca_analytics',jsonb_build_object('from',from_date,'to',to_date,'minimumGroupSize',minimum_group),'oaca');
  return result;
end $$;

alter table public.oaca_import_batches enable row level security;
alter table public.oaca_import_row_issues enable row level security;
alter table public.oaca_external_identity_links enable row level security;
alter table public.oaca_student_dimensions enable row level security;
alter table public.oaca_historical_sessions enable row level security;
alter table public.oaca_import_jobs enable row level security;

create policy oaca_import_batches_managers on public.oaca_import_batches for select to authenticated using(public.oaca_can_manage_imports(organization_id));
create policy oaca_import_issues_managers on public.oaca_import_row_issues for select to authenticated using(exists(select 1 from public.oaca_import_batches b where b.id=batch_id and public.oaca_can_manage_imports(b.organization_id)));
create policy oaca_student_dimensions_owner_or_assigned on public.oaca_student_dimensions for select to authenticated using(student_id=public.current_profile_user_id() or exists(select 1 from public.oaca_advisor_assignments a join public.oaca_providers p on p.id=a.provider_id where a.student_id=oaca_student_dimensions.student_id and a.ended_at is null and p.user_id=public.current_profile_user_id() and p.organization_id=oaca_student_dimensions.organization_id));
create policy oaca_historical_sessions_owner_or_assigned on public.oaca_historical_sessions for select to authenticated using(student_id=public.current_profile_user_id() or exists(select 1 from public.oaca_advisor_assignments a join public.oaca_providers p on p.id=a.provider_id where a.student_id=oaca_historical_sessions.student_id and a.ended_at is null and p.user_id=public.current_profile_user_id() and p.organization_id=oaca_historical_sessions.organization_id));

revoke all on public.oaca_import_batches,public.oaca_import_row_issues,public.oaca_external_identity_links,public.oaca_student_dimensions,public.oaca_historical_sessions,public.oaca_import_jobs from anon,authenticated;
grant select on public.oaca_import_batches,public.oaca_import_row_issues,public.oaca_student_dimensions,public.oaca_historical_sessions to authenticated;
grant all on public.oaca_import_batches,public.oaca_import_row_issues,public.oaca_external_identity_links,public.oaca_student_dimensions,public.oaca_historical_sessions,public.oaca_import_jobs to service_role;
revoke all on function public.oaca_can_manage_imports(uuid),public.oaca_can_view_aggregate_analytics(uuid),public.oaca_create_import_batch(jsonb),public.oaca_save_import_mapping(jsonb),public.oaca_review_import_batch(jsonb),public.oaca_process_import_batch(uuid,jsonb,text),public.oaca_aggregate_analytics(jsonb) from public,anon;
grant execute on function public.oaca_can_manage_imports(uuid),public.oaca_can_view_aggregate_analytics(uuid),public.oaca_create_import_batch(jsonb),public.oaca_save_import_mapping(jsonb),public.oaca_review_import_batch(jsonb),public.oaca_aggregate_analytics(jsonb) to authenticated;
grant execute on function public.oaca_process_import_batch(uuid,jsonb,text) to service_role;

commit;
