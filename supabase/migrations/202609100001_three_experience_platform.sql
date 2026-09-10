begin;

-- Additive shared-platform foundation. Existing Pathway tables remain authoritative
-- for historical Pathway records and are not renamed, rewritten, or deleted.
create table if not exists public.experiences (
  key text primary key check (key in ('pathway', 'oaca', 'genesis')),
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.experiences (key, name, settings) values
  ('pathway', 'Navigate the Pathway', '{"featureFlag":"experience.pathway"}'),
  ('oaca', 'OACA Compass', '{"featureFlag":"experience.oaca","liveScheduling":false,"liveSchedulingReason":"configuration_pending"}'),
  ('genesis', 'GENESIS Impact Studio', '{"featureFlag":"experience.genesis","pilotCollege":"College of Medicine"}')
on conflict (key) do update set name = excluded.name, settings = public.experiences.settings || excluded.settings;

create table if not exists public.experience_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  experience_key text not null references public.experiences(key),
  role text not null check (role in ('student','advisor','faculty','staff','administrator','creator','principal_investigator','mentor','community_liaison')),
  organization_id uuid references public.organizations(id) on delete cascade,
  program_id uuid references public.programs(id) on delete cascade,
  cohort_id uuid references public.cohorts(id) on delete cascade,
  granted_by uuid references public.profiles(user_id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique nulls not distinct (user_id, experience_key, role, organization_id, program_id, cohort_id)
);

-- Preserve the existing Pathway assignment table and mirror active assignments.
insert into public.experience_role_assignments (user_id, experience_key, role, organization_id, program_id, cohort_id, granted_by, granted_at, revoked_at)
select user_id, 'pathway', role, organization_id, program_id, cohort_id, granted_by, granted_at, revoked_at
from public.role_assignments
on conflict (user_id, experience_key, role, organization_id, program_id, cohort_id) do nothing;

create table if not exists public.experience_capability_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  experience_key text not null references public.experiences(key),
  capability text not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  program_id uuid references public.programs(id) on delete cascade,
  granted_by uuid references public.profiles(user_id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique nulls not distinct (user_id, experience_key, capability, organization_id, program_id)
);

create table if not exists public.experience_feature_flags (
  experience_key text primary key references public.experiences(key),
  enabled boolean not null default false,
  sandbox_only boolean not null default true,
  updated_by uuid references public.profiles(user_id),
  updated_at timestamptz not null default now()
);
insert into public.experience_feature_flags (experience_key, enabled, sandbox_only) values
  ('pathway', true, false), ('oaca', true, true), ('genesis', true, true)
on conflict (experience_key) do nothing;

create table if not exists public.platform_notification_preferences (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  verified_phone text,
  phone_verified_at timestamptz,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  direct_message_enabled boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'America/Los_Angeles',
  sms_opted_out_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  experience_key text not null references public.experiences(key),
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png')),
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  scan_status text not null default 'pending' check (scan_status in ('pending','clean','rejected','error')),
  scan_completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_file_shares (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.platform_files(id) on delete cascade,
  shared_by uuid not null references public.profiles(user_id),
  recipient_id uuid not null references public.profiles(user_id),
  purpose text not null default 'review',
  shared_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (file_id, recipient_id)
);

create table if not exists public.platform_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id),
  experience_key text not null references public.experiences(key),
  channel text not null check (channel in ('email','sms','in_app')),
  template_key text not null,
  template_version integer not null,
  destination_hash text,
  status text not null check (status in ('queued','suppressed','sent','delivered','failed')),
  provider_message_id text,
  attempted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.oaca_service_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key in ('academic_advising','career_advising','peer_tutoring')),
  name text not null,
  provider_rule text not null check (provider_rule in ('assigned','choice','choice_or_first')),
  duration_minutes integer,
  buffer_before_minutes integer,
  buffer_after_minutes integer,
  minimum_lead_minutes integer,
  cancellation_window_minutes integer,
  capacity integer,
  waitlist_enabled boolean,
  recurrence_enabled boolean,
  no_show_policy jsonb not null default '{}'::jsonb,
  modalities text[] not null default array['in_person','phone','teams']::text[],
  policy_status text not null default 'configuration_pending' check (policy_status in ('configuration_pending','sandbox_approved','live_approved')),
  settings jsonb not null default '{}'::jsonb,
  unique (organization_id, key)
);

