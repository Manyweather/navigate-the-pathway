begin;

alter table public.audit_events drop constraint if exists audit_events_actor_id_fkey;
alter table public.audit_events add constraint audit_events_actor_id_fkey foreign key (actor_id) references auth.users(id) on delete set null;

insert into public.permissions (key, description) values
  ('platform.creator', 'Sole platform creator principal'),
  ('platform.principal_investigator', 'Principal investigator governance principal'),
  ('pilot.reset_records', 'Preview, request, and execute a pilot record reset'),
  ('accounts.purge', 'Request and execute permanent account purges'),
  ('accounts.manage', 'Manage invitations, roles, deactivation, and restoration'),
  ('program.configure', 'Manage program, cohort, session, and wave configuration'),
  ('evaluation.governance', 'Manage evaluation configuration and approve releases'),
  ('evaluation.raw_export', 'Download protected response-level evaluation exports'),
  ('evaluation.individual_insights', 'View person-level evaluation change summaries'),
  ('evaluation.qualitative_analysis', 'Code and review protected open responses')
on conflict (key) do update set description = excluded.description;

create table if not exists public.principal_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  principal_type text not null check (principal_type in ('creator', 'principal_investigator')),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid references public.programs(id) on delete cascade,
  designated_by uuid not null references auth.users(id),
  designated_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  revoked_at timestamptz,
  unique nulls not distinct (user_id, principal_type, organization_id, program_id)
);

create unique index if not exists one_active_creator_per_organization
  on public.principal_assignments (organization_id)
  where principal_type = 'creator' and revoked_at is null;

create table if not exists public.analytics_configurations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  enabled_dimensions jsonb not null default '["wave","institution","cohort","class_year","attendance_band","completion_status"]'::jsonb,
  sensitive_dimensions jsonb not null default '[]'::jsonb,
  minimum_group_size integer not null default 2 check (minimum_group_size >= 2),
  small_sample_warning_below integer not null default 5 check (small_sample_warning_below >= minimum_group_size),
  enabled_depths jsonb not null default '["descriptive","comparative","statistical"]'::jsonb,
  default_depth text not null default 'descriptive' check (default_depth in ('descriptive','comparative','statistical')),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (organization_id, program_id)
);

create table if not exists public.governance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid references public.programs(id) on delete cascade,
  request_type text not null check (request_type in ('pilot_reset','account_purge','survey_publication','grant_checkpoints_activation')),
  subject_id text,
  manifest jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','executed','expired')),
  initiated_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approval_note text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (approved_by is null or approved_by <> initiated_by)
);

create table if not exists public.account_lifecycle (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid references public.programs(id) on delete cascade,
  status text not null default 'active' check (status in ('active','deactivated','purge_requested','purge_approved','retention_hold')),
  deactivated_by uuid references auth.users(id),
  deactivated_at timestamptz,
  purge_eligible_at timestamptz,
  restored_by uuid references auth.users(id),
  restored_at timestamptz,
  retention_note text,
  updated_at timestamptz not null default now()
);

create table if not exists public.grant_checkpoint_configurations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  status text not null default 'disabled' check (status in ('disabled','pending_approval','enabled')),
  consent_version_id uuid,
  fields jsonb not null default '[]'::jsonb,
  requested_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  enabled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, program_id)
);

create table if not exists public.grant_outcome_checkpoints (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  checkpoint_type text not null,
  status text not null,
  occurred_on date,
  source text not null check (source in ('student','administrator','derived')),
  details jsonb not null default '{}'::jsonb,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_analysis_attributes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  institution text,
  class_year text,
  first_generation boolean,
  socioeconomic_indicator text,
  gender text,
  race_ethnicity jsonb not null default '[]'::jsonb,
  approved_for_analysis boolean not null default false,
  consented_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.qualitative_codebooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  instrument_slug text not null,
  name text not null,
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (program_id, instrument_slug, version)
);

create table if not exists public.qualitative_codes (
  id uuid primary key default gen_random_uuid(),
  codebook_id uuid not null references public.qualitative_codebooks(id) on delete cascade,
  label text not null,
  description text not null default '',
  color text not null default '#7b163a',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (codebook_id, label)
);

create table if not exists public.qualitative_response_codings (
  id uuid primary key default gen_random_uuid(),
  response_set_id text not null,
  item_key text not null,
  code_id uuid not null references public.qualitative_codes(id) on delete cascade,
  excerpt text not null,
  coded_by uuid not null references auth.users(id),
  coded_at timestamptz not null default now(),
  unique (response_set_id, item_key, code_id, coded_by)
);

create table if not exists public.qualitative_theme_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  instrument_slug text not null,
  label text not null,
  keywords jsonb not null default '[]'::jsonb,
  response_count integer not null default 0,
  status text not null default 'suggested' check (status in ('suggested','accepted','renamed','merged','rejected')),
  reviewed_label text,
  generated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);

insert into evaluation.instrument_definitions (
  slug, name, audience, expected_item_count, expected_open_response_count, requires_pi_confirmation
) values (
  'macleod-clark-professional-identity-scale-advisor',
  'MacLeod Clark Professional Identity Scale',
  'advisor',
  9,
  0,
  true
)
on conflict (slug) do update set
  name = excluded.name,
  audience = excluded.audience,
  expected_item_count = excluded.expected_item_count,
  expected_open_response_count = excluded.expected_open_response_count,
  requires_pi_confirmation = excluded.requires_pi_confirmation;

