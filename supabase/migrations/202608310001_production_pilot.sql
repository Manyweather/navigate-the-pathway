begin;

create extension if not exists pgcrypto;
create schema if not exists evaluation;
revoke all on schema evaluation from public, anon, authenticated;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  name text not null,
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('planned', 'active', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  preferred_name text,
  active_organization_id uuid references public.organizations(id),
  active_program_id uuid references public.programs(id),
  active_cohort_id uuid references public.cohorts(id),
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'advisor', 'administrator')),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid references public.programs(id) on delete cascade,
  cohort_id uuid references public.cohorts(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique nulls not distinct (user_id, role, organization_id, program_id, cohort_id)
);

create table if not exists public.permissions (
  key text primary key,
  description text not null
);

insert into public.permissions (key, description) values
  ('evaluation.identifiable_results', 'View and export identifiable evaluation responses and approved calculations')
on conflict (key) do update set description = excluded.description;

create table if not exists public.permission_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid references public.programs(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique nulls not distinct (user_id, permission_key, organization_id, program_id)
);

create table if not exists public.advisor_assignments (
  id uuid primary key default gen_random_uuid(),
  advisor_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  cohort_id uuid references public.cohorts(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid not null references auth.users(id),
  unique (advisor_id, student_id, program_id, starts_at)
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  cohort_id uuid references public.cohorts(id) on delete cascade,
  title text not null,
  topic text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  format text not null check (format in ('virtual', 'in_person')),
  check_in_opens_at timestamptz,
  check_in_closes_at timestamptz,
  status text not null default 'scheduled' check (status in ('draft', 'scheduled', 'completed', 'cancelled', 'archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  cohort_id uuid references public.cohorts(id) on delete set null,
  status text not null default 'active' check (status in ('invited', 'active', 'withdrawn', 'completed')),
  enrolled_at timestamptz not null default now(),
  unique (student_id, program_id)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('not_recorded', 'present', 'absent', 'excused')),
  recorded_at timestamptz not null default now(),
  source text not null check (source in ('student_check_in', 'administrator')),
  created_by uuid not null references auth.users(id),
  unique (session_id, student_id)
);

create table if not exists public.attendance_changes (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance(id) on delete cascade,
  previous_status text not null,
  new_status text not null,
  reason text not null,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  station text not null,
  artifact_type text not null,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  private_by_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  storage_path text not null,
  title text not null,
  document_type text not null,
  description text not null default '',
  current_revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.portfolio_documents(id) on delete cascade,
  revision integer not null,
  storage_path text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (document_id, revision)
);

create table if not exists public.advising_packets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  advisor_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  title text not null,
  status text not null default 'active' check (status in ('draft', 'active', 'revoked', 'expired', 'closed')),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packet_items (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.advising_packets(id) on delete cascade,
  item_type text not null check (item_type in ('artifact', 'portfolio_document', 'course_snapshot', 'experience', 'application_export')),
  item_id uuid,
  student_summary text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.advising_packets(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  actor_id uuid references auth.users(id),
  event_type text not null,
  subject_type text not null,
  subject_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.survey_completion_projection (
  assignment_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  cohort_id uuid references public.cohorts(id) on delete set null,
  instrument_slug text not null,
  instrument_name text not null,
  wave_id uuid not null,
  wave_label text not null,
  audience text not null check (audience in ('student', 'advisor')),
  status text not null check (status in ('not_available', 'not_started', 'in_progress', 'submitted', 'closed')),
  opens_at timestamptz,
  closes_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists evaluation.instrument_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  audience text not null check (audience in ('student', 'advisor')),
  expected_item_count integer not null check (expected_item_count > 0),
  expected_open_response_count integer not null default 0,
  permission_status text not null default 'documentation_required' check (permission_status in ('documentation_required', 'approved', 'restricted', 'blocked')),
  requires_pi_confirmation boolean not null default false,
  created_at timestamptz not null default now()
);

insert into evaluation.instrument_definitions (slug, name, audience, expected_item_count, expected_open_response_count, requires_pi_confirmation) values
  ('pre-health-application-profile', 'Your Pre-Health Application Profile: A Self-Assessment', 'student', 22, 2, false),
  ('short-grit-survey', 'Short Grit Survey', 'student', 8, 0, false),
  ('macleod-clark-professional-identity-scale', 'MacLeod Clark Professional Identity Scale', 'student', 9, 0, true),
  ('brief-resilience-scale', 'Brief Resilience Scale', 'student', 6, 0, false),
  ('advisor-coaching-competency-scale', 'Advisor Coaching Competency Scale (ACCS)', 'advisor', 20, 0, false)
on conflict (slug) do update set name = excluded.name, audience = excluded.audience, expected_item_count = excluded.expected_item_count,
  expected_open_response_count = excluded.expected_open_response_count, requires_pi_confirmation = excluded.requires_pi_confirmation;

create table if not exists evaluation.instrument_versions (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references evaluation.instrument_definitions(id) on delete restrict,
  version_label text not null,
  source_reference text not null,
  permission_reference text,
  content_complete boolean not null default false,
  pi_confirmed boolean not null default false,
  scoring_approved boolean not null default false,
  publish_status text not null default 'draft' check (publish_status in ('draft', 'blocked', 'approved', 'retired')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (instrument_id, version_label)
);

create table if not exists evaluation.items (
  id uuid primary key default gen_random_uuid(),
  instrument_version_id uuid not null references evaluation.instrument_versions(id) on delete cascade,
  position integer not null,
  prompt text not null,
  response_type text not null check (response_type in ('single_choice', 'text')),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (instrument_version_id, position)
);

create table if not exists evaluation.response_options (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references evaluation.items(id) on delete cascade,
  position integer not null,
  label text not null,
  value text not null,
  unique (item_id, position)
);

create table if not exists evaluation.consent_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  title text not null,
  body text not null,
  version_label text not null,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  created_at timestamptz not null default now()
);

create table if not exists evaluation.waves (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  cohort_id uuid references public.cohorts(id) on delete cascade,
  instrument_version_id uuid not null references evaluation.instrument_versions(id) on delete restrict,
  consent_version_id uuid not null references evaluation.consent_versions(id) on delete restrict,
  label text not null,
  audience text not null check (audience in ('student', 'advisor')),
  required boolean not null default false,
  opens_at timestamptz,
  closes_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'open', 'closed', 'cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists evaluation.assignments (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references evaluation.waves(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  cohort_id uuid references public.cohorts(id) on delete set null,
  assigned_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (wave_id, user_id)
);

create table if not exists evaluation.consent_records (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references evaluation.assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_version_id uuid not null references evaluation.consent_versions(id),
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (assignment_id, user_id, consent_version_id)
);

create table if not exists evaluation.withdrawals (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references evaluation.assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id),
  disposition text not null default 'pending' check (disposition in ('pending', 'processed', 'retained_per_policy'))
);

create table if not exists evaluation.response_sets (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references evaluation.assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  instrument_version_id uuid not null references evaluation.instrument_versions(id),
  revision integer not null default 1,
  supersedes_response_set_id uuid references evaluation.response_sets(id),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'superseded', 'withdrawn')),
  started_at timestamptz not null default now(),
  last_saved_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assignment_id, revision)
);

