begin;

-- Additive Peer Tutor and Tutoring Manager operations. Existing appointments,
-- Penji history, and legacy tutor session logs remain unchanged.
update public.experiences
set settings = settings || '{"peerTutoringWorkspace":"pilot_flagged","peerTutoringProductionEnabled":false}'::jsonb,
    updated_at = now()
where key = 'oaca';

create table if not exists public.oaca_tutor_qualifications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.oaca_providers(id) on delete cascade,
  subject text not null,
  modalities text[] not null default array['in_person']::text[],
  effective_from date not null default current_date,
  effective_through date,
  granted_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  check (effective_through is null or effective_through >= effective_from),
  unique nulls not distinct (provider_id, subject, effective_from, effective_through)
);

create table if not exists public.oaca_tutor_availability_profiles (
  provider_id uuid primary key references public.oaca_providers(id) on delete cascade,
  active boolean not null default true,
  default_duration_minutes integer not null default 60 check (default_duration_minutes in (30,45,60)),
  buffer_before_minutes integer not null default 10 check (buffer_before_minutes between 0 and 60),
  buffer_after_minutes integer not null default 10 check (buffer_after_minutes between 0 and 60),
  timezone text not null default 'America/Los_Angeles',
  updated_by uuid not null references public.profiles(user_id),
  updated_at timestamptz not null default now()
);

create table if not exists public.oaca_tutor_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.oaca_providers(id) on delete cascade,
  exception_date date not null,
  exception_kind text not null check (exception_kind in ('add','remove')),
  starts_at time not null,
  ends_at time not null,
  modalities text[] not null default '{}',
  location text,
  note text not null default '',
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.oaca_tutoring_request_escalations (
  appointment_id uuid primary key references public.oaca_appointments(id) on delete cascade,
  response_due_at timestamptz not null,
  tutor_reminded_at timestamptz,
  manager_alerted_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(user_id),
  resolution text,
  created_at timestamptz not null default now()
);

create table if not exists public.oaca_tutoring_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid unique references public.oaca_appointments(id) on delete cascade,
  provider_id uuid not null references public.oaca_providers(id),
  session_type text not null check (session_type in ('individual','group','review','drop_in')),
  subject text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','cancelled')),
  checkin_opened_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  log_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.oaca_tutoring_session_participants (
  session_id uuid not null references public.oaca_tutoring_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  attendance_status text not null default 'not_recorded' check (attendance_status in ('present','no_show','excused','not_recorded')),
  attendance_source text not null default 'manual' check (attendance_source in ('manual','permanent_qr','import')),
  attendance_version integer not null default 1,
  recorded_by uuid references public.profiles(user_id),
  recorded_at timestamptz,
  primary key (session_id, student_id)
);

create table if not exists public.oaca_tutoring_attendance_versions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.oaca_tutoring_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  version integer not null,
  prior_status text,
  attendance_status text not null check (attendance_status in ('present','no_show','excused','not_recorded')),
  source text not null,
  changed_by uuid not null references public.profiles(user_id),
  changed_at timestamptz not null default now(),
  unique (session_id, student_id, version)
);

create table if not exists public.oaca_tutor_session_log_revisions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.oaca_tutoring_sessions(id) on delete cascade,
  version integer not null,
  tutoring_minutes integer not null check (tutoring_minutes between 1 and 60),
  prep_minutes integer not null default 0 check (prep_minutes between 0 and 180),
  topics text not null,
  session_summary text not null,
  understanding text not null default '',
  challenges text not null default '',
  recommendations text not null default '',
  authored_by uuid not null references public.profiles(user_id),
  submitted_at timestamptz not null default now(),
  unique (session_id, version)
);

create table if not exists public.oaca_tutor_session_log_addenda (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.oaca_tutoring_sessions(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  authored_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now()
);

create table if not exists public.oaca_tutoring_recap_revisions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.oaca_tutoring_sessions(id) on delete cascade,
  version integer not null,
  body text not null,
  next_steps text not null default '',
  published_by uuid not null references public.profiles(user_id),
  published_at timestamptz not null default now(),
  unique (session_id, version)
);

