-- Navigate the Pathway v0.2. Production-shaped Supabase foundation.
-- Do not enable real-record mode until institutional privacy/evaluation review is documented.

create extension if not exists pgcrypto;
create type public.app_role as enum ('student','advisor','supervisor','moderator','admin');
create type public.packet_status as enum ('draft','shared','revoked','expired','complete');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  role public.app_role not null,
  cohort_id uuid,
  real_records_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles add constraint profiles_cohort_fk foreign key (cohort_id) references public.cohorts(id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role public.app_role not null,
  cohort_id uuid references public.cohorts(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id),
  code_hash text not null,
  active boolean not null default true,
  rotated_by uuid references public.profiles(id),
  rotated_at timestamptz not null default now()
);

create table public.advisor_relationships (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  advisor_id uuid not null references public.profiles(id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique(student_id, advisor_id)
);

create table public.supervisor_relationships (
  id uuid primary key default gen_random_uuid(),
  advisor_id uuid not null references public.profiles(id),
  supervisor_id uuid not null references public.profiles(id),
  unique(advisor_id, supervisor_id)
);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('course_plan','experience','reflection','learning_experiment','support_contact','story','goal','action_plan')),
  title text not null,
  body text not null default '',
  domain text,
  metadata jsonb not null default '{}'::jsonb,
  parent_artifact_id uuid references public.artifacts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.advising_packets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  advisor_id uuid not null references public.profiles(id),
  title text not null,
  meeting_goal text not null,
  questions jsonb not null default '[]'::jsonb,
  proposed_actions jsonb not null default '[]'::jsonb,
  status public.packet_status not null default 'draft',
  shared_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.packet_items (
  packet_id uuid not null references public.advising_packets(id) on delete cascade,
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(packet_id, artifact_id)
);

create table public.packet_comments (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.advising_packets(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('coaching_question','comment','next_action')),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.packet_events (
  id bigint generated always as identity primary key,
  packet_id uuid not null references public.advising_packets(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.advisor_reflections (
  id uuid primary key default gen_random_uuid(),
  advisor_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.supervisor_shares (
  reflection_id uuid not null references public.advisor_reflections(id) on delete cascade,
  supervisor_id uuid not null references public.profiles(id),
  shared_at timestamptz not null default now(),
  primary key(reflection_id, supervisor_id)
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id),
  author_id uuid not null references public.profiles(id),
  post_type text not null check (post_type in ('ask','study','offer','celebrate')),
  title text not null,
  body text not null,
  parent_id uuid references public.community_posts(id),
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id),
  reporter_id uuid not null references public.profiles(id),
  reason text not null,
  status text not null default 'open',
  moderator_id uuid references public.profiles(id),
  resolution text,
  created_at timestamptz not null default now()
);

create table public.institutional_content (
  id uuid primary key default gen_random_uuid(),
  institution text not null,
  content_key text not null,
  body jsonb not null,
  source_url text,
  effective_cycle text,
  reviewed_at date,
  published boolean not null default false,
  unique(institution, content_key, effective_cycle)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.artifacts enable row level security;
alter table public.advisor_relationships enable row level security;
alter table public.advising_packets enable row level security;
alter table public.packet_items enable row level security;
alter table public.packet_comments enable row level security;
alter table public.advisor_reflections enable row level security;
alter table public.supervisor_shares enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_reports enable row level security;

create policy "profiles see themselves" on public.profiles for select using (id = auth.uid());
create policy "students own artifacts" on public.artifacts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "participants see relationships" on public.advisor_relationships for select using (student_id = auth.uid() or advisor_id = auth.uid());
create policy "students manage packets" on public.advising_packets for all using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "advisors read active packets" on public.advising_packets for select using (advisor_id = auth.uid() and status = 'shared' and revoked_at is null and (expires_at is null or expires_at > now()));
create policy "packet owners see selected items" on public.packet_items for select using (exists (select 1 from public.advising_packets p where p.id = packet_id and (p.student_id = auth.uid() or (p.advisor_id = auth.uid() and p.status = 'shared' and p.revoked_at is null))));
create policy "students select their artifacts" on public.packet_items for all using (exists (select 1 from public.advising_packets p where p.id = packet_id and p.student_id = auth.uid())) with check (exists (select 1 from public.advising_packets p join public.artifacts a on a.id = artifact_id where p.id = packet_id and p.student_id = auth.uid() and a.owner_id = auth.uid()));
create policy "packet participants read comments" on public.packet_comments for select using (exists (select 1 from public.advising_packets p where p.id = packet_id and (p.student_id = auth.uid() or p.advisor_id = auth.uid())));
create policy "participants write own comments" on public.packet_comments for insert with check (author_id = auth.uid() and exists (select 1 from public.advising_packets p where p.id = packet_id and (p.student_id = auth.uid() or p.advisor_id = auth.uid())));
create policy "advisor owns practice reflection" on public.advisor_reflections for all using (advisor_id = auth.uid()) with check (advisor_id = auth.uid());
create policy "supervisor sees selected reflections" on public.advisor_reflections for select using (exists (select 1 from public.supervisor_shares s where s.reflection_id = id and s.supervisor_id = auth.uid()));
create policy "advisor controls supervisor shares" on public.supervisor_shares for all using (exists (select 1 from public.advisor_reflections r where r.id = reflection_id and r.advisor_id = auth.uid())) with check (exists (select 1 from public.advisor_reflections r where r.id = reflection_id and r.advisor_id = auth.uid()));
create policy "cohort reads visible posts" on public.community_posts for select using (hidden_at is null and exists (select 1 from public.profiles me where me.id = auth.uid() and me.cohort_id = cohort_id));
create policy "cohort creates own posts" on public.community_posts for insert with check (author_id = auth.uid() and exists (select 1 from public.profiles me where me.id = auth.uid() and me.cohort_id = cohort_id));
create policy "reporter creates reports" on public.community_reports for insert with check (reporter_id = auth.uid());

create index artifacts_owner_updated_idx on public.artifacts(owner_id, updated_at desc);
create index packets_advisor_updated_idx on public.advising_packets(advisor_id, updated_at desc);
create index packets_student_updated_idx on public.advising_packets(student_id, updated_at desc);
create index community_posts_cohort_created_idx on public.community_posts(cohort_id, created_at desc) where hidden_at is null;
