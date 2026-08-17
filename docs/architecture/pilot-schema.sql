-- Architecture reference only. This file is not executed by the prototype.
create table pilot_sessions (
  id uuid primary key,
  title text not null,
  topic text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check_in_opens_at timestamptz not null,
  check_in_closes_at timestamptz not null,
  format text not null check (format in ('virtual', 'in_person')),
  status text not null check (status in ('active', 'archived'))
);

create table attendance_records (
  id uuid primary key,
  session_id uuid not null references pilot_sessions(id),
  student_id uuid not null,
  status text not null check (status in ('not_recorded', 'present', 'absent', 'excused')),
  recorded_at timestamptz not null,
  source text not null,
  unique (session_id, student_id)
);

create table attendance_change_log (
  id uuid primary key,
  attendance_record_id uuid not null references attendance_records(id),
  changed_by uuid not null,
  previous_status text not null,
  new_status text not null,
  reason text not null,
  changed_at timestamptz not null
);

create table survey_instrument_versions (
  id uuid primary key,
  instrument_key text not null,
  version text not null,
  source_reference text not null,
  permission_status text not null,
  schema_json jsonb not null,
  unique (instrument_key, version)
);

create table survey_response_sets (
  id uuid primary key,
  student_id uuid not null,
  wave text not null check (wave in ('pre', 'post')),
  status text not null check (status in ('not_started', 'in_progress', 'complete')),
  instrument_version_ids uuid[] not null,
  submitted_at timestamptz
);

create table curriculum_programs (
  id uuid primary key,
  institution text not null,
  program_name text not null,
  catalog_year text not null,
  published_total_credits numeric not null,
  source_document text not null
);

create table curriculum_requirements (
  id uuid primary key,
  program_id uuid not null references curriculum_programs(id),
  term_order integer not null,
  raw_course_code text not null,
  normalized_course_code text not null,
  published_title text not null,
  credit_hours numeric,
  source_page integer not null
);

create table student_course_snapshots (
  id uuid primary key,
  student_id uuid not null,
  raw_course_code text,
  normalized_course_code text,
  title text not null,
  status text not null,
  optional_grade text,
  planning_question text,
  matched_requirement_id uuid references curriculum_requirements(id),
  match_status text not null,
  shared_with_advisor boolean not null default false
);

create table portfolio_documents (
  id uuid primary key,
  student_id uuid not null,
  object_key text not null,
  title text not null,
  document_type text not null,
  document_date date,
  description text,
  malware_scan_status text not null,
  created_at timestamptz not null
);

create table portfolio_destination_confirmations (
  document_id uuid not null references portfolio_documents(id),
  destination text not null,
  confirmed_by uuid not null,
  confirmed_at timestamptz not null,
  primary key (document_id, destination)
);

create table advising_shares (
  id uuid primary key,
  student_id uuid not null,
  advisor_id uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

-- Production row-level authorization must be designed and verified before use.