create table if not exists evaluation.item_responses (
  id uuid primary key default gen_random_uuid(),
  response_set_id uuid not null references evaluation.response_sets(id) on delete cascade,
  item_id uuid not null references evaluation.items(id),
  response_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (response_set_id, item_id)
);

create table if not exists evaluation.scoring_definitions (
  id uuid primary key default gen_random_uuid(),
  instrument_version_id uuid not null references evaluation.instrument_versions(id) on delete cascade,
  version_label text not null,
  definition jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  unique (instrument_version_id, version_label)
);

create table if not exists evaluation.approved_scores (
  id uuid primary key default gen_random_uuid(),
  response_set_id uuid not null references evaluation.response_sets(id) on delete cascade,
  scoring_definition_id uuid not null references evaluation.scoring_definitions(id),
  score_key text not null,
  score_value numeric,
  calculated_at timestamptz not null default now(),
  unique (response_set_id, scoring_definition_id, score_key)
);

create table if not exists evaluation.response_revisions (
  id uuid primary key default gen_random_uuid(),
  original_response_set_id uuid not null references evaluation.response_sets(id),
  revised_response_set_id uuid not null references evaluation.response_sets(id),
  reason text not null,
  authorized_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.staff_mfa_verified()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create or replace function public.has_role(requested_role text, requested_organization uuid default null, requested_program uuid default null, requested_cohort uuid default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.role_assignments r
    where r.user_id = auth.uid() and r.role = requested_role and r.revoked_at is null
      and (requested_organization is null or r.organization_id = requested_organization)
      and (requested_program is null or r.program_id is null or r.program_id = requested_program)
      and (requested_cohort is null or r.cohort_id is null or r.cohort_id = requested_cohort)
  );
$$;

create or replace function public.has_capability(requested_permission text, requested_organization uuid default null, requested_program uuid default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.permission_assignments p
    where p.user_id = auth.uid() and p.permission_key = requested_permission and p.revoked_at is null
      and (requested_organization is null or p.organization_id = requested_organization)
      and (requested_program is null or p.program_id is null or p.program_id = requested_program)
  );
$$;

create or replace function public.is_assigned_advisor(requested_student uuid, requested_program uuid default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.advisor_assignments a
    where a.advisor_id = auth.uid() and a.student_id = requested_student
      and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
      and (requested_program is null or a.program_id = requested_program)
  );
$$;

grant execute on function public.staff_mfa_verified() to authenticated;
grant execute on function public.has_role(text, uuid, uuid, uuid) to authenticated;
grant execute on function public.has_capability(text, uuid, uuid) to authenticated;
grant execute on function public.is_assigned_advisor(uuid, uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.programs enable row level security;
alter table public.cohorts enable row level security;
alter table public.profiles enable row level security;
alter table public.role_assignments enable row level security;
alter table public.permission_assignments enable row level security;
alter table public.advisor_assignments enable row level security;
alter table public.sessions enable row level security;
alter table public.enrollments enable row level security;
alter table public.attendance enable row level security;
alter table public.attendance_changes enable row level security;
alter table public.artifacts enable row level security;
alter table public.portfolio_documents enable row level security;
alter table public.portfolio_document_revisions enable row level security;
alter table public.advising_packets enable row level security;
alter table public.packet_items enable row level security;
alter table public.comments enable row level security;
alter table public.audit_events enable row level security;
alter table public.survey_completion_projection enable row level security;

create policy profiles_self on public.profiles for select to authenticated using (user_id = auth.uid());
create policy organizations_scoped on public.organizations for select to authenticated using (public.has_role('student', id, null, null) or (public.staff_mfa_verified() and (public.has_role('advisor', id, null, null) or public.has_role('administrator', id, null, null))));
create policy programs_scoped on public.programs for select to authenticated using (public.has_role('student', organization_id, id, null) or (public.staff_mfa_verified() and (public.has_role('advisor', organization_id, id, null) or public.has_role('administrator', organization_id, id, null))));
create policy cohorts_scoped on public.cohorts for select to authenticated using (public.has_role('student', organization_id, program_id, id) or (public.staff_mfa_verified() and (public.has_role('advisor', organization_id, program_id, id) or public.has_role('administrator', organization_id, program_id, id))));
create policy profiles_assigned_advisor on public.profiles for select to authenticated using (public.staff_mfa_verified() and public.is_assigned_advisor(user_id, active_program_id));
create policy profiles_admin on public.profiles for all to authenticated using (public.staff_mfa_verified() and public.has_role('administrator', active_organization_id, active_program_id, active_cohort_id)) with check (public.staff_mfa_verified() and public.has_role('administrator', active_organization_id, active_program_id, active_cohort_id));
create policy role_assignments_self on public.role_assignments for select to authenticated using (user_id = auth.uid());
create policy role_assignments_admin on public.role_assignments for all to authenticated using (public.staff_mfa_verified() and public.has_role('administrator', organization_id, program_id, cohort_id)) with check (public.staff_mfa_verified() and public.has_role('administrator', organization_id, program_id, cohort_id));
create policy permission_assignments_self on public.permission_assignments for select to authenticated using (user_id = auth.uid());
create policy permission_assignments_admin on public.permission_assignments for all to authenticated using (public.staff_mfa_verified() and public.has_role('administrator', organization_id, program_id, null)) with check (public.staff_mfa_verified() and public.has_role('administrator', organization_id, program_id, null));
create policy advisor_assignments_participant on public.advisor_assignments for select to authenticated using (advisor_id = auth.uid() or student_id = auth.uid() or (public.staff_mfa_verified() and public.has_role('administrator', organization_id, program_id, cohort_id)));
create policy sessions_enrolled on public.sessions for select to authenticated using (exists (select 1 from public.enrollments e where e.student_id = auth.uid() and e.program_id = sessions.program_id and e.status = 'active') or (public.staff_mfa_verified() and (public.has_role('advisor', organization_id, program_id, cohort_id) or public.has_role('administrator', organization_id, program_id, cohort_id))));
create policy enrollments_self on public.enrollments for select to authenticated using (student_id = auth.uid());
create policy enrollments_assigned_advisor on public.enrollments for select to authenticated using (public.staff_mfa_verified() and public.is_assigned_advisor(student_id, program_id));
create policy enrollments_admin on public.enrollments for all to authenticated using (public.staff_mfa_verified() and public.has_role('administrator', organization_id, program_id, cohort_id)) with check (public.staff_mfa_verified() and public.has_role('administrator', organization_id, program_id, cohort_id));
create policy attendance_student on public.attendance for select to authenticated using (student_id = auth.uid());
create policy attendance_assigned_advisor on public.attendance for select to authenticated using (public.staff_mfa_verified() and public.is_assigned_advisor(student_id, (select program_id from public.sessions where id = session_id)));
create policy attendance_admin on public.attendance for all to authenticated using (public.staff_mfa_verified() and public.has_role('administrator', null, (select program_id from public.sessions where id = session_id), null)) with check (public.staff_mfa_verified() and public.has_role('administrator', null, (select program_id from public.sessions where id = session_id), null));
create policy attendance_changes_student on public.attendance_changes for select to authenticated using (exists (select 1 from public.attendance a where a.id = attendance_id and a.student_id = auth.uid()));
create policy attendance_changes_advisor_admin on public.attendance_changes for select to authenticated using (public.staff_mfa_verified() and exists (select 1 from public.attendance a join public.sessions s on s.id = a.session_id where a.id = attendance_id and (public.is_assigned_advisor(a.student_id, s.program_id) or public.has_role('administrator', s.organization_id, s.program_id, s.cohort_id))));
create policy artifacts_owner on public.artifacts for all to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy portfolio_owner on public.portfolio_documents for all to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy portfolio_revision_owner on public.portfolio_document_revisions for all to authenticated using (exists (select 1 from public.portfolio_documents d where d.id = document_id and d.student_id = auth.uid())) with check (exists (select 1 from public.portfolio_documents d where d.id = document_id and d.student_id = auth.uid()));
create policy packet_owner_or_assigned_advisor on public.advising_packets for select to authenticated using (student_id = auth.uid() or (advisor_id = auth.uid() and public.staff_mfa_verified() and status = 'active' and revoked_at is null and (expires_at is null or expires_at > now())));
create policy packet_owner_write on public.advising_packets for all to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid() and public.is_assigned_advisor(student_id, program_id));
create policy packet_items_visible on public.packet_items for select to authenticated using (exists (select 1 from public.advising_packets p where p.id = packet_id and (p.student_id = auth.uid() or (p.advisor_id = auth.uid() and public.staff_mfa_verified() and p.status = 'active' and p.revoked_at is null and (p.expires_at is null or p.expires_at > now())))));
create policy packet_items_owner_write on public.packet_items for all to authenticated using (exists (select 1 from public.advising_packets p where p.id = packet_id and p.student_id = auth.uid())) with check (exists (select 1 from public.advising_packets p where p.id = packet_id and p.student_id = auth.uid()));
create policy comments_packet_participant on public.comments for select to authenticated using (exists (select 1 from public.advising_packets p where p.id = packet_id and (p.student_id = auth.uid() or (p.advisor_id = auth.uid() and public.staff_mfa_verified() and p.status = 'active' and p.revoked_at is null and (p.expires_at is null or p.expires_at > now())))));
create policy comments_author on public.comments for insert to authenticated with check (author_id = auth.uid() and exists (select 1 from public.advising_packets p where p.id = packet_id and (p.student_id = auth.uid() or (p.advisor_id = auth.uid() and public.staff_mfa_verified()))));
create policy survey_projection_self on public.survey_completion_projection for select to authenticated using (user_id = auth.uid());
create policy survey_projection_assigned_advisor on public.survey_completion_projection for select to authenticated using (audience = 'student' and public.staff_mfa_verified() and public.is_assigned_advisor(user_id, program_id));
create policy survey_projection_admin on public.survey_completion_projection for select to authenticated using (public.staff_mfa_verified() and public.has_role('administrator', organization_id, program_id, cohort_id));
create policy audit_events_admin on public.audit_events for select to authenticated using (public.staff_mfa_verified() and public.has_role('administrator', organization_id, null, null));

create or replace function evaluation.block_submitted_response_changes()
returns trigger language plpgsql set search_path = evaluation, pg_temp as $$
begin
  if old.status = 'submitted' then raise exception 'Submitted survey responses are immutable' using errcode = '23000'; end if;
  return new;
end;
$$;

create trigger response_sets_immutable before update or delete on evaluation.response_sets for each row execute function evaluation.block_submitted_response_changes();

create or replace function evaluation.project_assignment()
returns trigger language plpgsql security definer set search_path = public, evaluation, pg_temp as $$
declare w evaluation.waves; v evaluation.instrument_versions; d evaluation.instrument_definitions;
begin
  select * into w from evaluation.waves where id = new.wave_id;
  select * into v from evaluation.instrument_versions where id = w.instrument_version_id;
  select * into d from evaluation.instrument_definitions where id = v.instrument_id;
  insert into public.survey_completion_projection (assignment_id, user_id, organization_id, program_id, cohort_id, instrument_slug, instrument_name, wave_id, wave_label, audience, status, opens_at, closes_at)
  values (new.id, new.user_id, new.organization_id, new.program_id, new.cohort_id, d.slug, d.name, w.id, w.label, w.audience,
    case when w.status = 'closed' then 'closed' when w.status = 'open' and (w.opens_at is null or w.opens_at <= now()) and (w.closes_at is null or w.closes_at >= now()) then 'not_started' else 'not_available' end,
    w.opens_at, w.closes_at)
  on conflict (assignment_id) do update set wave_label = excluded.wave_label, status = excluded.status, opens_at = excluded.opens_at, closes_at = excluded.closes_at, updated_at = now();
  return new;
end;
$$;
create trigger assignment_completion_projection after insert or update of wave_id, withdrawn_at on evaluation.assignments for each row execute function evaluation.project_assignment();

create or replace function evaluation.refresh_wave_projection()
returns trigger language plpgsql security definer set search_path = public, evaluation, pg_temp as $$
begin
  update public.survey_completion_projection set wave_label = new.label, opens_at = new.opens_at, closes_at = new.closes_at,
    status = case when status in ('in_progress', 'submitted') then status when new.status = 'closed' then 'closed' when new.status = 'open' and (new.opens_at is null or new.opens_at <= now()) and (new.closes_at is null or new.closes_at >= now()) then 'not_started' else 'not_available' end,
    updated_at = now() where wave_id = new.id;
  return new;
end;
$$;
create trigger wave_completion_projection after update of label, status, opens_at, closes_at on evaluation.waves for each row execute function evaluation.refresh_wave_projection();

create or replace function public.pilot_authorization_context()
returns jsonb language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
declare profile_record public.profiles; result jsonb;
begin
  select * into profile_record from public.profiles where user_id = auth.uid();
  if profile_record.user_id is null then raise exception 'No pilot profile is assigned to this account' using errcode = '42501'; end if;
  select jsonb_build_object(
    'userId', auth.uid(),
    'displayName', profile_record.display_name,
    'email', coalesce((select email from auth.users where id = auth.uid()), ''),
    'roles', coalesce((select jsonb_agg(distinct role order by role) from public.role_assignments where user_id = auth.uid() and revoked_at is null), '[]'::jsonb),
    'activeOrganizationId', profile_record.active_organization_id,
    'activeProgramId', profile_record.active_program_id,
    'activeCohortId', profile_record.active_cohort_id,
    'capabilities', coalesce((select jsonb_agg(distinct permission_key order by permission_key) from public.permission_assignments where user_id = auth.uid() and revoked_at is null), '[]'::jsonb),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'environment', coalesce(current_setting('app.pilot_environment', true), 'production')
  ) into result;
  return result;
end;
$$;
grant execute on function public.pilot_authorization_context() to authenticated;

create or replace function public.my_survey_assignments()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assignment_id, 'instrumentSlug', instrument_slug, 'instrumentName', instrument_name,
    'itemCount', coalesce((select expected_item_count from evaluation.instrument_definitions where slug = p.instrument_slug), 0),
    'openResponseCount', coalesce((select expected_open_response_count from evaluation.instrument_definitions where slug = p.instrument_slug), 0),
    'waveLabel', wave_label, 'required', false, 'opensAt', opens_at, 'closesAt', closes_at,
    'status', status, 'submittedAt', submitted_at
  ) order by wave_label, instrument_name), '[]'::jsonb)
  from public.survey_completion_projection p where user_id = auth.uid();