alter table public.principal_assignments enable row level security;
alter table public.analytics_configurations enable row level security;
alter table public.governance_requests enable row level security;
alter table public.account_lifecycle enable row level security;
alter table public.grant_checkpoint_configurations enable row level security;
alter table public.grant_outcome_checkpoints enable row level security;
alter table public.profile_analysis_attributes enable row level security;
alter table public.qualitative_codebooks enable row level security;
alter table public.qualitative_codes enable row level security;
alter table public.qualitative_response_codings enable row level security;
alter table public.qualitative_theme_suggestions enable row level security;

create policy principal_assignments_self on public.principal_assignments for select to authenticated using (user_id = auth.uid());
create policy principal_assignments_governance on public.principal_assignments for all to authenticated
  using (public.staff_mfa_verified() and public.has_capability('evaluation.governance', organization_id, program_id))
  with check (public.staff_mfa_verified() and public.has_capability('evaluation.governance', organization_id, program_id));
create policy analytics_config_governance on public.analytics_configurations for all to authenticated
  using (public.staff_mfa_verified() and public.has_capability('evaluation.governance', organization_id, program_id))
  with check (public.staff_mfa_verified() and public.has_capability('evaluation.governance', organization_id, program_id));
create policy governance_requests_principals on public.governance_requests for all to authenticated
  using (public.staff_mfa_verified() and (public.has_capability('platform.creator', organization_id, program_id) or public.has_capability('platform.principal_investigator', organization_id, program_id)))
  with check (public.staff_mfa_verified() and (public.has_capability('platform.creator', organization_id, program_id) or public.has_capability('platform.principal_investigator', organization_id, program_id)));
create policy account_lifecycle_governance on public.account_lifecycle for all to authenticated
  using (public.staff_mfa_verified() and public.has_capability('accounts.manage', organization_id, program_id))
  with check (public.staff_mfa_verified() and public.has_capability('accounts.manage', organization_id, program_id));
create policy grant_checkpoint_governance on public.grant_checkpoint_configurations for all to authenticated
  using (public.staff_mfa_verified() and public.has_capability('evaluation.governance', organization_id, program_id))
  with check (public.staff_mfa_verified() and public.has_capability('evaluation.governance', organization_id, program_id));
create policy grant_checkpoint_student on public.grant_outcome_checkpoints for select to authenticated using (student_id = auth.uid());
create policy grant_checkpoint_evaluation on public.grant_outcome_checkpoints for all to authenticated
  using (public.staff_mfa_verified() and public.has_capability('evaluation.governance', organization_id, program_id))
  with check (public.staff_mfa_verified() and public.has_capability('evaluation.governance', organization_id, program_id));
create policy analysis_attributes_self on public.profile_analysis_attributes for select to authenticated using (user_id = auth.uid());
create policy analysis_attributes_governance on public.profile_analysis_attributes for all to authenticated
  using (public.staff_mfa_verified() and public.has_capability('evaluation.governance', organization_id, program_id))
  with check (public.staff_mfa_verified() and public.has_capability('evaluation.governance', organization_id, program_id));
create policy qualitative_codebooks_authorized on public.qualitative_codebooks for all to authenticated
  using (public.staff_mfa_verified() and public.has_capability('evaluation.qualitative_analysis', organization_id, program_id))
  with check (public.staff_mfa_verified() and public.has_capability('evaluation.qualitative_analysis', organization_id, program_id));
create policy qualitative_codes_authorized on public.qualitative_codes for all to authenticated
  using (public.staff_mfa_verified() and exists (select 1 from public.qualitative_codebooks b where b.id = codebook_id and public.has_capability('evaluation.qualitative_analysis', b.organization_id, b.program_id)))
  with check (public.staff_mfa_verified() and exists (select 1 from public.qualitative_codebooks b where b.id = codebook_id and public.has_capability('evaluation.qualitative_analysis', b.organization_id, b.program_id)));
create policy qualitative_codings_authorized on public.qualitative_response_codings for all to authenticated
  using (public.staff_mfa_verified() and exists (select 1 from public.qualitative_codes c join public.qualitative_codebooks b on b.id = c.codebook_id where c.id = code_id and public.has_capability('evaluation.qualitative_analysis', b.organization_id, b.program_id)))
  with check (public.staff_mfa_verified() and exists (select 1 from public.qualitative_codes c join public.qualitative_codebooks b on b.id = c.codebook_id where c.id = code_id and public.has_capability('evaluation.qualitative_analysis', b.organization_id, b.program_id)));
create policy qualitative_themes_authorized on public.qualitative_theme_suggestions for all to authenticated
  using (public.staff_mfa_verified() and public.has_capability('evaluation.qualitative_analysis', organization_id, program_id))
  with check (public.staff_mfa_verified() and public.has_capability('evaluation.qualitative_analysis', organization_id, program_id));

create or replace function public.reset_evaluation_pilot_records(target_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, evaluation
as $$
declare
  response_count integer := 0;
  consent_count integer := 0;
begin
  select count(*) into response_count
  from evaluation.response_sets r
  join evaluation.assignments a on a.id = r.assignment_id
  where a.organization_id = target_organization_id;

  delete from evaluation.response_sets r
  using evaluation.assignments a
  where a.id = r.assignment_id and a.organization_id = target_organization_id;

  select count(*) into consent_count
  from evaluation.consent_records c
  where c.organization_id = target_organization_id;

  delete from evaluation.consent_records where organization_id = target_organization_id;

  return jsonb_build_object('response_sets', response_count, 'consent_records', consent_count);
end;
$$;

revoke all on function public.reset_evaluation_pilot_records(uuid) from public, anon, authenticated;
grant execute on function public.reset_evaluation_pilot_records(uuid) to service_role;

commit;
