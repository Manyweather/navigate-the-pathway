begin;

-- Policy-source inventory. Source files remain outside the public web root; only
-- version metadata and hashes are retained here so an administrator can prove
-- which policy was translated into each machine-readable rule.
create table if not exists public.oaca_policy_documents (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  title text not null,
  version_label text not null,
  effective_date date,
  last_updated_on date,
  source_filename text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9A-F]{64}$'),
  audience text not null check (audience in ('student','peer_tutor','student_and_peer_tutor')),
  requires_acknowledgment boolean not null default false,
  status text not null default 'approved_source' check (status in ('received','approved_source','retired')),
  created_at timestamptz not null default now(),
  unique (policy_key, version_label)
);

create table if not exists public.oaca_policy_rules (
  id uuid primary key default gen_random_uuid(),
  policy_document_id uuid not null references public.oaca_policy_documents(id),
  rule_key text not null unique,
  service_key text not null check (service_key in ('academic_advising','career_advising','peer_tutoring')),
  audience text not null check (audience in ('student','peer_tutor','advisor','administrator')),
  phase text check (phase in ('foundations','clerkship','advanced','all')),
  year_number smallint check (year_number between 1 and 4),
  trigger_type text not null,
  required_provider text,
  due_rule text,
  summary text not null,
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.oaca_policy_documents
  (policy_key,title,version_label,effective_date,last_updated_on,source_filename,source_sha256,audience,requires_acknowledgment,status)
values
  ('peer_tutor_handbook_2026_2027','Peer Tutor Policy Handbook & Agreement','2026-2027','2026-04-06','2026-05-18','Peer Tutor Handbook 5.18.26.pdf.pdf','4547E7BD9E66F4B167573A9C60054E30160AB86C025B1509E4C4399547B463A8','peer_tutor',true,'approved_source'),
  ('career_advising_2026','Career Advising Policy','2026',null,null,'Vertical Career Advising Policy 2026 CM.pdf','206FA230B2A4D6050521A74FA4DA60D96D2E21DB9E723AF33B160F7BB237B79D','student',false,'approved_source'),
  ('foundational_academic_advising_2026','Foundational Phase Academic Advising Policy','2026',null,null,'Vertical Career Advising Policy 2026 CM.pdf','206FA230B2A4D6050521A74FA4DA60D96D2E21DB9E723AF33B160F7BB237B79D','student',false,'approved_source'),
  ('clerkship_advanced_academic_advising_2026','Clerkship & Advanced Phase Academic Advising Policy','2026',null,null,'Vertical Clerkship Advising Policy 2026 CM (1).pdf','842BCFFCF351D5FA306BA71E9F15ADA9320E6E4FAE06AC866D6765CF66695BA3','student',false,'approved_source'),
  ('peer_tutoring_student_agreement_2026_2027','Peer Tutoring Services Student Acknowledgement & Agreement','2026-2027',null,null,'Peer Tutor Agreement & Signature Page.pdf','4D8A6FBA10729C3EEF171C4A96D044BD03B5EAF15DC832EDB1D8B382B21A4056','student',true,'approved_source')
on conflict (policy_key,version_label) do update set
  title=excluded.title,effective_date=excluded.effective_date,last_updated_on=excluded.last_updated_on,
  source_filename=excluded.source_filename,source_sha256=excluded.source_sha256,audience=excluded.audience,
  requires_acknowledgment=excluded.requires_acknowledgment;

insert into public.oaca_policy_rules
  (policy_document_id,rule_key,service_key,audience,phase,year_number,trigger_type,required_provider,due_rule,summary,config)
select d.id,v.rule_key,v.service_key,v.audience,v.phase,v.year_number,v.trigger_type,v.required_provider,v.due_rule,v.summary,v.config
from (values
  ('foundational_academic_advising_2026','foundations_year_1_check_in','academic_advising','student','foundations',1::smallint,'program_milestone','assigned_advisor','within_first_4_weeks','Meet with the assigned Academic Advisor within the first four weeks of Foundations 1.','{}'::jsonb),
  ('foundational_academic_advising_2026','foundations_year_2_check_in','academic_advising','student','foundations',2::smallint,'program_milestone','assigned_advisor','by_end_of_foundations_3','Meet with the assigned Academic Advisor at least once by the conclusion of Foundations 3.','{}'::jsonb),
  ('foundational_academic_advising_2026','exam_below_70_advisor','academic_advising','student','foundations',null::smallint,'exam_band','assigned_advisor','before_next_exam_if_in_progress','A score below 70 requires an Academic Advisor meeting; the meeting is required even when the course is ultimately passed.','{"maximumExclusive":70}'::jsonb),
  ('foundational_academic_advising_2026','exam_below_70_director','academic_advising','student','foundations',null::smallint,'exam_band','oaca_director','promptly_after_result','A score below 70 requires a Director meeting unless the course is ultimately passed.','{"maximumExclusive":70,"waiveWhenCoursePassed":true}'::jsonb),
  ('foundational_academic_advising_2026','exam_borderline_70_72','academic_advising','student','foundations',null::smallint,'exam_band','assigned_advisor','before_course_concludes','A score from 70 through 72 requires an Academic Advisor meeting before the course concludes.','{"minimumInclusive":70,"maximumInclusive":72}'::jsonb),
  ('foundational_academic_advising_2026','two_consecutive_cba_reassessments','academic_advising','student','foundations',null::smallint,'consecutive_cba_reassessment','assigned_advisor','after_second_reassessment','Two consecutive CBA reassessments in the same course require an Academic Advisor meeting.','{"count":2}'::jsonb),
  ('foundational_academic_advising_2026','failed_course_director','academic_advising','student','foundations',null::smallint,'failed_course','oaca_director','after_course_outcome','A failed course requires a meeting with the Director of Academic and Career Advising.','{}'::jsonb),
  ('foundational_academic_advising_2026','failed_course_advisor','academic_advising','student','foundations',null::smallint,'failed_course','assigned_advisor','beginning_next_course_then_monthly','A failed course requires an Academic Advisor meeting at the beginning of the next course and monthly meetings until remediation is complete.','{"recurrence":"monthly_until_remediation_complete"}'::jsonb),
  ('clerkship_advanced_academic_advising_2026','first_clerkship_check_in','academic_advising','student','clerkship',null::smallint,'program_milestone','assigned_advisor','before_end_first_clerkship','Meet with the Academic Advisor before the end of the first clinical clerkship.','{}'::jsonb),
  ('clerkship_advanced_academic_advising_2026','below_shelf_threshold','academic_advising','student','clerkship',null::smallint,'shelf_threshold','oaca_director','before_reassessment','A score below the shelf threshold requires a Director meeting before reassessment.','{"thresholdConfiguredExternally":true}'::jsonb),
  ('clerkship_advanced_academic_advising_2026','step_1_planning','academic_advising','student','clerkship',null::smallint,'program_milestone','assigned_advisor','by_final_clerkship','Complete an end-of-clerkship Step 1 planning meeting by the final clerkship.','{}'::jsonb),
  ('clerkship_advanced_academic_advising_2026','step_2_planning','academic_advising','student','advanced',null::smallint,'program_milestone','assigned_advisor','before_step_2_registration','Meet with the Academic Advisor during the Advanced Phase before registering for Step 2.','{}'::jsonb),
  ('clerkship_advanced_academic_advising_2026','residency_readiness','academic_advising','student','advanced',4::smallint,'program_milestone','assigned_advisor','by_start_final_year','Complete residency readiness advising by the start of the final year.','{}'::jsonb),
  ('clerkship_advanced_academic_advising_2026','clerkship_director_referral','academic_advising','student','clerkship',null::smallint,'referral','assigned_advisor','within_10_business_days','A Clerkship Director referral requires an Academic Advisor meeting within 10 business days.','{"businessDays":10}'::jsonb),
  ('clerkship_advanced_academic_advising_2026','repeat_clerkship','academic_advising','student','clerkship',null::smallint,'repeat_clerkship','oaca_director','before_repeat_starts','Meet with the Director before starting a repeat clerkship.','{}'::jsonb),
  ('career_advising_2026','career_year_1','career_advising','student','foundations',1::smallint,'program_milestone','associate_director','during_year_1','Complete CIM Understand Yourself and attend the presentation and working sessions.','{"cim":"Understand Yourself","advisorMeeting":"optional"}'::jsonb),
  ('career_advising_2026','career_year_2','career_advising','student','foundations',2::smallint,'program_milestone','associate_director','during_year_2','Meet with the Associate Director at least once, complete CIM Explore Options, and attend the presentation and working sessions.','{"cim":"Explore Options","advisorMeeting":"required"}'::jsonb),
  ('career_advising_2026','career_year_3','career_advising','student','clerkship',3::smallint,'program_milestone','associate_director','during_year_3','Complete CIM Choose Your Specialty and attend the presentation and working sessions.','{"cim":"Choose Your Specialty","advisorMeeting":"optional","specialtyAdvisor":"optional"}'::jsonb),
  ('career_advising_2026','career_year_4','career_advising','student','advanced',4::smallint,'program_milestone','associate_director','during_year_4','Complete ERAS and NRMP preparation, CIM Prepare for Residency, and the presentation and working sessions.','{"cim":"Prepare for Residency","advisorMeeting":"optional","specialtyAdvisor":"optional","mockInterview":"optional"}'::jsonb),
  ('peer_tutoring_student_agreement_2026_2027','tutoring_student_weekly_limit','peer_tutoring','student','all',null::smallint,'booking_limit',null,'rolling_program_week','Students may schedule up to two hours of peer tutoring each week.','{"minutes":120}'::jsonb),
  ('peer_tutoring_student_agreement_2026_2027','tutoring_individual_duration','peer_tutoring','student','all',null::smallint,'booking_limit',null,'per_session','Individual sessions are limited to one hour; 45 to 60 minutes is the recommended range.','{"maximumMinutes":60,"suggestedMinutes":[45,60]}'::jsonb),
  ('peer_tutoring_student_agreement_2026_2027','tutoring_exam_block_limit','peer_tutoring','student','all',null::smallint,'booking_limit',null,'between_exams','Students may receive up to four hours between exams; reassess need after three sessions and do not exceed four sessions without review.','{"minutes":240,"reviewAfterSessions":3,"sessionCap":4,"interpretation":"Agreement specifies four hours; handbook separately identifies a four-session cap and review after three to four sessions."}'::jsonb),
  ('peer_tutor_handbook_2026_2027','tutoring_booking_horizon','peer_tutoring','student','all',null::smallint,'booking_window',null,'before_session','Peer tutoring may be booked no more than one week in advance.','{"days":7}'::jsonb),
  ('peer_tutoring_student_agreement_2026_2027','tutoring_cancellation_notice','peer_tutoring','student','all',null::smallint,'cancellation_window',null,'before_session','Cancel or reschedule at least 24 hours before the session.','{"hours":24}'::jsonb),
  ('peer_tutoring_student_agreement_2026_2027','tutoring_no_show_restriction','peer_tutoring','student','all',null::smallint,'attendance',null,'after_second_no_show','Two no-shows create a temporary scheduling restriction pending Tutoring Manager review.','{"noShows":2,"restrictionDurationConfiguredExternally":true}'::jsonb),
  ('peer_tutor_handbook_2026_2027','tutoring_capacity','peer_tutoring','advisor','all',null::smallint,'capacity',null,'per_session','Individual tutoring supports one to three students; group tutoring supports three to eight students.','{"individual":[1,3],"group":[3,8]}'::jsonb),
  ('peer_tutor_handbook_2026_2027','tutor_weekly_hour_cap','peer_tutoring','peer_tutor','all',null::smallint,'work_limit',null,'per_week','Tutors should normally tutor four to six hours weekly and may not exceed eight tutoring hours without prior written approval.','{"recommendedHours":[4,6],"hardCapHours":8,"excludesPrep":true}'::jsonb),
  ('peer_tutor_handbook_2026_2027','tutor_review_prep_limit','peer_tutoring','peer_tutor','all',null::smallint,'work_limit',null,'per_week','Review-session preparation is limited to 30 minutes per tutoring hour and three preparation hours weekly unless approved in advance.','{"minutesPerTutoringHour":30,"weeklyMinutes":180,"additionalRequiresApproval":true}'::jsonb),
  ('peer_tutor_handbook_2026_2027','tutor_onboarding','peer_tutoring','peer_tutor','all',null::smallint,'eligibility',null,'before_first_session','Application, faculty recommendation, interview, Workday onboarding, required training, and handbook agreement must be complete before tutoring.','{"application":true,"facultyRecommendation":true,"interview":true,"workdayOnboarding":true,"training":true,"agreement":true}'::jsonb),
  ('peer_tutor_handbook_2026_2027','tutor_session_documentation','peer_tutoring','peer_tutor','all',null::smallint,'documentation',null,'promptly_after_session','Tutors must confirm completed sessions and record session type, attendance, course, duration, topics, summary, and recommendations; Workday remains the official payroll time record.','{"workdayIsPayrollRecord":true,"platformLogRequired":true}'::jsonb)
) as v(policy_key,rule_key,service_key,audience,phase,year_number,trigger_type,required_provider,due_rule,summary,config)
join public.oaca_policy_documents d on d.policy_key=v.policy_key and d.status='approved_source'
on conflict (rule_key) do update set
  policy_document_id=excluded.policy_document_id,service_key=excluded.service_key,audience=excluded.audience,
  phase=excluded.phase,year_number=excluded.year_number,trigger_type=excluded.trigger_type,
  required_provider=excluded.required_provider,due_rule=excluded.due_rule,summary=excluded.summary,config=excluded.config,active=true;

alter table public.oaca_appointments add column if not exists created_by uuid references public.profiles(user_id);
alter table public.oaca_appointments add column if not exists request_origin text not null default 'student' check (request_origin in ('student','advisor'));
alter table public.oaca_appointments add column if not exists policy_context jsonb not null default '{}'::jsonb;
alter table public.oaca_appointments add column if not exists obligation_id uuid;
alter table public.oaca_appointments add column if not exists cancelled_at timestamptz;

create table if not exists public.oaca_student_program_contexts (
  student_id uuid primary key references public.profiles(user_id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  phase text not null check (phase in ('foundations','clerkship','advanced')),
  year_number smallint not null check (year_number between 1 and 4),
  course_key text,
  clerkship_key text,
  exam_block_key text,
  updated_by uuid references public.profiles(user_id),
  updated_at timestamptz not null default now()
);

create table if not exists public.oaca_advising_obligations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  policy_rule_id uuid not null references public.oaca_policy_rules(id),
  assigned_provider_id uuid references public.oaca_providers(id),
  source_type text not null,
  source_reference text,
  source_context jsonb not null default '{}'::jsonb,
  triggered_at timestamptz not null default now(),
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','scheduled','completed','waived','cancelled')),
  completed_appointment_id uuid references public.oaca_appointments(id),
  waived_by uuid references public.profiles(user_id),
  waived_reason text,
  created_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now()
);
alter table public.oaca_appointments drop constraint if exists oaca_appointments_obligation_id_fkey;
alter table public.oaca_appointments add constraint oaca_appointments_obligation_id_fkey foreign key (obligation_id) references public.oaca_advising_obligations(id);

create table if not exists public.oaca_policy_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  policy_document_id uuid not null references public.oaca_policy_documents(id),
  acknowledgment_kind text not null check (acknowledgment_kind in ('student_tutoring','peer_tutor')),
  typed_name text not null,
  acknowledged_at timestamptz not null default now(),
  user_agent text,
  unique (user_id,policy_document_id,acknowledgment_kind)
);