create table if not exists public.oaca_tutoring_group_offerings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  subject text not null,
  offering_type text not null check (offering_type in ('group','review')),
  provider_id uuid not null references public.oaca_providers(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  modality text not null default 'in_person' check (modality in ('in_person','teams')),
  location text,
  capacity integer not null check (capacity between 3 and 8),
  status text not null default 'draft' check (status in ('draft','published','cancelled','completed')),
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.oaca_tutoring_group_registrations (
  offering_id uuid not null references public.oaca_tutoring_group_offerings(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null check (status in ('registered','waitlisted','cancelled','attended','no_show','excused')),
  queue_position integer,
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (offering_id, student_id)
);

create table if not exists public.oaca_tutoring_dropin_rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  subject text not null,
  location text not null,
  modality text not null default 'in_person' check (modality in ('in_person','teams')),
  capacity integer not null default 8 check (capacity between 1 and 8),
  active boolean not null default true,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now()
);

create table if not exists public.oaca_tutoring_dropin_coverage (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.oaca_tutoring_dropin_rooms(id) on delete cascade,
  provider_id uuid not null references public.oaca_providers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','open','closed','cancelled')),
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.oaca_tutoring_dropin_queue (
  id uuid primary key default gen_random_uuid(),
  coverage_id uuid not null references public.oaca_tutoring_dropin_coverage(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','called','in_session','completed','skipped','left')),
  notify_when_next boolean not null default false,
  joined_at timestamptz not null default now(),
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  unique (coverage_id, student_id)
);

create table if not exists public.oaca_tutoring_feedback_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  version integer not null,
  form_schema jsonb not null,
  status text not null default 'draft' check (status in ('draft','published','retired')),
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (organization_id, title, version)
);

create table if not exists public.oaca_tutoring_feedback_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.oaca_tutoring_feedback_forms(id),
  session_id uuid not null references public.oaca_tutoring_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  answers jsonb not null,
  reported_concern boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (form_id, session_id, student_id)
);

create table if not exists public.oaca_tutoring_supervisory_accesses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.oaca_tutoring_sessions(id) on delete cascade,
  accessed_by uuid not null references public.profiles(user_id),
  purpose text not null,
  accessed_at timestamptz not null default now()
);

alter table public.oaca_threads add column if not exists tutoring_session_id uuid references public.oaca_tutoring_sessions(id) on delete cascade;
alter table public.oaca_threads drop constraint if exists oaca_threads_kind_check;
alter table public.oaca_threads add constraint oaca_threads_kind_check check(kind in ('appointment','service_inbox','event_inbox','tutoring_session'));
create unique index if not exists oaca_tutoring_session_one_thread on public.oaca_threads(tutoring_session_id) where kind='tutoring_session';

create or replace function public.oaca_current_tutor_provider_id()
returns uuid language plpgsql stable security definer set search_path=public as $$
declare provider_id uuid;
begin
  select p.id into provider_id
  from public.oaca_providers p
  join public.oaca_tutor_compliance c on c.provider_id=p.id
  where p.user_id=public.current_profile_user_id() and p.classification='peer_tutor' and p.active
    and c.eligible_at is not null and c.suspended_at is null and c.handbook_acknowledgment_id is not null
  limit 1;
  if provider_id is null then raise exception 'An active eligible Peer Tutor record is required' using errcode='42501'; end if;
  return provider_id;
end $$;

create or replace function public.oaca_tutoring_manager_org()
returns uuid language plpgsql stable security definer set search_path=public as $$
declare org uuid;
begin
  if not public.staff_mfa_verified() then raise exception 'Staff MFA is required' using errcode='42501'; end if;
  select r.organization_id into org from public.experience_role_assignments r
  where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.revoked_at is null
    and r.role in ('administrator','creator') limit 1;
  if org is null then
    select c.organization_id into org from public.experience_capability_assignments c
    where c.user_id=public.current_profile_user_id() and c.experience_key='oaca'
      and c.capability='oaca.tutoring.manage' and c.revoked_at is null limit 1;
  end if;
  if org is null then raise exception 'Tutoring Manager capability is required' using errcode='42501'; end if;
  return org;
end $$;