create table if not exists public.oaca_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  classification text not null check (classification in ('faculty','staff','peer_tutor')),
  modalities text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create table if not exists public.oaca_provider_services (
  provider_id uuid not null references public.oaca_providers(id) on delete cascade,
  service_line_id uuid not null references public.oaca_service_lines(id) on delete cascade,
  subjects text[] not null default '{}',
  formats text[] not null default '{}',
  primary key (provider_id, service_line_id)
);

create table if not exists public.oaca_advisor_assignments (
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  provider_id uuid not null references public.oaca_providers(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (student_id, provider_id, assigned_at)
);

create table if not exists public.oaca_availability_rules (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.oaca_providers(id) on delete cascade,
  service_line_id uuid references public.oaca_service_lines(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  timezone text not null default 'America/Los_Angeles',
  effective_from date not null,
  effective_through date,
  check (ends_at > starts_at)
);

create table if not exists public.oaca_appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  provider_id uuid references public.oaca_providers(id),
  service_line_id uuid not null references public.oaca_service_lines(id),
  subject text,
  format text not null default 'individual' check (format in ('individual','small_group','drop_in')),
  modality text not null check (modality in ('in_person','phone','teams')),
  starts_at timestamptz,
  ends_at timestamptz,
  prior_confirmed_starts_at timestamptz,
  prior_confirmed_ends_at timestamptz,
  preparation_note text not null default '',
  status text not null default 'draft' check (status in ('draft','pending_approval','counterproposed','confirmed','declined','cancelled','completed','no_show')),
  sandbox boolean not null default true,
  outlook_event_id text,
  outlook_change_key text,
  idempotency_key uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists oaca_provider_confirmed_time_unique on public.oaca_appointments(provider_id, starts_at)
where status = 'confirmed' and provider_id is not null;

create table if not exists public.oaca_encounter_records (
  appointment_id uuid primary key references public.oaca_appointments(id) on delete cascade,
  staff_working_notes text not null default '',
  structured_data jsonb not null default '{"categories":[],"interventions":[],"referrals":[],"followUp":[]}'::jsonb,
  student_recap text not null default '',
  recap_published_at timestamptz,
  recap_published_by uuid references public.profiles(user_id),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.oaca_record_revisions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.oaca_appointments(id) on delete cascade,
  version integer not null,
  layer text not null check (layer in ('working_notes','structured','student_recap','ocr_transcription')),
  content jsonb not null,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  unique (appointment_id, version, layer)
);

create table if not exists public.oaca_worksheet_uploads (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.oaca_appointments(id) on delete cascade,
  opaque_session_code uuid not null unique default gen_random_uuid(),
  original_file_id uuid references public.platform_files(id),
  ocr_draft text,
  verified_by uuid references public.profiles(user_id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.oaca_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  appointment_id uuid references public.oaca_appointments(id),
  kind text not null check (kind in ('appointment','service_inbox')),
  service_line_id uuid references public.oaca_service_lines(id),
  created_at timestamptz not null default now()
);
create table if not exists public.oaca_thread_participants (
  thread_id uuid not null references public.oaca_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  participant_role text not null,
  primary key (thread_id, user_id)
);
create table if not exists public.oaca_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.oaca_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(user_id),
  body text not null check (char_length(body) between 1 and 5000),
  reported_at timestamptz,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists public.ai_review_drafts (
  id uuid primary key default gen_random_uuid(),
  experience_key text not null references public.experiences(key),
  subject_type text not null,
  subject_id uuid not null,
  draft_type text not null,
  content jsonb not null,
  source_record_ids uuid[] not null default '{}',
  model text not null,
  prompt_version text not null,
  status text not null default 'draft' check (status in ('draft','approved','rejected')),
  reviewed_by uuid references public.profiles(user_id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.genesis_organizations (
  id uuid primary key default gen_random_uuid(),
  directory_key text not null unique,
  name text not null,
  college text not null,
  campus text not null,
  mission text not null,
  advisor text not null,
  aliases text[] not null default '{}',
  source_date date not null,
  pilot_available boolean not null default false,
  sort_priority integer not null default 100,
  archived_at timestamptz
);

create table if not exists public.genesis_organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.genesis_organizations(id),
  user_id uuid not null references public.profiles(user_id),
  role text not null check (role in ('student','mentor','community_liaison','administrator')),
  status text not null default 'pending' check (status in ('pending','approved','declined','ended')),
  approved_by uuid references public.profiles(user_id),
  approved_at timestamptz,
  unique (organization_id, user_id, role)
);

create table if not exists public.genesis_portfolios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(user_id),
  organization_id uuid not null references public.genesis_organizations(id),
  title text not null,
  current_version integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, organization_id)
);

create table if not exists public.genesis_portfolio_versions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.genesis_portfolios(id) on delete cascade,
  version integer not null,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','submitted','reviewed','superseded')),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(user_id),
  reviewed_at timestamptz,
  mentor_feedback text,
  created_at timestamptz not null default now(),
  unique (portfolio_id, version)
);

create table if not exists public.genesis_sources (
  id uuid primary key default gen_random_uuid(),
  portfolio_version_id uuid not null references public.genesis_portfolio_versions(id) on delete cascade,
  title text not null,
  url text,
  publication_date date,
  geography text not null,
  population text not null,
  limitations text not null,
  claim text not null,
  mentor_verified_at timestamptz,
  mentor_verified_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now()
);

create table if not exists public.genesis_initiatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.genesis_organizations(id),
  created_by uuid not null references public.profiles(user_id),
  title text not null,
  summary text not null default '',
  status text not null default 'draft' check (status in ('draft','active','completed','archived')),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.genesis_snapshots (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.genesis_initiatives(id) on delete cascade,
  portfolio_version_id uuid not null references public.genesis_portfolio_versions(id),
  published_by uuid not null references public.profiles(user_id),
  attribution jsonb not null,
  content jsonb not null,
  published_at timestamptz not null default now()
);

create or replace function public.prevent_genesis_snapshot_changes() returns trigger language plpgsql as $$
begin raise exception 'Published GENESIS snapshots are immutable'; end $$;
drop trigger if exists genesis_snapshots_immutable on public.genesis_snapshots;
create trigger genesis_snapshots_immutable before update or delete on public.genesis_snapshots
for each row execute function public.prevent_genesis_snapshot_changes();

create table if not exists public.genesis_handoffs (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.genesis_initiatives(id),
  snapshot_id uuid not null references public.genesis_snapshots(id),
  from_user_id uuid not null references public.profiles(user_id),
  next_steward_id uuid references public.profiles(user_id),
  next_steward_email text,
  open_decisions jsonb not null default '[]'::jsonb,
  contacts jsonb not null default '[]'::jsonb,
  calendar_commitments jsonb not null default '[]'::jsonb,
  file_ids uuid[] not null default '{}',
  recommended_actions jsonb not null default '[]'::jsonb,
  status text not null default 'offered' check (status in ('draft','offered','accepted','declined','superseded')),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.genesis_events (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.genesis_initiatives(id),
  created_by uuid not null references public.profiles(user_id),
  title text not null,
  objective text not null,
  audience text not null,
  community_partner text,
  venue text,
  modality text not null check (modality in ('in_person','virtual','hybrid')),
  starts_at timestamptz,
  ends_at timestamptz,
  accessibility text not null default '',
  staffing jsonb not null default '[]'::jsonb,
  capacity integer,
  budget jsonb not null default '{}'::jsonb,
  safety_considerations text not null default '',
  communications text not null default '',
  evaluation_measures jsonb not null default '[]'::jsonb,
  evidence_snapshot_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','submitted','changes_requested','mentor_approved','liaison_approved','published','completed','cancelled','archived')),
  outlook_event_id text,
  idempotency_key uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.genesis_event_approvals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.genesis_events(id) on delete cascade,
  approval_type text not null check (approval_type in ('mentor','community_liaison')),
  decision text not null check (decision in ('approved','changes_requested')),
  reviewer_id uuid not null references public.profiles(user_id),
  notes text not null default '',
  decided_at timestamptz not null default now(),
  unique (event_id, approval_type)
);

create or replace function public.current_experience_memberships()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'experienceKey', grouped.experience_key,
    'experienceName', e.name,
    'roles', grouped.roles,
    'capabilities', grouped.capabilities,
    'status', 'active',
    'featureEnabled', coalesce(f.enabled, false),
    'sandboxOnly', coalesce(f.sandbox_only, true)
  ) order by case grouped.experience_key when 'pathway' then 1 when 'oaca' then 2 else 3 end), '[]'::jsonb)
  from (
    select r.experience_key, jsonb_agg(distinct r.role) as roles,
      coalesce((select jsonb_agg(distinct c.capability) from public.experience_capability_assignments c
        where c.user_id = public.current_profile_user_id() and c.experience_key = r.experience_key and c.revoked_at is null), '[]'::jsonb) as capabilities
    from public.experience_role_assignments r
    where r.user_id = public.current_profile_user_id() and r.revoked_at is null
    group by r.experience_key
  ) grouped
  join public.experiences e on e.key = grouped.experience_key and e.status = 'active'
  left join public.experience_feature_flags f on f.experience_key = grouped.experience_key;