$$;
grant execute on function public.my_survey_assignments() to authenticated;

create or replace function public.get_my_survey_assignment(assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, evaluation, pg_temp as $$
declare a evaluation.assignments; w evaluation.waves; v evaluation.instrument_versions; d evaluation.instrument_definitions; c evaluation.consent_versions; r evaluation.response_sets; result jsonb;
begin
  select * into a from evaluation.assignments where id = assignment_id and user_id = auth.uid() and withdrawn_at is null;
  if a.id is null then raise exception 'Survey assignment not found' using errcode = '42501'; end if;
  select * into w from evaluation.waves where id = a.wave_id;
  if w.status not in ('open', 'scheduled') or (w.opens_at is not null and w.opens_at > now()) or (w.closes_at is not null and w.closes_at < now()) then raise exception 'This survey is not currently available' using errcode = '22023'; end if;
  select * into v from evaluation.instrument_versions where id = w.instrument_version_id;
  select * into d from evaluation.instrument_definitions where id = v.instrument_id;
  select * into c from evaluation.consent_versions where id = w.consent_version_id and status = 'approved';
  if v.publish_status <> 'approved' or not v.content_complete or d.permission_status <> 'approved' or c.id is null or (d.requires_pi_confirmation and not v.pi_confirmed) then
    return jsonb_build_object('id', a.id, 'instrumentSlug', d.slug, 'instrumentName', d.name, 'itemCount', d.expected_item_count, 'openResponseCount', d.expected_open_response_count, 'waveLabel', w.label, 'required', w.required, 'opensAt', w.opens_at, 'closesAt', w.closes_at, 'status', 'not_available', 'submittedAt', null, 'consentVersionId', w.consent_version_id, 'consentTitle', 'Release pending', 'consentBody', 'Approved survey content is not available yet.', 'instrumentVersion', v.version_label, 'items', '[]'::jsonb, 'draft', '{}'::jsonb, 'lastSavedAt', null);
  end if;
  select * into r from evaluation.response_sets where assignment_id = a.id and status in ('in_progress', 'submitted') order by revision desc limit 1;
  return jsonb_build_object(
    'id', a.id, 'instrumentSlug', d.slug, 'instrumentName', d.name, 'itemCount', d.expected_item_count, 'openResponseCount', d.expected_open_response_count,
    'waveLabel', w.label, 'required', w.required, 'opensAt', w.opens_at, 'closesAt', w.closes_at,
    'status', case when r.status = 'submitted' then 'submitted' when r.id is not null then 'in_progress' else 'not_started' end,
    'submittedAt', r.submitted_at, 'consentVersionId', c.id, 'consentTitle', c.title, 'consentBody', c.body,
    'instrumentVersion', v.version_label,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'position', i.position, 'prompt', i.prompt, 'responseType', i.response_type, 'required', i.required, 'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'value', o.value, 'position', o.position) order by o.position) from evaluation.response_options o where o.item_id = i.id), '[]'::jsonb)) order by i.position) from evaluation.items i where i.instrument_version_id = v.id), '[]'::jsonb),
    'draft', coalesce((select jsonb_object_agg(ir.item_id::text, ir.response_value) from evaluation.item_responses ir where ir.response_set_id = r.id), '{}'::jsonb),
    'lastSavedAt', r.last_saved_at
  );
end;
$$;
grant execute on function public.get_my_survey_assignment(uuid) to authenticated;

create or replace function public.save_my_survey_draft(assignment_id uuid, consent_version_id uuid, answers jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, evaluation, pg_temp as $$
declare a evaluation.assignments; w evaluation.waves; r evaluation.response_sets; answer record;
begin
  select * into a from evaluation.assignments where id = assignment_id and user_id = auth.uid() and withdrawn_at is null;
  if a.id is null then raise exception 'Survey assignment not found' using errcode = '42501'; end if;
  select * into w from evaluation.waves where id = a.wave_id and status = 'open' and (opens_at is null or opens_at <= now()) and (closes_at is null or closes_at >= now());
  if w.id is null or w.consent_version_id <> consent_version_id then raise exception 'The survey or consent version is not available' using errcode = '22023'; end if;
  insert into evaluation.consent_records (assignment_id, user_id, consent_version_id) values (a.id, auth.uid(), consent_version_id) on conflict do nothing;
  select * into r from evaluation.response_sets where assignment_id = a.id and status = 'in_progress' order by revision desc limit 1;
  if r.id is null then insert into evaluation.response_sets (assignment_id, user_id, instrument_version_id) values (a.id, auth.uid(), w.instrument_version_id) returning * into r; end if;
  delete from evaluation.item_responses where response_set_id = r.id;
  for answer in select key, value from jsonb_each_text(coalesce(answers, '{}'::jsonb)) loop
    insert into evaluation.item_responses (response_set_id, item_id, response_value)
    select r.id, i.id, answer.value from evaluation.items i where i.id = answer.key::uuid and i.instrument_version_id = w.instrument_version_id;
  end loop;
  update evaluation.response_sets set last_saved_at = now() where id = r.id;
  update public.survey_completion_projection set status = 'in_progress', started_at = coalesce(started_at, now()), updated_at = now() where assignment_id = a.id and status <> 'submitted';
  insert into public.audit_events (organization_id, actor_id, event_type, subject_type, subject_id) values (a.organization_id, auth.uid(), 'survey_draft_saved', 'survey_assignment', a.id::text);
  return jsonb_build_object('ok', true, 'lastSavedAt', now());
end;
$$;
grant execute on function public.save_my_survey_draft(uuid, uuid, jsonb) to authenticated;

create or replace function public.submit_my_survey_response(assignment_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, evaluation, pg_temp as $$
declare a evaluation.assignments; w evaluation.waves; r evaluation.response_sets; missing_required integer;
begin
  select * into a from evaluation.assignments where id = assignment_id and user_id = auth.uid() and withdrawn_at is null;
  if a.id is null then raise exception 'Survey assignment not found' using errcode = '42501'; end if;
  select * into w from evaluation.waves where id = a.wave_id and status = 'open' and (opens_at is null or opens_at <= now()) and (closes_at is null or closes_at >= now());
  select * into r from evaluation.response_sets where assignment_id = a.id and status = 'in_progress' order by revision desc limit 1;
  if w.id is null or r.id is null then raise exception 'A saved, open survey is required before submission' using errcode = '22023'; end if;
  select count(*) into missing_required from evaluation.items i where i.instrument_version_id = w.instrument_version_id and i.required and not exists (select 1 from evaluation.item_responses ir where ir.response_set_id = r.id and ir.item_id = i.id and btrim(ir.response_value) <> '');
  if missing_required > 0 then raise exception 'Complete all required items before submission' using errcode = '23514'; end if;
  update evaluation.response_sets set status = 'submitted', submitted_at = now(), last_saved_at = now() where id = r.id;
  update public.survey_completion_projection set status = 'submitted', submitted_at = now(), updated_at = now() where assignment_id = a.id;
  insert into public.audit_events (organization_id, actor_id, event_type, subject_type, subject_id) values (a.organization_id, auth.uid(), 'survey_submitted', 'survey_assignment', a.id::text);
  return jsonb_build_object('ok', true, 'submittedAt', now());
end;
$$;
grant execute on function public.submit_my_survey_response(uuid) to authenticated;

create or replace function public.pilot_dashboard(requested_role text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if not public.has_role(requested_role, null, null, null) then raise exception 'Role is not assigned' using errcode = '42501'; end if;
  if requested_role <> 'student' and not public.staff_mfa_verified() then raise exception 'Staff MFA is required' using errcode = '42501'; end if;
  if requested_role = 'student' then
    select jsonb_build_object(
      'nextSession', (select jsonb_build_object('id', s.id, 'title', s.title, 'topic', s.topic, 'startsAt', s.starts_at, 'endsAt', s.ends_at, 'format', s.format, 'attendanceStatus', coalesce(a.status, 'not_recorded'), 'checkInAvailable', now() between s.check_in_opens_at and s.check_in_closes_at) from public.sessions s join public.enrollments e on e.program_id = s.program_id and e.student_id = auth.uid() and e.status = 'active' left join public.attendance a on a.session_id = s.id and a.student_id = auth.uid() where s.status = 'scheduled' and s.starts_at >= now() order by s.starts_at limit 1),
      'attendanceHistory', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'topic', s.topic, 'startsAt', s.starts_at, 'endsAt', s.ends_at, 'format', s.format, 'attendanceStatus', coalesce(a.status, 'not_recorded'), 'checkInAvailable', false) order by s.starts_at desc) from public.sessions s join public.enrollments e on e.program_id = s.program_id and e.student_id = auth.uid() left join public.attendance a on a.session_id = s.id and a.student_id = auth.uid() where s.starts_at < now()), '[]'::jsonb),
      'surveyAssignments', public.my_survey_assignments(),
      'portfolio', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'documentType', d.document_type, 'sharedWithAdvisor', exists (select 1 from public.packet_items pi join public.advising_packets p on p.id = pi.packet_id where pi.item_type = 'portfolio_document' and pi.item_id = d.id and p.status = 'active' and p.revoked_at is null and (p.expires_at is null or p.expires_at > now())), 'updatedAt', d.updated_at) order by d.updated_at desc) from public.portfolio_documents d where d.student_id = auth.uid()), '[]'::jsonb),
      'advisingPackets', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'status', case when p.revoked_at is not null then 'revoked' when p.expires_at < now() then 'expired' else p.status end, 'expiresAt', p.expires_at) order by p.updated_at desc) from public.advising_packets p where p.student_id = auth.uid()), '[]'::jsonb)
    ) into result;
  elsif requested_role = 'advisor' then
    select jsonb_build_object(
      'assignedStudents', coalesce((select jsonb_agg(jsonb_build_object('id', p.user_id, 'displayName', p.display_name, 'cohortName', coalesce(c.name, 'No cohort'), 'attendance', jsonb_build_object('present', (select count(*) from public.attendance a where a.student_id = p.user_id and a.status = 'present'), 'expected', (select count(*) from public.sessions s where s.program_id = aa.program_id and s.starts_at < now())), 'surveyCompletion', coalesce((select jsonb_agg(jsonb_build_object('instrumentName', sc.instrument_name, 'status', sc.status, 'submittedAt', sc.submitted_at)) from public.survey_completion_projection sc where sc.user_id = p.user_id), '[]'::jsonb), 'sharedPacketCount', (select count(*) from public.advising_packets ap where ap.student_id = p.user_id and ap.advisor_id = auth.uid() and ap.status = 'active' and ap.revoked_at is null and (ap.expires_at is null or ap.expires_at > now()))) order by p.display_name) from public.advisor_assignments aa join public.profiles p on p.user_id = aa.student_id left join public.cohorts c on c.id = aa.cohort_id where aa.advisor_id = auth.uid() and aa.starts_at <= now() and (aa.ends_at is null or aa.ends_at > now())), '[]'::jsonb),
      'mySurveys', public.my_survey_assignments()
    ) into result;
  else
    select jsonb_build_object(
      'counts', jsonb_build_object('invitedUsers', (select count(*) from public.profiles where status = 'invited'), 'activeUsers', (select count(*) from public.profiles where status = 'active'), 'cohorts', (select count(*) from public.cohorts), 'sessions', (select count(*) from public.sessions)),
      'surveyCompletion', coalesce((select jsonb_agg(jsonb_build_object('instrumentName', instrument_name, 'assigned', assigned, 'submitted', submitted) order by instrument_name) from (select instrument_name, count(*) assigned, count(*) filter (where status = 'submitted') submitted from public.survey_completion_projection group by instrument_name) x), '[]'::jsonb),
      'pendingCurriculumReviews', 0,
      'attendanceCorrections', (select count(*) from public.attendance_changes)
    ) into result;
  end if;
  return result;