create or replace function public.oaca_tutor_workspace(payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare provider uuid:=public.oaca_current_tutor_provider_id(); tutor public.oaca_providers%rowtype; profile public.profiles%rowtype; compliance public.oaca_tutor_compliance%rowtype;
begin
  select * into tutor from public.oaca_providers where id=provider;
  select * into profile from public.profiles where user_id=tutor.user_id;
  select * into compliance from public.oaca_tutor_compliance where provider_id=provider;
  return jsonb_build_object(
    'role','peer_tutor',
    'tutor',jsonb_build_object('id',provider,'name',profile.display_name,'status',case when tutor.active then 'active' else 'suspended' end,'subjects',coalesce((select jsonb_agg(q.subject order by q.subject) from public.oaca_tutor_qualifications q where q.provider_id=provider and q.effective_from<=current_date and (q.effective_through is null or q.effective_through>=current_date)),'[]'::jsonb),'hoursThisWeek',coalesce((select round(sum(extract(epoch from (s.ends_at-s.starts_at))/3600)::numeric,1) from public.oaca_tutoring_sessions s where s.provider_id=provider and s.status='completed' and s.starts_at>=date_trunc('week',now())),0)),
    'eligibility',jsonb_build_object('active',true,'checklist',jsonb_build_array(
      jsonb_build_object('key','application','label','Staff-created tutor record','complete',compliance.application_approved_at is not null),
      jsonb_build_object('key','recommendation','label','Faculty recommendation','complete',compliance.faculty_recommendation_at is not null),
      jsonb_build_object('key','interview','label','Interview completed','complete',compliance.interview_completed_at is not null),
      jsonb_build_object('key','workday','label','Workday onboarding','complete',compliance.workday_onboarding_at is not null),
      jsonb_build_object('key','training','label','Required training','complete',compliance.training_completed_at is not null),
      jsonb_build_object('key','handbook','label','Current handbook acknowledged','complete',compliance.handbook_acknowledgment_id is not null))),
    'requests',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'studentName',student.display_name,'subject',a.subject,'startsAt',a.starts_at,'endsAt',a.ends_at,'modality',a.modality,'status',a.status,'requestedAt',a.created_at,'preparationNote',a.preparation_note) order by a.starts_at) from public.oaca_appointments a join public.oaca_service_lines l on l.id=a.service_line_id join public.profiles student on student.user_id=a.student_id where a.provider_id=provider and l.key='peer_tutoring' and a.status in ('pending_approval','counterproposed','confirmed')),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'studentName',student.display_name,'subject',s.subject,'startsAt',s.starts_at,'endsAt',s.ends_at,'modality',coalesce(a.modality,'in_person'),'location','Location pending','type',s.session_type,'status',s.status,'attendanceStatus',coalesce(p.attendance_status,'not_recorded'),'logDueAt',s.log_due_at,'logStatus',case when exists(select 1 from public.oaca_tutor_session_log_revisions r where r.session_id=s.id) then 'submitted' when s.log_due_at<now() then 'overdue' when s.log_due_at is not null then 'due' else 'not_due' end) order by s.starts_at desc) from public.oaca_tutoring_sessions s left join public.oaca_appointments a on a.id=s.appointment_id left join public.oaca_tutoring_session_participants p on p.session_id=s.id left join public.profiles student on student.user_id=p.student_id where s.provider_id=provider),'[]'::jsonb),
    'availability',jsonb_build_object('active',coalesce((select active from public.oaca_tutor_availability_profiles where provider_id=provider),true),'defaultDurationMinutes',coalesce((select default_duration_minutes from public.oaca_tutor_availability_profiles where provider_id=provider),60),'bufferBeforeMinutes',coalesce((select buffer_before_minutes from public.oaca_tutor_availability_profiles where provider_id=provider),10),'bufferAfterMinutes',coalesce((select buffer_after_minutes from public.oaca_tutor_availability_profiles where provider_id=provider),10),'rules','[]'::jsonb,'exceptions',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'date',e.exception_date,'kind',e.exception_kind,'startsAt',e.starts_at,'endsAt',e.ends_at,'note',e.note)) from public.oaca_tutor_availability_exceptions e where e.provider_id=provider),'[]'::jsonb)),
    'rooms','[]'::jsonb,'messages','[]'::jsonb,'logs','[]'::jsonb,'recaps','[]'::jsonb,
    'coaching',jsonb_build_object('hoursThisWeek',0,'medianResponseMinutes',0,'attendanceCompletionRate',0,'logCompletionRate',0,'upcomingLoad',0,'feedback',jsonb_build_object('responseCount',0,'helpfulnessPercent',0,'commentsVisible',false,'minimumGroupSize',3)),
    'privacyBoundary',jsonb_build_object('sameCoursePublishedRecapsOnly',true,'advisingNotesIncluded',false,'gradesIncluded',false,'portfolioIncluded',false,'otherTutorRecordsIncluded',false)
  );
end $$;