$$;

create or replace function public.require_experience_membership(requested_experience text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if requested_experience not in ('pathway','oaca','genesis') then raise exception 'Unknown experience' using errcode = '22023'; end if;
  if not exists (select 1 from public.experience_role_assignments where user_id = public.current_profile_user_id() and experience_key = requested_experience and revoked_at is null)
  then raise exception 'Experience membership required' using errcode = '42501'; end if;
end $$;

revoke all on function public.current_experience_memberships(), public.require_experience_membership(text) from public, anon;

-- RLS is the last line of defense. API checks remain mandatory.
alter table public.experiences enable row level security;
alter table public.experience_role_assignments enable row level security;
alter table public.experience_capability_assignments enable row level security;
alter table public.experience_feature_flags enable row level security;
alter table public.platform_notification_preferences enable row level security;
alter table public.platform_files enable row level security;
alter table public.platform_file_shares enable row level security;
alter table public.platform_delivery_attempts enable row level security;
alter table public.oaca_service_lines enable row level security;
alter table public.oaca_providers enable row level security;
alter table public.oaca_provider_services enable row level security;
alter table public.oaca_advisor_assignments enable row level security;
alter table public.oaca_availability_rules enable row level security;
alter table public.oaca_appointments enable row level security;
alter table public.oaca_encounter_records enable row level security;
alter table public.oaca_record_revisions enable row level security;
alter table public.oaca_worksheet_uploads enable row level security;
alter table public.oaca_threads enable row level security;
alter table public.oaca_thread_participants enable row level security;
alter table public.oaca_messages enable row level security;
alter table public.ai_review_drafts enable row level security;
alter table public.genesis_organizations enable row level security;
alter table public.genesis_organization_memberships enable row level security;
alter table public.genesis_portfolios enable row level security;
alter table public.genesis_portfolio_versions enable row level security;
alter table public.genesis_sources enable row level security;
alter table public.genesis_initiatives enable row level security;
alter table public.genesis_snapshots enable row level security;
alter table public.genesis_handoffs enable row level security;
alter table public.genesis_events enable row level security;
alter table public.genesis_event_approvals enable row level security;

create policy experiences_members_only on public.experiences for select to authenticated
using (exists (select 1 from public.experience_role_assignments r where r.user_id = public.current_profile_user_id() and r.experience_key = key and r.revoked_at is null));
create policy experience_roles_self on public.experience_role_assignments for select to authenticated using (user_id = public.current_profile_user_id());
create policy experience_capabilities_self on public.experience_capability_assignments for select to authenticated using (user_id = public.current_profile_user_id());
create policy feature_flags_members on public.experience_feature_flags for select to authenticated
using (exists (select 1 from public.experience_role_assignments r where r.user_id = public.current_profile_user_id() and r.experience_key = experience_feature_flags.experience_key and r.revoked_at is null));
create policy notification_preferences_self on public.platform_notification_preferences for all to authenticated using (user_id = public.current_profile_user_id()) with check (user_id = public.current_profile_user_id());
create policy files_owner_or_recipient on public.platform_files for select to authenticated using (
  owner_id = public.current_profile_user_id() or exists (select 1 from public.platform_file_shares s where s.file_id = id and s.recipient_id = public.current_profile_user_id() and s.revoked_at is null)
);
create policy files_owner_insert on public.platform_files for insert to authenticated with check (owner_id = public.current_profile_user_id());
create policy file_shares_owner_or_recipient on public.platform_file_shares for select to authenticated using (shared_by = public.current_profile_user_id() or recipient_id = public.current_profile_user_id());
create policy file_shares_owner_manage on public.platform_file_shares for all to authenticated using (shared_by = public.current_profile_user_id()) with check (shared_by = public.current_profile_user_id());

create policy oaca_catalog_members on public.oaca_service_lines for select to authenticated using (
  exists (select 1 from public.experience_role_assignments r where r.user_id = public.current_profile_user_id() and r.experience_key = 'oaca' and r.revoked_at is null)
);
create policy oaca_appointments_participants on public.oaca_appointments for select to authenticated using (
  student_id = public.current_profile_user_id() or exists (select 1 from public.oaca_providers p where p.id = provider_id and p.user_id = public.current_profile_user_id())
);
create policy oaca_appointments_students_create on public.oaca_appointments for insert to authenticated with check (student_id = public.current_profile_user_id() and sandbox = true);
create policy oaca_records_staff_only on public.oaca_encounter_records for select to authenticated using (
  exists (select 1 from public.oaca_appointments a join public.oaca_providers p on p.id = a.provider_id where a.id = appointment_id and p.user_id = public.current_profile_user_id())
);
create policy oaca_threads_participants on public.oaca_threads for select to authenticated using (
  exists (select 1 from public.oaca_thread_participants p where p.thread_id = id and p.user_id = public.current_profile_user_id())
);
create policy oaca_messages_participants on public.oaca_messages for select to authenticated using (
  exists (select 1 from public.oaca_thread_participants p where p.thread_id = oaca_messages.thread_id and p.user_id = public.current_profile_user_id())
);
create policy oaca_messages_participants_send on public.oaca_messages for insert to authenticated with check (
  sender_id = public.current_profile_user_id() and exists (select 1 from public.oaca_thread_participants p where p.thread_id = oaca_messages.thread_id and p.user_id = public.current_profile_user_id())
);

create policy genesis_catalog_members on public.genesis_organizations for select to authenticated using (
  exists (select 1 from public.experience_role_assignments r where r.user_id = public.current_profile_user_id() and r.experience_key = 'genesis' and r.revoked_at is null)
);
create policy genesis_memberships_self on public.genesis_organization_memberships for select to authenticated using (user_id = public.current_profile_user_id());
create policy genesis_portfolios_owner on public.genesis_portfolios for all to authenticated using (owner_id = public.current_profile_user_id()) with check (owner_id = public.current_profile_user_id());
create policy genesis_versions_owner on public.genesis_portfolio_versions for all to authenticated using (
  exists (select 1 from public.genesis_portfolios p where p.id = portfolio_id and p.owner_id = public.current_profile_user_id())
) with check (exists (select 1 from public.genesis_portfolios p where p.id = portfolio_id and p.owner_id = public.current_profile_user_id()));
create policy genesis_sources_owner on public.genesis_sources for all to authenticated using (
  exists (select 1 from public.genesis_portfolio_versions v join public.genesis_portfolios p on p.id = v.portfolio_id where v.id = portfolio_version_id and p.owner_id = public.current_profile_user_id())
) with check (exists (select 1 from public.genesis_portfolio_versions v join public.genesis_portfolios p on p.id = v.portfolio_id where v.id = portfolio_version_id and p.owner_id = public.current_profile_user_id()));
create policy genesis_initiatives_org_members on public.genesis_initiatives for select to authenticated using (
  exists (select 1 from public.genesis_organization_memberships m where m.organization_id = genesis_initiatives.organization_id and m.user_id = public.current_profile_user_id() and m.status = 'approved')
);
create policy genesis_snapshots_org_members on public.genesis_snapshots for select to authenticated using (
  exists (select 1 from public.genesis_initiatives i join public.genesis_organization_memberships m on m.organization_id = i.organization_id where i.id = initiative_id and m.user_id = public.current_profile_user_id() and m.status = 'approved')
);
create policy genesis_handoffs_parties on public.genesis_handoffs for select to authenticated using (from_user_id = public.current_profile_user_id() or next_steward_id = public.current_profile_user_id());
create policy genesis_events_org_members on public.genesis_events for select to authenticated using (
  exists (select 1 from public.genesis_initiatives i join public.genesis_organization_memberships m on m.organization_id = i.organization_id where i.id = initiative_id and m.user_id = public.current_profile_user_id() and m.status = 'approved')
);

grant select on public.experiences, public.experience_role_assignments, public.experience_capability_assignments, public.experience_feature_flags to authenticated;
grant select, insert, update on public.platform_notification_preferences, public.platform_files, public.platform_file_shares to authenticated;
grant select on public.oaca_service_lines, public.oaca_providers, public.oaca_provider_services, public.oaca_advisor_assignments, public.oaca_availability_rules to authenticated;
grant select, insert, update on public.oaca_appointments, public.oaca_threads, public.oaca_thread_participants, public.oaca_messages to authenticated;
grant select on public.oaca_encounter_records, public.oaca_record_revisions, public.oaca_worksheet_uploads to authenticated;
grant select on public.genesis_organizations, public.genesis_organization_memberships to authenticated;
grant select, insert, update on public.genesis_portfolios, public.genesis_portfolio_versions, public.genesis_sources, public.genesis_initiatives, public.genesis_handoffs, public.genesis_events to authenticated;
grant select, insert on public.genesis_snapshots to authenticated;
grant execute on function public.current_experience_memberships(), public.require_experience_membership(text) to authenticated;

commit;
