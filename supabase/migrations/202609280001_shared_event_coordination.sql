begin;

alter table public.oaca_events add column if not exists compass_event_id uuid not null default gen_random_uuid();
alter table public.genesis_events add column if not exists compass_event_id uuid not null default gen_random_uuid();
create unique index if not exists oaca_events_compass_identity_idx on public.oaca_events(compass_event_id);
create unique index if not exists genesis_events_compass_identity_idx on public.genesis_events(compass_event_id);

create table public.compass_event_plans (
  id uuid primary key default gen_random_uuid(),
  -- OACA organizations and Impact student organizations are distinct tables.
  organization_id uuid not null,
  owner_experience text not null check (owner_experience in ('oaca','genesis')),
  created_by uuid not null references public.profiles(user_id),
  title text not null check (length(trim(title)) between 3 and 240),
  kind text not null default 'community' check (length(kind) between 2 and 80),
  objective text not null default '',
  audience text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  campus text not null default 'Summerlin Campus' check (campus = 'Summerlin Campus'),
  status text not null default 'draft' check (status in ('draft','requested','mentor_approved','published','completed','cancelled')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  recurrence jsonb not null default '{}'::jsonb check (jsonb_typeof(recurrence) = 'object'),
  oaca_event_id uuid unique references public.oaca_events(id) on delete set null,
  genesis_event_id uuid unique references public.genesis_events(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index compass_event_plans_scope_idx on public.compass_event_plans(organization_id,owner_experience,starts_at desc);

create table public.compass_event_publications (
  event_id uuid not null references public.compass_event_plans(id) on delete cascade,
  target_experience text not null check (target_experience in ('oaca','genesis')),
  approved_by uuid not null references public.profiles(user_id),
  published_at timestamptz not null default now(),
  primary key(event_id,target_experience)
);

create table public.compass_event_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.compass_event_plans(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'planned' check (status in ('planned','confirmed','completed','cancelled')),
  created_at timestamptz not null default now(),
  unique(event_id,starts_at),
  check (ends_at is null or ends_at > starts_at)
);

create table public.compass_event_facilities_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.compass_event_plans(id) on delete cascade,
  occurrence_id uuid references public.compass_event_occurrences(id) on delete cascade,
  request_kind text not null check (request_kind in ('room','setup','inventory')),
  item_key text,
  quantity integer check (quantity is null or quantity > 0),
  description text not null default '',
  status text not null default 'pending' check (status in ('pending','confirmed','declined','cancelled')),
  requested_by uuid not null references public.profiles(user_id),
  decided_by uuid references public.profiles(user_id),
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(occurrence_id,request_kind,item_key)
);
create index compass_event_facilities_status_idx on public.compass_event_facilities_requests(status,created_at desc);

create table public.compass_event_reviews (
  event_id uuid not null references public.compass_event_plans(id) on delete cascade,
  review_kind text not null check (review_kind in ('mentor','liaison')),
  decision text not null check (decision in ('approved','changes_requested')),
  reviewer_id uuid not null references public.profiles(user_id),
  note text not null default '',
  reviewed_at timestamptz not null default now(),
  primary key(event_id,review_kind)
);

create table public.compass_event_evaluations (
  occurrence_id uuid primary key references public.compass_event_occurrences(id) on delete cascade,
  event_id uuid not null references public.compass_event_plans(id) on delete cascade,
  completed_by uuid not null references public.profiles(user_id),
  registrations integer not null check (registrations >= 0),
  attendance integer not null check (attendance >= 0),
  estimated_cost numeric(12,2) not null check (estimated_cost >= 0),
  actual_cost numeric(12,2) not null check (actual_cost >= 0),
  goals_met text not null,
  partner_feedback text not null,
  coordination text not null,
  keep_next_time text not null,
  change_next_time text not null,
  purchase_needs text not null default '',
  completed_at timestamptz not null default now(),
  check (attendance <= registrations or registrations = 0)
);

create table public.compass_event_handoffs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.compass_event_plans(id) on delete cascade,
  version integer not null check (version > 0),
  authored_by uuid not null references public.profiles(user_id),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  status text not null default 'draft' check (status in ('draft','complete','offered','accepted')),
  successor_email text,
  completed_at timestamptz,
  offered_at timestamptz,
  created_at timestamptz not null default now(),
  unique(event_id,version),
  check (successor_email is null or status in ('offered','accepted'))
);

-- Older records keep their own identity. Only an explicit, audited link may join
-- two source records; a similar title or date is never enough to merge them.
insert into public.compass_event_plans(id,organization_id,owner_experience,created_by,title,kind,objective,audience,starts_at,ends_at,status,details,oaca_event_id,published_at)
select e.compass_event_id,e.organization_id,'oaca',e.created_by,e.title,coalesce(nullif(e.category,''),'community'),e.description,'OACA audience',e.starts_at,e.ends_at,
  case when e.status='published' then 'published' when e.status='completed' then 'completed' when e.status='cancelled' then 'cancelled' else 'draft' end,
  jsonb_build_object('location',e.location,'modality',e.modality,'source','existing-oaca'),e.id,e.published_at
from public.oaca_events e
where not exists(select 1 from public.compass_event_plans p where p.oaca_event_id=e.id);

insert into public.compass_event_plans(id,organization_id,owner_experience,created_by,title,objective,audience,starts_at,ends_at,status,details,genesis_event_id,published_at)
select e.compass_event_id,e.organization_id,'genesis',e.created_by,e.title,e.objective,e.audience,e.starts_at,e.ends_at,
  case when e.status='published' then 'published' when e.status='completed' then 'completed' when e.status='cancelled' then 'cancelled' when e.status='mentor_approved' then 'mentor_approved' when e.status='submitted' then 'requested' else 'draft' end,
  jsonb_build_object('location',e.venue,'modality',e.modality,'source','existing-impact'),e.id,e.liaison_approved_at
from public.genesis_events e
where not exists(select 1 from public.compass_event_plans p where p.genesis_event_id=e.id);

insert into public.compass_event_occurrences(event_id,starts_at,ends_at)
select p.id,p.starts_at,p.ends_at from public.compass_event_plans p where p.starts_at is not null
on conflict(event_id,starts_at) do nothing;

create function public.compass_link_new_source_event() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare plan_id uuid;
begin
  if tg_table_name = 'oaca_events' then
    insert into public.compass_event_plans(id,organization_id,owner_experience,created_by,title,kind,objective,audience,starts_at,ends_at,status,details,oaca_event_id,published_at)
    values(new.compass_event_id,new.organization_id,'oaca',new.created_by,new.title,coalesce(nullif(new.category,''),'community'),new.description,'OACA audience',new.starts_at,new.ends_at,
      case when new.status='published' then 'published' else 'draft' end,
      jsonb_build_object('location',new.location,'modality',new.modality,'source','oaca'),new.id,new.published_at)
    on conflict(id) do update set oaca_event_id=new.id,updated_at=now()
    returning id into plan_id;
  else
    insert into public.compass_event_plans(id,organization_id,owner_experience,created_by,title,objective,audience,starts_at,ends_at,status,details,genesis_event_id,published_at)
    values(new.compass_event_id,new.organization_id,'genesis',new.created_by,new.title,new.objective,new.audience,new.starts_at,new.ends_at,
      case when new.status='published' then 'published' when new.status='submitted' then 'requested' else 'draft' end,
      jsonb_build_object('location',new.venue,'modality',new.modality,'source','impact'),new.id,new.liaison_approved_at)
    on conflict(id) do update set genesis_event_id=new.id,updated_at=now()
    returning id into plan_id;
  end if;
  if new.starts_at is not null then
    insert into public.compass_event_occurrences(event_id,starts_at,ends_at) values(plan_id,new.starts_at,new.ends_at)
    on conflict(event_id,starts_at) do nothing;
  end if;
  return new;
end $$;
create trigger compass_oaca_event_link after insert on public.oaca_events for each row execute function public.compass_link_new_source_event();
create trigger compass_genesis_event_link after insert on public.genesis_events for each row execute function public.compass_link_new_source_event();
revoke all on function public.compass_link_new_source_event() from public,anon,authenticated;

create function public.compass_sync_source_event() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_table_name='oaca_events' then
    update public.compass_event_plans set title=new.title,starts_at=new.starts_at,ends_at=new.ends_at,
      status=case when new.status='published' then 'published' when new.status='completed' then 'completed' when new.status='cancelled' then 'cancelled' else status end,
      published_at=coalesce(new.published_at,published_at),updated_at=now()
      where id=new.compass_event_id and oaca_event_id=new.id;
  else
    update public.compass_event_plans set title=new.title,starts_at=new.starts_at,ends_at=new.ends_at,
      status=case when new.status='published' then 'published' when new.status='completed' then 'completed' when new.status='cancelled' then 'cancelled' when new.status='mentor_approved' then 'mentor_approved' when new.status='submitted' then 'requested' else status end,
      published_at=coalesce(new.liaison_approved_at,published_at),updated_at=now()
      where id=new.compass_event_id and genesis_event_id=new.id;
  end if;
  return new;
end $$;
create trigger compass_oaca_event_sync after update of title,starts_at,ends_at,status on public.oaca_events for each row execute function public.compass_sync_source_event();
create trigger compass_genesis_event_sync after update of title,starts_at,ends_at,status on public.genesis_events for each row execute function public.compass_sync_source_event();
revoke all on function public.compass_sync_source_event() from public,anon,authenticated;

alter table public.compass_event_plans enable row level security;
alter table public.compass_event_publications enable row level security;
alter table public.compass_event_occurrences enable row level security;
alter table public.compass_event_facilities_requests enable row level security;
alter table public.compass_event_reviews enable row level security;
alter table public.compass_event_evaluations enable row level security;
alter table public.compass_event_handoffs enable row level security;
revoke all on public.compass_event_plans,public.compass_event_publications,public.compass_event_occurrences,public.compass_event_facilities_requests,public.compass_event_reviews,public.compass_event_evaluations,public.compass_event_handoffs from anon,authenticated;

-- Existing approved Impact administrators and liaisons also need the
-- Facilities Requester view. The roster trigger reconciles their live grants.
update public.pilot_staff_roster_entries r
set workspace_roles=jsonb_set(coalesce(r.workspace_roles,'{}'::jsonb),'{facilities}',
  (select jsonb_agg(role_value) from (
    select distinct role_value from jsonb_array_elements_text(coalesce(r.workspace_roles->'facilities','[]'::jsonb)) as role_value
    union select 'requester'
  ) roles),true)
where r.status='approved' and coalesce(r.workspace_roles->'genesis','[]'::jsonb) ?| array['administrator','community_liaison']
  and not coalesce(r.workspace_roles->'facilities','[]'::jsonb) ? 'requester';

commit;