create or replace function public.oaca_tutoring_manager_workspace(payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.oaca_tutoring_manager_org();
begin
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_tutoring_manager_workspace_opened','oaca_tutoring_manager',jsonb_build_object('identifiable',true),'oaca');
  return jsonb_build_object(
    'role','tutoring_manager',
    'tutors',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',f.display_name,'status',case when p.active and c.suspended_at is null then 'active' else 'suspended' end,'subjects',coalesce((select jsonb_agg(q.subject) from public.oaca_tutor_qualifications q where q.provider_id=p.id),'[]'::jsonb),'modalities',p.modalities,'handbookAcknowledged',c.handbook_acknowledgment_id is not null,'eligibleAt',c.eligible_at,'hoursThisWeek',0,'responseMinutes',0,'logCompletionRate',0) order by f.display_name) from public.oaca_providers p join public.profiles f on f.user_id=p.user_id left join public.oaca_tutor_compliance c on c.provider_id=p.id where p.organization_id=org and p.classification='peer_tutor'),'[]'::jsonb),
    'requests','[]'::jsonb,'sessions','[]'::jsonb,'rooms','[]'::jsonb,
    'offerings',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'subject',o.subject,'type',o.offering_type,'tutorName',f.display_name,'startsAt',o.starts_at,'capacity',o.capacity,'registered',(select count(*) from public.oaca_tutoring_group_registrations r where r.offering_id=o.id and r.status='registered'),'waitlisted',(select count(*) from public.oaca_tutoring_group_registrations r where r.offering_id=o.id and r.status='waitlisted'),'status',o.status) order by o.starts_at desc) from public.oaca_tutoring_group_offerings o join public.oaca_providers p on p.id=o.provider_id join public.profiles f on f.user_id=p.user_id where o.organization_id=org),'[]'::jsonb),
    'feedbackForms',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'title',f.title,'version',f.version,'status',f.status,'fields',f.form_schema)) from public.oaca_tutoring_feedback_forms f where f.organization_id=org),'[]'::jsonb),
    'exceptions','[]'::jsonb,'feedback',jsonb_build_object('responseCount',0,'averageHelpfulness',0,'concernCount',0,'minimumGroupSize',3),
    'reports',jsonb_build_object('activeTutors',(select count(*) from public.oaca_providers p where p.organization_id=org and p.classification='peer_tutor' and p.active),'hoursThisWeek',0,'medianResponseMinutes',0,'attendanceCompletionRate',0,'logCompletionRate',0,'averageDropinWaitMinutes',0),
    'supervisoryAccess',jsonb_build_object('conversationsOnDemandOnly',true,'accessAudited',true)
  );
end $$;