create table if not exists public.oaca_tutor_compliance (
  provider_id uuid primary key references public.oaca_providers(id) on delete cascade,
  application_approved_at timestamptz,
  faculty_recommendation_at timestamptz,
  interview_completed_at timestamptz,
  workday_onboarding_at timestamptz,
  training_completed_at timestamptz,
  handbook_acknowledgment_id uuid references public.oaca_policy_acknowledgments(id),
  eligible_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  updated_by uuid references public.profiles(user_id),
  updated_at timestamptz not null default now()
);

create table if not exists public.oaca_tutor_session_logs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.oaca_appointments(id) on delete cascade,
  provider_id uuid not null references public.oaca_providers(id),
  session_type text not null check (session_type in ('individual','small_group','drop_in','review','mentorship')),
  attendance_count integer not null check (attendance_count between 0 and 8),
  course_or_subject text not null,
  tutoring_minutes integer not null check (tutoring_minutes between 1 and 480),
  prep_minutes integer not null default 0 check (prep_minutes between 0 and 480),
  workday_minutes integer check (workday_minutes between 0 and 960),
  topics text not null default '',
  session_summary text not null default '',
  understanding text not null default '',
  challenges text not null default '',
  recommendations text not null default '',
  submitted_at timestamptz not null default now()
);