end;
$$;
grant execute on function public.pilot_dashboard(text) to authenticated;

create or replace function public.admin_assign_invited_user(target_user_id uuid, target_email text, target_roles text[], target_organization_id uuid, target_program_id uuid, target_cohort_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare assigned_role text;
begin
  if not public.staff_mfa_verified() or not public.has_role('administrator', target_organization_id, target_program_id, target_cohort_id) then raise exception 'Administrator MFA and scope are required' using errcode = '42501'; end if;
  insert into public.profiles (user_id, display_name, active_organization_id, active_program_id, active_cohort_id) values (target_user_id, split_part(target_email, '@', 1), target_organization_id, target_program_id, target_cohort_id) on conflict (user_id) do nothing;
  foreach assigned_role in array target_roles loop
    if assigned_role not in ('student', 'advisor', 'administrator') then raise exception 'Invalid role'; end if;
    insert into public.role_assignments (user_id, role, organization_id, program_id, cohort_id, granted_by) values (target_user_id, assigned_role, target_organization_id, target_program_id, target_cohort_id, auth.uid()) on conflict do nothing;
  end loop;
  insert into public.audit_events (organization_id, actor_id, event_type, subject_type, subject_id, metadata) values (target_organization_id, auth.uid(), 'account_invited', 'profile', target_user_id::text, jsonb_build_object('roles', target_roles));
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_assign_invited_user(uuid, text, text[], uuid, uuid, uuid) to authenticated;

create or replace function public.admin_survey_waves()
returns jsonb language plpgsql stable security definer set search_path = public, evaluation, pg_temp as $$
begin
  if not public.staff_mfa_verified() or not public.has_role('administrator', null, null, null) then raise exception 'Administrator MFA is required' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'label', w.label, 'instrumentVersionId', w.instrument_version_id, 'audience', w.audience, 'required', w.required, 'opensAt', w.opens_at, 'closesAt', w.closes_at, 'status', w.status) order by w.created_at desc) from evaluation.waves w), '[]'::jsonb);