create or replace function public.oaca_tutor_change_request(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare provider uuid:=public.oaca_current_tutor_provider_id(); item public.oaca_appointments%rowtype; decision text:=payload->>'decision';
begin
  select * into item from public.oaca_appointments where id=(payload->>'requestId')::uuid and provider_id=provider for update;
  if item.id is null or item.status not in ('pending_approval','counterproposed','confirmed') then raise exception 'Request is no longer available' using errcode='23514'; end if;
  if decision='confirm' then update public.oaca_appointments set status='confirmed',updated_at=now() where id=item.id;
  elsif decision='decline' then update public.oaca_appointments set status='declined',updated_at=now() where id=item.id;
  elsif decision='counterpropose' then update public.oaca_appointments set prior_confirmed_starts_at=case when status='confirmed' then starts_at else prior_confirmed_starts_at end,prior_confirmed_ends_at=case when status='confirmed' then ends_at else prior_confirmed_ends_at end,starts_at=(payload->>'startsAt')::timestamptz,ends_at=(payload->>'startsAt')::timestamptz+(item.ends_at-item.starts_at),status='counterproposed',updated_at=now() where id=item.id;
  else raise exception 'Choose confirm, decline, or counterpropose' using errcode='23514'; end if;
  update public.oaca_tutoring_request_escalations set resolved_at=now(),resolved_by=public.current_profile_user_id(),resolution=decision where appointment_id=item.id;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(item.organization_id,public.current_profile_user_id(),'oaca_tutor_request_'||decision,'oaca_appointment',item.id,jsonb_build_object('providerId',provider),'oaca');
  return jsonb_build_object('id',item.id,'status',decision);
end $$;

create or replace function public.oaca_tutor_save_availability(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare provider uuid:=public.oaca_current_tutor_provider_id();
begin
  insert into public.oaca_tutor_availability_profiles(provider_id,active,default_duration_minutes,buffer_before_minutes,buffer_after_minutes,updated_by)
  values(provider,coalesce((payload->>'active')::boolean,true),coalesce((payload->>'defaultDurationMinutes')::integer,60),coalesce((payload->>'bufferBeforeMinutes')::integer,10),coalesce((payload->>'bufferAfterMinutes')::integer,10),public.current_profile_user_id())
  on conflict(provider_id) do update set active=excluded.active,default_duration_minutes=excluded.default_duration_minutes,buffer_before_minutes=excluded.buffer_before_minutes,buffer_after_minutes=excluded.buffer_after_minutes,updated_by=excluded.updated_by,updated_at=now();
  return jsonb_build_object('saved',true);
end $$;

create or replace function public.oaca_tutor_save_availability_exception(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare provider uuid:=public.oaca_current_tutor_provider_id(); saved uuid;
begin
  insert into public.oaca_tutor_availability_exceptions(provider_id,exception_date,exception_kind,starts_at,ends_at,note,created_by) values(provider,(payload->>'date')::date,coalesce(payload->>'kind','remove'),(payload->>'startsAt')::time,(payload->>'endsAt')::time,left(coalesce(payload->>'note',''),500),public.current_profile_user_id()) returning id into saved;
  return jsonb_build_object('id',saved);
end $$;

create or replace function public.oaca_tutor_update_session(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare provider uuid:=public.oaca_current_tutor_provider_id(); item public.oaca_tutoring_sessions%rowtype; action_key text:=payload->>'action';
begin
  select * into item from public.oaca_tutoring_sessions where id=(payload->>'sessionId')::uuid and provider_id=provider for update;
  if item.id is null then raise exception 'Session not found' using errcode='23514'; end if;
  if action_key='start' then update public.oaca_tutoring_sessions set status='in_progress',started_at=coalesce(started_at,now()),updated_at=now() where id=item.id;
  elsif action_key='end' then update public.oaca_tutoring_sessions set status='completed',ended_at=coalesce(ended_at,now()),log_due_at=coalesce(log_due_at,now()+interval '24 hours'),updated_at=now() where id=item.id;
  else raise exception 'Choose start or end' using errcode='23514'; end if;
  return jsonb_build_object('id',item.id,'status',action_key);
end $$;

create or replace function public.oaca_tutor_save_attendance(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare provider uuid:=public.oaca_current_tutor_provider_id(); session_record public.oaca_tutoring_sessions%rowtype; participant public.oaca_tutoring_session_participants%rowtype; student uuid; next_status text:=payload->>'status'; next_version integer;
begin
  if next_status not in ('present','no_show','excused','not_recorded') then raise exception 'Invalid attendance status' using errcode='23514'; end if;
  select * into session_record from public.oaca_tutoring_sessions where id=(payload->>'sessionId')::uuid and provider_id=provider;
  if session_record.id is null then raise exception 'Session not found' using errcode='23514'; end if;
  select * into participant from public.oaca_tutoring_session_participants where session_id=session_record.id order by student_id limit 1;
  student:=participant.student_id; next_version:=coalesce(participant.attendance_version,0)+1;
  update public.oaca_tutoring_session_participants set attendance_status=next_status,attendance_source=coalesce(payload->>'source','manual'),attendance_version=next_version,recorded_by=public.current_profile_user_id(),recorded_at=now() where session_id=session_record.id and student_id=student;
  insert into public.oaca_tutoring_attendance_versions(session_id,student_id,version,prior_status,attendance_status,source,changed_by) values(session_record.id,student,next_version,participant.attendance_status,next_status,coalesce(payload->>'source','manual'),public.current_profile_user_id());
  return jsonb_build_object('sessionId',session_record.id,'status',next_status,'version',next_version);
end $$;

create or replace function public.oaca_tutor_save_log(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare provider uuid:=public.oaca_current_tutor_provider_id(); session_record public.oaca_tutoring_sessions%rowtype; next_version integer; saved uuid;
begin
  select * into session_record from public.oaca_tutoring_sessions where id=(payload->>'sessionId')::uuid and provider_id=provider and status='completed';
  if session_record.id is null then raise exception 'Completed session not found' using errcode='23514'; end if;
  select coalesce(max(version),0)+1 into next_version from public.oaca_tutor_session_log_revisions where session_id=session_record.id;
  insert into public.oaca_tutor_session_log_revisions(session_id,version,tutoring_minutes,prep_minutes,topics,session_summary,understanding,challenges,recommendations,authored_by) values(session_record.id,next_version,(payload->>'tutoringMinutes')::integer,coalesce((payload->>'prepMinutes')::integer,0),left(trim(payload->>'topics'),5000),left(trim(payload->>'summary'),5000),left(coalesce(payload->>'understanding',''),5000),left(coalesce(payload->>'challenges',''),5000),left(coalesce(payload->>'recommendations',''),5000),public.current_profile_user_id()) returning id into saved;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(session_record.organization_id,public.current_profile_user_id(),'oaca_tutor_log_revision_saved','oaca_tutoring_session',session_record.id,jsonb_build_object('version',next_version,'logId',saved),'oaca');
  return jsonb_build_object('id',saved,'version',next_version);
end $$;

create or replace function public.oaca_tutor_publish_recap(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare provider uuid:=public.oaca_current_tutor_provider_id(); session_record public.oaca_tutoring_sessions%rowtype; next_version integer; saved uuid;
begin
  select * into session_record from public.oaca_tutoring_sessions where id=(payload->>'sessionId')::uuid and provider_id=provider;
  if session_record.id is null then raise exception 'Session not found' using errcode='23514'; end if;
  select coalesce(max(version),0)+1 into next_version from public.oaca_tutoring_recap_revisions where session_id=session_record.id;
  insert into public.oaca_tutoring_recap_revisions(session_id,version,body,next_steps,published_by) values(session_record.id,next_version,left(trim(payload->>'body'),5000),left(coalesce(payload->>'nextSteps',''),5000),public.current_profile_user_id()) returning id into saved;
  return jsonb_build_object('id',saved,'version',next_version,'published',true);
end $$;

create or replace function public.oaca_tutor_send_message(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare provider uuid:=public.oaca_current_tutor_provider_id(); session_record public.oaca_tutoring_sessions%rowtype; thread public.oaca_threads%rowtype; saved public.oaca_messages%rowtype;
begin
  select * into session_record from public.oaca_tutoring_sessions where id=(payload->>'sessionId')::uuid and provider_id=provider;
  if session_record.id is null or (session_record.status='completed' and coalesce(session_record.ended_at,session_record.ends_at)+interval '7 days'<now()) then raise exception 'The session conversation is closed' using errcode='23514'; end if;
  insert into public.oaca_threads(organization_id,appointment_id,kind,tutoring_session_id) values(session_record.organization_id,session_record.appointment_id,'tutoring_session',session_record.id) on conflict(tutoring_session_id) where kind='tutoring_session' do update set tutoring_session_id=excluded.tutoring_session_id returning * into thread;
  insert into public.oaca_thread_participants(thread_id,user_id,participant_role) values(thread.id,public.current_profile_user_id(),'peer_tutor') on conflict do nothing;
  insert into public.oaca_messages(thread_id,sender_id,body) values(thread.id,public.current_profile_user_id(),left(trim(payload->>'body'),5000)) returning * into saved;
  return jsonb_build_object('id',saved.id,'createdAt',saved.created_at);
end $$;

create or replace function public.oaca_tutor_offer_followup(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare provider uuid:=public.oaca_current_tutor_provider_id(); session_record public.oaca_tutoring_sessions%rowtype; participant uuid; service uuid; saved uuid;
begin
  select * into session_record from public.oaca_tutoring_sessions where id=(payload->>'sessionId')::uuid and provider_id=provider;
  select student_id into participant from public.oaca_tutoring_session_participants where session_id=session_record.id order by student_id limit 1;
  select id into service from public.oaca_service_lines where organization_id=session_record.organization_id and key='peer_tutoring';
  insert into public.oaca_appointments(organization_id,student_id,provider_id,service_line_id,subject,format,modality,starts_at,ends_at,status,sandbox,request_origin,preparation_note) values(session_record.organization_id,participant,provider,service,session_record.subject,'individual','in_person',now()+interval '7 days',now()+interval '7 days 1 hour','counterproposed',true,'advisor','Tutor offered a follow-up; student acceptance is required.') returning id into saved;
  return jsonb_build_object('id',saved,'status','counterproposed');
end $$;

create or replace function public.oaca_tutor_update_dropin(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare provider uuid:=public.oaca_current_tutor_provider_id(); coverage public.oaca_tutoring_dropin_coverage%rowtype; action_key text:=payload->>'action';
begin
  select * into coverage from public.oaca_tutoring_dropin_coverage where room_id=(payload->>'roomId')::uuid and provider_id=provider and status in ('scheduled','open') order by starts_at desc limit 1 for update;
  if coverage.id is null then raise exception 'Assigned drop-in coverage not found' using errcode='23514'; end if;
  if action_key='check_in' then update public.oaca_tutoring_dropin_coverage set status='open',checked_in_at=now() where id=coverage.id;
  elsif action_key='check_out' then update public.oaca_tutoring_dropin_coverage set status='closed',checked_out_at=now() where id=coverage.id;
  elsif action_key in ('call','complete','skip') then update public.oaca_tutoring_dropin_queue set status=case action_key when 'call' then 'called' when 'complete' then 'completed' else 'skipped' end,called_at=case when action_key='call' then now() else called_at end,completed_at=case when action_key='complete' then now() else completed_at end where id=(payload->>'queueId')::uuid and coverage_id=coverage.id;
  else raise exception 'Invalid drop-in action' using errcode='23514'; end if;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.oaca_tutoring_manager_update_tutor(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.oaca_tutoring_manager_org(); provider uuid:=(payload->>'tutorId')::uuid; action_key text:=payload->>'action';
begin
  update public.oaca_providers set active=action_key<>'suspend' where id=provider and organization_id=org and classification='peer_tutor';
  if not found then raise exception 'Tutor not found' using errcode='23514'; end if;
  if action_key='suspend' then update public.oaca_tutor_compliance set suspended_at=now(),suspension_reason='Tutoring Manager suspension',updated_by=public.current_profile_user_id(),updated_at=now() where provider_id=provider;
  else update public.oaca_tutor_compliance set suspended_at=null,suspension_reason=null,updated_by=public.current_profile_user_id(),updated_at=now() where provider_id=provider; end if;
  return jsonb_build_object('id',provider,'status',case when action_key='suspend' then 'suspended' else 'active' end);
end $$;

create or replace function public.oaca_tutoring_manager_save_qualifications(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.oaca_tutoring_manager_org(); provider uuid:=(payload->>'tutorId')::uuid; subject text;
begin
  if not exists(select 1 from public.oaca_providers where id=provider and organization_id=org and classification='peer_tutor') then raise exception 'Tutor not found' using errcode='23514'; end if;
  delete from public.oaca_tutor_qualifications where provider_id=provider and effective_from=current_date;
  for subject in select jsonb_array_elements_text(coalesce(payload->'subjects','[]'::jsonb)) loop insert into public.oaca_tutor_qualifications(provider_id,subject,modalities,granted_by) values(provider,left(subject,200),array(select jsonb_array_elements_text(coalesce(payload->'modalities','["in_person"]'::jsonb))),public.current_profile_user_id()); end loop;
  return jsonb_build_object('id',provider,'saved',true);
end $$;

create or replace function public.oaca_tutoring_manager_update_request(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.oaca_tutoring_manager_org(); appointment uuid:=(payload->>'requestId')::uuid; provider uuid:=(payload->>'tutorId')::uuid;
begin
  update public.oaca_appointments set provider_id=provider,status='pending_approval',updated_at=now() where id=appointment and organization_id=org;
  if not found then raise exception 'Request not found' using errcode='23514'; end if;
  insert into public.oaca_tutoring_request_escalations(appointment_id,response_due_at) values(appointment,now()+interval '12 hours') on conflict(appointment_id) do update set response_due_at=excluded.response_due_at,tutor_reminded_at=null,manager_alerted_at=null,resolved_at=null,resolved_by=null,resolution=null;
  return jsonb_build_object('id',appointment,'providerId',provider,'status','pending_approval');
end $$;

create or replace function public.oaca_tutoring_manager_resolve_exception(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.oaca_tutoring_manager_org();
begin
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_tutoring_exception_resolved','oaca_tutoring_exception',payload->>'exceptionId',payload,'oaca');
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.oaca_tutoring_manager_save_offering(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.oaca_tutoring_manager_org(); provider uuid:=(payload->>'tutorId')::uuid; start_time timestamptz:=(payload->>'startsAt')::timestamptz; duration integer:=coalesce((payload->>'durationMinutes')::integer,60); saved uuid;
begin
  if not exists(select 1 from public.oaca_providers where id=provider and organization_id=org and classification='peer_tutor' and active) then raise exception 'Choose an active Peer Tutor' using errcode='23514'; end if;
  insert into public.oaca_tutoring_group_offerings(organization_id,title,subject,offering_type,provider_id,starts_at,ends_at,capacity,status,created_by) values(org,left(trim(payload->>'title'),240),left(trim(payload->>'subject'),200),case when payload->>'type'='group' then 'group' else 'review' end,provider,start_time,start_time+make_interval(mins=>duration),greatest(3,least(8,(payload->>'capacity')::integer)),case when payload->>'action'='publish' then 'published' else 'draft' end,public.current_profile_user_id()) returning id into saved;
  return jsonb_build_object('id',saved,'status',case when payload->>'action'='publish' then 'published' else 'draft' end);
end $$;

create or replace function public.oaca_tutoring_manager_update_room(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.oaca_tutoring_manager_org(); room uuid:=(payload->>'roomId')::uuid;
begin
  update public.oaca_tutoring_dropin_rooms set active=(payload->>'action')<>'suspend' where id=room and organization_id=org;
  if not found then raise exception 'Room not found' using errcode='23514'; end if;
  return jsonb_build_object('id',room,'active',(payload->>'action')<>'suspend');
end $$;

create or replace function public.oaca_tutoring_manager_add_log_addendum(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.oaca_tutoring_manager_org(); session_record public.oaca_tutoring_sessions%rowtype; saved uuid;
begin
  select * into session_record from public.oaca_tutoring_sessions where id=(payload->>'sessionId')::uuid and organization_id=org;
  if session_record.id is null then raise exception 'Session not found' using errcode='23514'; end if;
  insert into public.oaca_tutor_session_log_addenda(session_id,body,authored_by) values(session_record.id,left(trim(payload->>'body'),5000),public.current_profile_user_id()) returning id into saved;
  return jsonb_build_object('id',saved,'attributed',true);
end $$;

create or replace function public.oaca_tutoring_manager_save_feedback_form(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.oaca_tutoring_manager_org(); next_version integer; saved uuid; title_key text:=left(trim(payload->>'title'),240);
begin
  select coalesce(max(version),0)+1 into next_version from public.oaca_tutoring_feedback_forms where organization_id=org and title=title_key;
  insert into public.oaca_tutoring_feedback_forms(organization_id,title,version,form_schema,status,created_by,published_at) values(org,title_key,next_version,coalesce(payload->'fields','[]'::jsonb),case when payload->>'action'='publish' then 'published' else 'draft' end,public.current_profile_user_id(),case when payload->>'action'='publish' then now() else null end) returning id into saved;
  return jsonb_build_object('id',saved,'version',next_version);
end $$;

create or replace function public.oaca_tutoring_manager_prepare_export(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.oaca_tutoring_manager_org(); export_id uuid:=gen_random_uuid();
begin
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_tutoring_export_requested','oaca_tutoring_export',export_id,payload||jsonb_build_object('feedbackMinimumGroupSize',3,'peerRanking',false),'oaca');
  return jsonb_build_object('id',export_id,'status','queued','audited',true);
end $$;

-- Existing legacy logs become immutable version 1 records when a matching
-- tutoring session exists. The original table is not updated or deleted.
insert into public.oaca_tutor_session_log_revisions(session_id,version,tutoring_minutes,prep_minutes,topics,session_summary,understanding,challenges,recommendations,authored_by,submitted_at)
select s.id,1,least(60,l.tutoring_minutes),least(180,l.prep_minutes),l.topics,l.session_summary,l.understanding,l.challenges,l.recommendations,p.user_id,l.submitted_at
from public.oaca_tutor_session_logs l join public.oaca_tutoring_sessions s on s.appointment_id=l.appointment_id join public.oaca_providers p on p.id=l.provider_id
on conflict(session_id,version) do nothing;

alter table public.oaca_tutor_qualifications enable row level security;
alter table public.oaca_tutor_availability_profiles enable row level security;
alter table public.oaca_tutor_availability_exceptions enable row level security;
alter table public.oaca_tutoring_request_escalations enable row level security;
alter table public.oaca_tutoring_sessions enable row level security;
alter table public.oaca_tutoring_session_participants enable row level security;
alter table public.oaca_tutoring_attendance_versions enable row level security;
alter table public.oaca_tutor_session_log_revisions enable row level security;
alter table public.oaca_tutor_session_log_addenda enable row level security;
alter table public.oaca_tutoring_recap_revisions enable row level security;
alter table public.oaca_tutoring_group_offerings enable row level security;
alter table public.oaca_tutoring_group_registrations enable row level security;
alter table public.oaca_tutoring_dropin_rooms enable row level security;
alter table public.oaca_tutoring_dropin_coverage enable row level security;
alter table public.oaca_tutoring_dropin_queue enable row level security;
alter table public.oaca_tutoring_feedback_forms enable row level security;
alter table public.oaca_tutoring_feedback_responses enable row level security;
alter table public.oaca_tutoring_supervisory_accesses enable row level security;

revoke all on public.oaca_tutor_qualifications, public.oaca_tutor_availability_profiles, public.oaca_tutor_availability_exceptions, public.oaca_tutoring_request_escalations, public.oaca_tutoring_sessions, public.oaca_tutoring_session_participants, public.oaca_tutoring_attendance_versions, public.oaca_tutor_session_log_revisions, public.oaca_tutor_session_log_addenda, public.oaca_tutoring_recap_revisions, public.oaca_tutoring_group_offerings, public.oaca_tutoring_group_registrations, public.oaca_tutoring_dropin_rooms, public.oaca_tutoring_dropin_coverage, public.oaca_tutoring_dropin_queue, public.oaca_tutoring_feedback_forms, public.oaca_tutoring_feedback_responses, public.oaca_tutoring_supervisory_accesses from anon, authenticated;

grant execute on function public.oaca_current_tutor_provider_id(), public.oaca_tutoring_manager_org(), public.oaca_tutor_workspace(jsonb), public.oaca_tutoring_manager_workspace(jsonb), public.oaca_tutor_change_request(jsonb), public.oaca_tutor_save_availability(jsonb), public.oaca_tutor_save_availability_exception(jsonb), public.oaca_tutor_update_session(jsonb), public.oaca_tutor_save_attendance(jsonb), public.oaca_tutor_save_log(jsonb), public.oaca_tutor_publish_recap(jsonb), public.oaca_tutor_send_message(jsonb), public.oaca_tutor_offer_followup(jsonb), public.oaca_tutor_update_dropin(jsonb), public.oaca_tutoring_manager_update_tutor(jsonb), public.oaca_tutoring_manager_save_qualifications(jsonb), public.oaca_tutoring_manager_update_request(jsonb), public.oaca_tutoring_manager_resolve_exception(jsonb), public.oaca_tutoring_manager_save_offering(jsonb), public.oaca_tutoring_manager_update_room(jsonb), public.oaca_tutoring_manager_add_log_addendum(jsonb), public.oaca_tutoring_manager_save_feedback_form(jsonb), public.oaca_tutoring_manager_prepare_export(jsonb) to authenticated;

commit;