create table if not exists public.oaca_scheduling_restrictions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  service_line_id uuid not null references public.oaca_service_lines(id),
  reason text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  released_at timestamptz,
  released_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now()
);
create unique index if not exists oaca_active_scheduling_restriction on public.oaca_scheduling_restrictions(student_id,service_line_id) where released_at is null;
create index if not exists oaca_obligations_student_status on public.oaca_advising_obligations(student_id,status,due_at);

-- The documents now support sandbox validation. Live scheduling remains an
-- explicit administrator decision because office hours, availability, and
-- several operational values are not defined by the supplied policies.
update public.oaca_service_lines set
  policy_status='sandbox_approved',
  duration_minutes=case when key='peer_tutoring' then 60 else coalesce(duration_minutes,30) end,
  cancellation_window_minutes=case when key='peer_tutoring' then 1440 else cancellation_window_minutes end,
  capacity=case when key='peer_tutoring' then 8 else coalesce(capacity,1) end,
  settings=settings || case when key='peer_tutoring' then
    '{"policyVersion":"2026-2027","bookingHorizonDays":7,"studentWeeklyMinutes":120,"examBlockMinutes":240,"examBlockSessionCap":4,"reviewAfterSessions":3,"formatCapacities":{"individual":[1,3],"small_group":[3,8]},"tutorHardWeeklyHours":8,"liveGates":["office_hours","outlook_free_busy","manager_review_duration","student_agreement_e_signature_approval"]}'::jsonb
  else '{"policyVersion":"2026","liveGates":["duration","buffers","office_hours","outlook_free_busy","administrative_approval"]}'::jsonb end;