end;
$$;
grant execute on function public.admin_survey_waves() to authenticated;

create or replace function public.admin_upsert_survey_wave(id uuid default null, organization_id uuid default null, program_id uuid default null, cohort_id uuid default null, instrument_version_id uuid default null, consent_version_id uuid default null, label text default null, audience text default null, required boolean default false, opens_at timestamptz default null, closes_at timestamptz default null, status text default 'draft')
returns jsonb language plpgsql volatile security definer set search_path = public, evaluation, pg_temp as $$
declare saved evaluation.waves; instrument evaluation.instrument_versions; definition evaluation.instrument_definitions; consent evaluation.consent_versions;
begin
  if not public.staff_mfa_verified() or not public.has_role('administrator', organization_id, program_id, cohort_id) then raise exception 'Administrator MFA and scope are required' using errcode = '42501'; end if;
  select * into instrument from evaluation.instrument_versions where evaluation.instrument_versions.id = instrument_version_id;
  select * into definition from evaluation.instrument_definitions where evaluation.instrument_definitions.id = instrument.instrument_id;
  select * into consent from evaluation.consent_versions where evaluation.consent_versions.id = consent_version_id;
  if status in ('scheduled', 'open') and (
    instrument.publish_status <> 'approved' or not instrument.content_complete or definition.permission_status <> 'approved' or consent.status <> 'approved'
    or (definition.requires_pi_confirmation and not instrument.pi_confirmed)
    or (select count(*) from evaluation.items where evaluation.items.instrument_version_id = instrument.id) <> definition.expected_item_count + definition.expected_open_response_count
  ) then raise exception 'Instrument permissions, content, counts, consent, and PI confirmation must be approved before release' using errcode = '23514'; end if;
  insert into evaluation.waves as w (id, organization_id, program_id, cohort_id, instrument_version_id, consent_version_id, label, audience, required, opens_at, closes_at, status, created_by)
  values (coalesce(id, gen_random_uuid()), organization_id, program_id, cohort_id, instrument_version_id, consent_version_id, label, audience, required, opens_at, closes_at, status, auth.uid())
  on conflict (id) do update set cohort_id = excluded.cohort_id, instrument_version_id = excluded.instrument_version_id, consent_version_id = excluded.consent_version_id, label = excluded.label, audience = excluded.audience, required = excluded.required, opens_at = excluded.opens_at, closes_at = excluded.closes_at, status = excluded.status returning * into saved;
  insert into public.audit_events (organization_id, actor_id, event_type, subject_type, subject_id, metadata) values (organization_id, auth.uid(), 'survey_wave_saved', 'survey_wave', saved.id::text, jsonb_build_object('status', saved.status));
  return jsonb_build_object('ok', true, 'id', saved.id, 'status', saved.status);
end;
$$;
grant execute on function public.admin_upsert_survey_wave(uuid, uuid, uuid, uuid, uuid, uuid, text, text, boolean, timestamptz, timestamptz, text) to authenticated;

create or replace function public.evaluation_authorized_results(wave_id uuid default null, instrument_slug text default null)
returns setof jsonb language plpgsql volatile security definer set search_path = public, evaluation, pg_temp as $$
begin
  if not public.staff_mfa_verified() or not public.has_capability('evaluation.identifiable_results', null, null) then raise exception 'Evaluation authorization and MFA are required' using errcode = '42501'; end if;
  insert into public.audit_events (actor_id, event_type, subject_type, metadata) values (auth.uid(), 'identifiable_evaluation_results_accessed', 'evaluation_results', jsonb_build_object('waveId', wave_id, 'instrumentSlug', instrument_slug));
  return query select jsonb_build_object('assignmentId', a.id, 'userId', a.user_id, 'waveId', w.id, 'waveLabel', w.label, 'instrument', d.name, 'instrumentSlug', d.slug, 'responseSetId', r.id, 'revision', r.revision, 'submittedAt', r.submitted_at, 'answers', coalesce((select jsonb_object_agg(i.position::text, ir.response_value) from evaluation.item_responses ir join evaluation.items i on i.id = ir.item_id where ir.response_set_id = r.id), '{}'::jsonb), 'approvedScores', coalesce((select jsonb_object_agg(s.score_key, s.score_value) from evaluation.approved_scores s where s.response_set_id = r.id), '{}'::jsonb)) from evaluation.assignments a join evaluation.waves w on w.id = a.wave_id join evaluation.instrument_versions v on v.id = w.instrument_version_id join evaluation.instrument_definitions d on d.id = v.instrument_id join evaluation.response_sets r on r.assignment_id = a.id and r.status = 'submitted' where (wave_id is null or w.id = wave_id) and (instrument_slug is null or d.slug = instrument_slug);