create or replace function public.oaca_acknowledge_policy(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare doc public.oaca_policy_documents%rowtype; kind text:=coalesce(payload->>'kind',''); typed text:=trim(coalesce(payload->>'typedName','')); result public.oaca_policy_acknowledgments%rowtype;
begin
  perform public.require_experience_membership('oaca');
  select * into doc from public.oaca_policy_documents where policy_key=payload->>'policyKey' and status='approved_source' order by created_at desc limit 1;
  if not found or not doc.requires_acknowledgment then raise exception 'Choose a current acknowledgment policy' using errcode='22023'; end if;
  if length(typed)<2 or length(typed)>200 then raise exception 'Type your full name to acknowledge the policy' using errcode='22023'; end if;
  if kind='student_tutoring' then
    if doc.audience not in ('student','student_and_peer_tutor') or not exists(select 1 from public.experience_role_assignments where user_id=public.current_profile_user_id() and experience_key='oaca' and role='student' and revoked_at is null)
    then raise exception 'Student acknowledgment is not available' using errcode='42501'; end if;
  elsif kind='peer_tutor' then
    if doc.audience not in ('peer_tutor','student_and_peer_tutor') or not exists(select 1 from public.oaca_providers where user_id=public.current_profile_user_id() and classification='peer_tutor' and active)
    then raise exception 'Peer tutor acknowledgment is not available' using errcode='42501'; end if;
  else raise exception 'Choose a valid acknowledgment type' using errcode='22023'; end if;
  insert into public.oaca_policy_acknowledgments(user_id,policy_document_id,acknowledgment_kind,typed_name,user_agent)
  values(public.current_profile_user_id(),doc.id,kind,typed,left(coalesce(payload->>'userAgent',''),500))
  on conflict(user_id,policy_document_id,acknowledgment_kind) do update set typed_name=excluded.typed_name,acknowledged_at=now(),user_agent=excluded.user_agent returning * into result;
  if kind='peer_tutor' then
    update public.oaca_tutor_compliance set handbook_acknowledgment_id=result.id,updated_at=now()
    where provider_id in (select id from public.oaca_providers where user_id=public.current_profile_user_id() and classification='peer_tutor');
  end if;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata) values(public.current_profile_user_id(),'oaca_policy_acknowledged','oaca_policy_acknowledgment',result.id,jsonb_build_object('experienceKey','oaca','policyKey',doc.policy_key,'version',doc.version_label,'kind',kind));
  return jsonb_build_object('id',result.id,'policyKey',doc.policy_key,'versionLabel',doc.version_label,'acknowledgedAt',result.acknowledged_at);
end $$;

create or replace function public.oaca_create_appointment(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  service public.oaca_service_lines%rowtype; chosen_provider uuid; requested_start timestamptz; requested_end timestamptz;
  requested_modality text:=coalesce(payload->>'modality',''); requested_format text:=coalesce(payload->>'format','individual'); result public.oaca_appointments%rowtype;
  sandbox_required boolean; existing_minutes numeric:=0; existing_sessions integer:=0; block_key text:=trim(coalesce(payload#>>'{policyContext,examBlockKey}','')); obligation uuid;
begin
  perform public.require_experience_membership('oaca');
  if not exists(select 1 from public.experience_role_assignments where user_id=public.current_profile_user_id() and experience_key='oaca' and role='student' and revoked_at is null)
  then raise exception 'OACA student role required' using errcode='42501'; end if;
  if coalesce(payload->>'serviceLineId','') !~* '^[0-9a-f-]{36}$' then raise exception 'Choose a valid service' using errcode='22023'; end if;
  select * into service from public.oaca_service_lines where id=(payload->>'serviceLineId')::uuid;
  if not found then raise exception 'Service not found' using errcode='22023'; end if;
  if not exists(select 1 from public.experience_role_assignments where user_id=public.current_profile_user_id() and experience_key='oaca' and organization_id=service.organization_id and revoked_at is null)
  then raise exception 'Service is outside your assignment' using errcode='42501'; end if;
  if requested_modality<>all(service.modalities) then raise exception 'Modality is not enabled for this service' using errcode='22023'; end if;
  if requested_format not in ('individual','small_group','drop_in') then raise exception 'Choose a valid format' using errcode='22023'; end if;
  begin requested_start:=(payload->>'startsAt')::timestamptz; exception when others then raise exception 'Choose a valid appointment time' using errcode='22023'; end;
  if requested_start<now() then raise exception 'Choose a future appointment time' using errcode='22023'; end if;
  requested_end:=requested_start+make_interval(mins=>coalesce(service.duration_minutes,30));
  sandbox_required:=service.policy_status<>'live_approved' or coalesce((select sandbox_only from public.experience_feature_flags where experience_key='oaca'),true);
  if service.provider_rule='assigned' then
    select a.provider_id into chosen_provider from public.oaca_advisor_assignments a join public.oaca_providers p on p.id=a.provider_id where a.student_id=public.current_profile_user_id() and a.ended_at is null and p.active and p.organization_id=service.organization_id order by a.assigned_at desc limit 1;
    if chosen_provider is null then raise exception 'Your permanent academic advisor assignment is pending' using errcode='23514'; end if;
  elsif nullif(payload->>'providerId','') is not null then
    chosen_provider:=(payload->>'providerId')::uuid;
    if not exists(select 1 from public.oaca_provider_services ps join public.oaca_providers p on p.id=ps.provider_id where ps.provider_id=chosen_provider and ps.service_line_id=service.id and p.active)
    then raise exception 'Provider is not eligible for this service' using errcode='23514'; end if;
  end if;
  if service.key='peer_tutoring' then
    if chosen_provider is null then raise exception 'Choose an eligible peer tutor' using errcode='23514'; end if;
    if trim(coalesce(payload->>'topic',''))='' or block_key='' then raise exception 'Course or subject and exam block are required for peer tutoring' using errcode='22023'; end if;
    if requested_start>now()+interval '7 days' then raise exception 'Peer tutoring may be booked no more than one week in advance' using errcode='23514'; end if;
    if exists(select 1 from public.oaca_scheduling_restrictions where student_id=public.current_profile_user_id() and service_line_id=service.id and released_at is null and (ends_at is null or ends_at>now()))
    then raise exception 'Peer tutoring scheduling is temporarily restricted; contact the Tutoring Manager' using errcode='42501'; end if;
    select coalesce(sum(extract(epoch from (a.ends_at-a.starts_at))/60),0) into existing_minutes from public.oaca_appointments a join public.oaca_service_lines s on s.id=a.service_line_id where a.student_id=public.current_profile_user_id() and s.key='peer_tutoring' and a.status in ('pending_approval','counterproposed','confirmed','completed') and a.starts_at>=date_trunc('week',requested_start) and a.starts_at<date_trunc('week',requested_start)+interval '7 days';
    if existing_minutes+extract(epoch from (requested_end-requested_start))/60>120 then raise exception 'This request would exceed the two-hour weekly tutoring limit' using errcode='23514'; end if;
    select coalesce(sum(extract(epoch from (ends_at-starts_at))/60),0),count(*) into existing_minutes,existing_sessions from public.oaca_appointments where student_id=public.current_profile_user_id() and service_line_id=service.id and lower(coalesce(policy_context->>'examBlockKey',''))=lower(block_key) and lower(coalesce(subject,''))=lower(trim(payload->>'topic')) and status in ('pending_approval','counterproposed','confirmed','completed');
    if existing_minutes+extract(epoch from (requested_end-requested_start))/60>240 or existing_sessions+1>4 then raise exception 'This request would exceed the tutoring limit between exams' using errcode='23514'; end if;
    if not sandbox_required then
      if not exists(select 1 from public.oaca_policy_acknowledgments a join public.oaca_policy_documents d on d.id=a.policy_document_id where a.user_id=public.current_profile_user_id() and a.acknowledgment_kind='student_tutoring' and d.policy_key='peer_tutoring_student_agreement_2026_2027' and d.status='approved_source') then raise exception 'A current student tutoring acknowledgment is required' using errcode='23514'; end if;
      if not exists(select 1 from public.oaca_tutor_compliance c where c.provider_id=chosen_provider and c.eligible_at is not null and c.suspended_at is null) then raise exception 'The selected tutor is not currently eligible' using errcode='23514'; end if;
    end if;
  end if;
  if nullif(payload->>'obligationId','') is not null then
    obligation:=(payload->>'obligationId')::uuid;
    if not exists(select 1 from public.oaca_advising_obligations o join public.oaca_policy_rules r on r.id=o.policy_rule_id where o.id=obligation and o.student_id=public.current_profile_user_id() and o.status='open' and r.service_key=service.key)
    then raise exception 'This requirement cannot be linked to the selected service' using errcode='23514'; end if;
  end if;
  insert into public.oaca_appointments(organization_id,student_id,provider_id,service_line_id,subject,format,modality,starts_at,ends_at,preparation_note,status,sandbox,created_by,request_origin,policy_context,obligation_id)
  values(service.organization_id,public.current_profile_user_id(),chosen_provider,service.id,nullif(left(coalesce(payload->>'topic',''),240),''),requested_format,requested_modality,requested_start,requested_end,left(coalesce(payload->>'preparationNote',''),3000),'pending_approval',sandbox_required,public.current_profile_user_id(),'student',coalesce(payload->'policyContext','{}'::jsonb),obligation) returning * into result;
  if obligation is not null then update public.oaca_advising_obligations set status='scheduled' where id=obligation; end if;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(service.organization_id,public.current_profile_user_id(),'oaca_appointment_requested','oaca_appointment',result.id,jsonb_build_object('experienceKey','oaca','sandbox',sandbox_required,'serviceLineId',service.id,'requestOrigin','student','obligationId',obligation));
  return jsonb_build_object('id',result.id,'status',result.status,'sandbox',result.sandbox,'startsAt',result.starts_at,'endsAt',result.ends_at,'requestOrigin',result.request_origin);
end $$;

create or replace function public.oaca_advisor_create_appointment(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare service public.oaca_service_lines%rowtype; provider public.oaca_providers%rowtype; result public.oaca_appointments%rowtype; student uuid; requested_start timestamptz; requested_end timestamptz; modality text:=coalesce(payload->>'modality',''); sandbox_required boolean; obligation uuid;
begin
  perform public.require_experience_membership('oaca');
  if not exists(select 1 from public.experience_role_assignments where user_id=public.current_profile_user_id() and experience_key='oaca' and role in ('faculty','staff') and revoked_at is null)
  then raise exception 'OACA advisor role required' using errcode='42501'; end if;
  begin student:=(payload->>'studentId')::uuid; requested_start:=(payload->>'startsAt')::timestamptz; exception when others then raise exception 'Choose a valid student and appointment time' using errcode='22023'; end;
  select * into service from public.oaca_service_lines where id=(payload->>'serviceLineId')::uuid and key in ('academic_advising','career_advising');
  if not found then raise exception 'Advisors may schedule academic or career advising appointments' using errcode='22023'; end if;
  select * into provider from public.oaca_providers where user_id=public.current_profile_user_id() and organization_id=service.organization_id and classification in ('faculty','staff') and active limit 1;
  if not found then raise exception 'An active advisor provider record is required' using errcode='42501'; end if;
  if not exists(select 1 from public.experience_role_assignments where user_id=student and experience_key='oaca' and organization_id=service.organization_id and role='student' and revoked_at is null)
  then raise exception 'The student is outside your OACA organization' using errcode='42501'; end if;
  if not exists(select 1 from public.oaca_advisor_assignments where student_id=student and provider_id=provider.id and ended_at is null)
     and not exists(select 1 from public.experience_capability_assignments where user_id=public.current_profile_user_id() and experience_key='oaca' and capability='oaca.appointments.create_for_student' and organization_id=service.organization_id and revoked_at is null)
  then raise exception 'The student is outside your assignment or scheduling capability' using errcode='42501'; end if;
  if service.key='career_advising' and not exists(select 1 from public.oaca_provider_services where provider_id=provider.id and service_line_id=service.id)
  then raise exception 'This advisor is not eligible for career advising' using errcode='42501'; end if;
  if modality<>all(service.modalities) or requested_start<now() then raise exception 'Choose an enabled modality and future time' using errcode='22023'; end if;
  requested_end:=requested_start+make_interval(mins=>coalesce(service.duration_minutes,30));
  if exists(select 1 from public.oaca_appointments where provider_id=provider.id and status='confirmed' and tstzrange(starts_at,ends_at,'[)')&&tstzrange(requested_start,requested_end,'[)')) then raise exception 'This time is no longer available' using errcode='23505'; end if;
  if nullif(payload->>'obligationId','') is not null then
    obligation:=(payload->>'obligationId')::uuid;
    if not exists(select 1 from public.oaca_advising_obligations o join public.oaca_policy_rules r on r.id=o.policy_rule_id where o.id=obligation and o.student_id=student and o.status in ('open','scheduled') and r.service_key=service.key) then raise exception 'The requirement does not match this appointment' using errcode='23514'; end if;
  end if;
  sandbox_required:=service.policy_status<>'live_approved' or coalesce((select sandbox_only from public.experience_feature_flags where experience_key='oaca'),true);
  insert into public.oaca_appointments(organization_id,student_id,provider_id,service_line_id,subject,format,modality,starts_at,ends_at,preparation_note,status,sandbox,created_by,request_origin,policy_context,obligation_id)
  values(service.organization_id,student,provider.id,service.id,nullif(left(coalesce(payload->>'topic',''),240),''),'individual',modality,requested_start,requested_end,left(coalesce(payload->>'preparationNote',''),3000),'confirmed',sandbox_required,public.current_profile_user_id(),'advisor',coalesce(payload->'policyContext','{}'::jsonb),obligation) returning * into result;
  if obligation is not null then update public.oaca_advising_obligations set status='scheduled',assigned_provider_id=provider.id where id=obligation; end if;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(service.organization_id,public.current_profile_user_id(),'oaca_appointment_created_for_student','oaca_appointment',result.id,jsonb_build_object('experienceKey','oaca','studentId',student,'serviceLineId',service.id,'requestOrigin','advisor','obligationId',obligation));
  return jsonb_build_object('id',result.id,'status',result.status,'sandbox',result.sandbox,'startsAt',result.starts_at,'endsAt',result.ends_at,'requestOrigin',result.request_origin);
end $$;

create or replace function public.oaca_student_cancel_appointment(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare appointment public.oaca_appointments%rowtype; service public.oaca_service_lines%rowtype;
begin
  perform public.require_experience_membership('oaca');
  select * into appointment from public.oaca_appointments where id=(payload->>'appointmentId')::uuid and student_id=public.current_profile_user_id();
  if not found or appointment.status not in ('pending_approval','counterproposed','confirmed') then raise exception 'This appointment cannot be cancelled' using errcode='23514'; end if;
  select * into service from public.oaca_service_lines where id=appointment.service_line_id;
  if service.key='peer_tutoring' and appointment.starts_at<=now()+make_interval(mins=>coalesce(service.cancellation_window_minutes,1440)) then raise exception 'Peer tutoring changes require at least 24 hours notice; contact the Tutoring Manager' using errcode='23514'; end if;
  update public.oaca_appointments set status='cancelled',cancelled_at=now(),updated_at=now() where id=appointment.id returning * into appointment;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(appointment.organization_id,public.current_profile_user_id(),'oaca_appointment_cancelled_by_student','oaca_appointment',appointment.id,jsonb_build_object('experienceKey','oaca','requestOrigin',appointment.request_origin));
  return jsonb_build_object('id',appointment.id,'status',appointment.status,'cancelledAt',appointment.cancelled_at);
end $$;

create or replace function public.oaca_record_policy_trigger(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rule public.oaca_policy_rules%rowtype; student uuid; org uuid; assigned uuid; result public.oaca_advising_obligations%rowtype;
begin
  perform public.require_experience_membership('oaca');
  begin student:=(payload->>'studentId')::uuid; exception when others then raise exception 'Choose a valid student' using errcode='22023'; end;
  select * into rule from public.oaca_policy_rules where rule_key=payload->>'ruleKey' and active;
  if not found or rule.service_key not in ('academic_advising','career_advising') then raise exception 'Choose an advising requirement' using errcode='22023'; end if;
  select organization_id into org from public.experience_role_assignments where user_id=student and experience_key='oaca' and role='student' and revoked_at is null limit 1;
  if org is null then raise exception 'Student OACA membership not found' using errcode='42501'; end if;
  if not exists(select 1 from public.experience_capability_assignments where user_id=public.current_profile_user_id() and experience_key='oaca' and capability='oaca.obligations.manage' and organization_id=org and revoked_at is null)
  then raise exception 'Requirement management capability required' using errcode='42501'; end if;
  if rule.required_provider='assigned_advisor' then select provider_id into assigned from public.oaca_advisor_assignments where student_id=student and ended_at is null order by assigned_at desc limit 1; end if;
  insert into public.oaca_advising_obligations(student_id,organization_id,policy_rule_id,assigned_provider_id,source_type,source_reference,source_context,due_at,created_by)
  values(student,org,rule.id,assigned,left(coalesce(payload->>'sourceType',rule.trigger_type),100),nullif(left(coalesce(payload->>'sourceReference',''),240),''),coalesce(payload->'sourceContext','{}'::jsonb),nullif(payload->>'dueAt','')::timestamptz,public.current_profile_user_id()) returning * into result;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(org,public.current_profile_user_id(),'oaca_policy_obligation_created','oaca_advising_obligation',result.id,jsonb_build_object('experienceKey','oaca','ruleKey',rule.rule_key,'studentId',student));
  return jsonb_build_object('id',result.id,'status',result.status,'dueAt',result.due_at,'ruleKey',rule.rule_key);
end $$;

create or replace function public.oaca_submit_tutor_session_log(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare appointment public.oaca_appointments%rowtype; provider public.oaca_providers%rowtype; result public.oaca_tutor_session_logs%rowtype; tutoring_minutes integer; prep_minutes integer;
begin
  perform public.require_experience_membership('oaca');
  select * into provider from public.oaca_providers where user_id=public.current_profile_user_id() and classification='peer_tutor' and active limit 1;
  if not found then raise exception 'Active peer tutor provider required' using errcode='42501'; end if;
  select a.* into appointment from public.oaca_appointments a join public.oaca_service_lines s on s.id=a.service_line_id where a.id=(payload->>'appointmentId')::uuid and a.provider_id=provider.id and s.key='peer_tutoring' and a.status in ('confirmed','completed');
  if not found then raise exception 'Choose one of your peer tutoring appointments' using errcode='42501'; end if;
  tutoring_minutes:=coalesce(nullif(payload->>'tutoringMinutes','')::integer,round(extract(epoch from (appointment.ends_at-appointment.starts_at))/60)::integer);
  prep_minutes:=coalesce(nullif(payload->>'prepMinutes','')::integer,0);
  if prep_minutes>30*ceil(tutoring_minutes/60.0) and not coalesce((payload->>'prepApproved')::boolean,false) then raise exception 'Additional review preparation requires prior Tutoring Manager approval' using errcode='23514'; end if;
  insert into public.oaca_tutor_session_logs(appointment_id,provider_id,session_type,attendance_count,course_or_subject,tutoring_minutes,prep_minutes,workday_minutes,topics,session_summary,understanding,challenges,recommendations)
  values(appointment.id,provider.id,coalesce(payload->>'sessionType',appointment.format),coalesce(nullif(payload->>'attendanceCount','')::integer,1),left(coalesce(nullif(payload->>'courseOrSubject',''),appointment.subject),240),tutoring_minutes,prep_minutes,nullif(payload->>'workdayMinutes','')::integer,left(coalesce(payload->>'topics',''),4000),left(coalesce(payload->>'summary',''),6000),left(coalesce(payload->>'understanding',''),3000),left(coalesce(payload->>'challenges',''),3000),left(coalesce(payload->>'recommendations',''),4000)) returning * into result;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(appointment.organization_id,public.current_profile_user_id(),'oaca_tutor_session_logged','oaca_tutor_session_log',result.id,jsonb_build_object('experienceKey','oaca','appointmentId',appointment.id,'tutoringMinutes',tutoring_minutes,'prepMinutes',prep_minutes));
  return jsonb_build_object('id',result.id,'submittedAt',result.submitted_at);
end $$;

create or replace function public.oaca_apply_no_show_policy() returns trigger language plpgsql security definer set search_path=public as $$
declare service_key text; no_show_count integer;
begin
  if new.status='no_show' and old.status is distinct from 'no_show' then
    select key into service_key from public.oaca_service_lines where id=new.service_line_id;
    if service_key='peer_tutoring' then
      select count(*) into no_show_count from public.oaca_appointments a join public.oaca_service_lines s on s.id=a.service_line_id where a.student_id=new.student_id and s.key='peer_tutoring' and a.status='no_show';
      if no_show_count>=2 then
        insert into public.oaca_scheduling_restrictions(student_id,service_line_id,reason) values(new.student_id,new.service_line_id,'Two peer tutoring no-shows - Tutoring Manager review required') on conflict (student_id,service_line_id) where released_at is null do nothing;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists oaca_appointments_no_show_policy on public.oaca_appointments;
create trigger oaca_appointments_no_show_policy after update of status on public.oaca_appointments for each row execute function public.oaca_apply_no_show_policy();

alter table public.oaca_policy_documents enable row level security;
alter table public.oaca_policy_rules enable row level security;
alter table public.oaca_student_program_contexts enable row level security;
alter table public.oaca_advising_obligations enable row level security;
alter table public.oaca_policy_acknowledgments enable row level security;
alter table public.oaca_tutor_compliance enable row level security;
alter table public.oaca_tutor_session_logs enable row level security;
alter table public.oaca_scheduling_restrictions enable row level security;

create policy oaca_policy_documents_members on public.oaca_policy_documents for select to authenticated using (exists(select 1 from public.experience_role_assignments r where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.revoked_at is null));
create policy oaca_policy_rules_members on public.oaca_policy_rules for select to authenticated using (exists(select 1 from public.experience_role_assignments r where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.revoked_at is null));
create policy oaca_program_context_student_or_assigned on public.oaca_student_program_contexts for select to authenticated using (student_id=public.current_profile_user_id() or exists(select 1 from public.oaca_advisor_assignments a join public.oaca_providers p on p.id=a.provider_id where a.student_id=oaca_student_program_contexts.student_id and a.ended_at is null and p.user_id=public.current_profile_user_id()));
create policy oaca_obligations_student_or_assigned on public.oaca_advising_obligations for select to authenticated using (student_id=public.current_profile_user_id() or exists(select 1 from public.oaca_advisor_assignments a join public.oaca_providers p on p.id=a.provider_id where a.student_id=oaca_advising_obligations.student_id and a.ended_at is null and p.user_id=public.current_profile_user_id()));
create policy oaca_acknowledgments_self on public.oaca_policy_acknowledgments for select to authenticated using (user_id=public.current_profile_user_id());
create policy oaca_tutor_compliance_self on public.oaca_tutor_compliance for select to authenticated using (exists(select 1 from public.oaca_providers p where p.id=provider_id and p.user_id=public.current_profile_user_id()));
create policy oaca_tutor_logs_provider on public.oaca_tutor_session_logs for select to authenticated using (exists(select 1 from public.oaca_providers p where p.id=provider_id and p.user_id=public.current_profile_user_id()));
create policy oaca_restrictions_student on public.oaca_scheduling_restrictions for select to authenticated using (student_id=public.current_profile_user_id());

grant select on public.oaca_policy_documents,public.oaca_policy_rules,public.oaca_student_program_contexts,public.oaca_advising_obligations,public.oaca_policy_acknowledgments,public.oaca_tutor_compliance,public.oaca_tutor_session_logs,public.oaca_scheduling_restrictions to authenticated;
revoke all on function public.oaca_acknowledge_policy(jsonb),public.oaca_advisor_create_appointment(jsonb),public.oaca_student_cancel_appointment(jsonb),public.oaca_record_policy_trigger(jsonb),public.oaca_submit_tutor_session_log(jsonb) from public,anon;
grant execute on function public.oaca_acknowledge_policy(jsonb),public.oaca_advisor_create_appointment(jsonb),public.oaca_student_cancel_appointment(jsonb),public.oaca_record_policy_trigger(jsonb),public.oaca_submit_tutor_session_log(jsonb) to authenticated;

commit;