end;
$$;
grant execute on function public.evaluation_authorized_results(uuid, text) to authenticated;

create or replace function public.configure_staging_tri_role_fixture(target_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare org_id uuid; program_id uuid; cohort_id uuid;
begin
  if coalesce(current_setting('app.pilot_environment', true), 'production') <> 'staging' then raise exception 'The tri-role fixture is staging-only' using errcode = '42501'; end if;
  if not public.staff_mfa_verified() or not public.has_role('administrator', null, null, null) then raise exception 'A staging administrator with MFA is required' using errcode = '42501'; end if;
  insert into public.organizations (name, slug) values ('Fictional Roseman Pilot', 'fictional-roseman-pilot') on conflict (slug) do update set name = excluded.name returning id into org_id;
  insert into public.programs (organization_id, name, slug) values (org_id, 'Navigate Fictional Program', 'navigate-fictional') on conflict (organization_id, slug) do update set name = excluded.name returning id into program_id;
  insert into public.cohorts (organization_id, program_id, name, status) values (org_id, program_id, 'Fictional Staging Cohort', 'active') returning id into cohort_id;
  insert into public.profiles (user_id, display_name, active_organization_id, active_program_id, active_cohort_id, status) values (target_user_id, 'Staging Role Reviewer', org_id, program_id, cohort_id, 'active') on conflict (user_id) do update set active_organization_id = org_id, active_program_id = program_id, active_cohort_id = cohort_id, status = 'active';
  insert into public.role_assignments (user_id, role, organization_id, program_id, cohort_id, granted_by) select target_user_id, role, org_id, program_id, cohort_id, auth.uid() from unnest(array['student', 'advisor', 'administrator']) role on conflict do nothing;
  return jsonb_build_object('ok', true, 'organizationId', org_id, 'programId', program_id, 'cohortId', cohort_id);
end;
$$;
grant execute on function public.configure_staging_tri_role_fixture(uuid) to authenticated;

revoke all on all tables in schema evaluation from anon, authenticated;
revoke all on all functions in schema evaluation from anon, authenticated;

commit;
