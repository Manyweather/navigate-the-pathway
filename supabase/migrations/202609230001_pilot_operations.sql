begin;

create table public.pilot_support_tickets (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), requester_id uuid not null references public.profiles(user_id),
 workspace text not null check(workspace in ('compass','pathway','impact','facilities')), kind text not null check(kind in ('support','feature')),
 subject text not null check(length(subject) between 1 and 160), description text not null check(length(description) between 1 and 6000),
 impact text not null check(impact in ('question','blocked','disruption')), page_context text not null default '/app' check(page_context ~ '^/app(/[a-z-]+)*$'),
 status text not null default 'new' check(status in ('new','reviewing','planned','in_progress','waiting','resolved','closed')),
 request_key uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(requester_id,request_key)
);
create index on public.pilot_support_tickets(organization_id,updated_at desc);
create table public.pilot_ticket_replies (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.pilot_support_tickets(id), author_id uuid not null references public.profiles(user_id),
 body text not null check(length(body) between 1 and 6000), internal boolean not null default false, created_at timestamptz not null default now()
);
create table public.pilot_development_jobs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), ticket_id uuid not null references public.pilot_support_tickets(id),
 created_by uuid not null references public.profiles(user_id), instruction text not null check(length(instruction) between 1 and 12000),
 status text not null default 'queued' check(status in ('queued','running','review','failed','cancelled','approved','released')),
 revision text, approved_revision text, result jsonb not null default '{}', lease_token uuid, lease_until timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index pilot_ticket_active_job on public.pilot_development_jobs(ticket_id) where status in ('queued','running');
create table public.pilot_automation_schedules (
 organization_id uuid not null references public.organizations(id), id text not null check(id in ('daily','weekly','monthly','annual')),
 cadence text not null check(cadence in ('daily','weekly','monthly','annual')), local_time text not null check(local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 timezone text not null default 'America/Los_Angeles' check(timezone='America/Los_Angeles'), enabled boolean not null default true, last_period text,
 primary key(organization_id,id)
);
create table public.pilot_automation_runs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), schedule_id text not null, period text not null,
 status text not null check(status in ('queued','running','completed','failed','missed')), findings jsonb not null default '[]', created_at timestamptz not null default now(),
 unique(organization_id,schedule_id,period)
);
create table public.pilot_worker_state (organization_id uuid primary key references public.organizations(id), last_seen timestamptz not null, version text not null);
create table public.pilot_health_samples (
 id bigint generated always as identity primary key, organization_id uuid references public.organizations(id), category text not null, duration_ms numeric,
 status text not null, created_at timestamptz not null default now(), check(length(category)<=100), check(length(status)<=100)
);
create index on public.pilot_health_samples(organization_id,created_at desc);
create table public.pilot_venues (
 id text primary key, campus text not null, source_id text not null, source_system text not null, name text not null, building text not null,
 capacity integer, source_capacity integer, detail jsonb not null, verified boolean not null default false, booking_authority text not null default 'external',
 unique(source_system,campus,source_id)
);
alter table public.oaca_events add column if not exists venue_id text references public.pilot_venues(id);
alter table public.oaca_appointments add column if not exists venue_id text references public.pilot_venues(id);
alter table public.oaca_appointments add column if not exists reported_minutes numeric check(reported_minutes>=0);

create function public.pilot_is_creator(org uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(auth.jwt()->>'aal','')='aal2' and public.has_capability('platform.creator',org) and exists(select 1 from public.profiles where user_id=public.current_profile_user_id() and status='active' and active_organization_id=org)
$$;

alter table public.pilot_support_tickets enable row level security;
alter table public.pilot_ticket_replies enable row level security;
alter table public.pilot_development_jobs enable row level security;
alter table public.pilot_automation_schedules enable row level security;
alter table public.pilot_automation_runs enable row level security;
alter table public.pilot_worker_state enable row level security;
alter table public.pilot_health_samples enable row level security;
alter table public.pilot_venues enable row level security;
-- No direct client table grants. All access is through bounded, audited RPCs.
revoke all on public.pilot_support_tickets,public.pilot_ticket_replies,public.pilot_development_jobs,public.pilot_automation_schedules,public.pilot_automation_runs,public.pilot_worker_state,public.pilot_health_samples,public.pilot_venues from anon,authenticated;
grant all on public.pilot_support_tickets,public.pilot_ticket_replies,public.pilot_development_jobs,public.pilot_automation_schedules,public.pilot_automation_runs,public.pilot_worker_state,public.pilot_health_samples,public.pilot_venues to service_role;
grant usage,select on sequence public.pilot_health_samples_id_seq to service_role;

create function public.pilot_operations(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.current_profile_user_id(); org uuid; creator boolean; t public.pilot_support_tickets; j public.pilot_development_jobs; answer jsonb; target uuid; offn integer:=least(10000,greatest(0,coalesce((payload->>'offset')::integer,0)));
begin
 select active_organization_id into org from public.profiles where user_id=u and status='active';
 if org is null then raise exception 'An active account is required'; end if;
 creator:=public.pilot_is_creator(org);
 if exists(select 1 from public.experience_role_assignments where user_id=u and revoked_at is null and role not in ('student','requester')) and coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'Verify your second factor'; end if;
 if action not in ('tickets','ticket_create','ticket_detail','ticket_reply','venues','telemetry') and not creator then raise exception 'Creator permission required'; end if;
 if action='tickets' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into answer from (select * from public.pilot_support_tickets where organization_id=org and (creator or requester_id=u) order by updated_at desc,id limit 50 offset offn) q;
 elsif action='ticket_create' then
  if not exists(select 1 from jsonb_array_elements(public.current_experience_memberships()) m where m->>'experienceKey'=case payload->>'workspace' when 'compass' then 'oaca' when 'impact' then 'genesis' else payload->>'workspace' end and m->>'status'='active') then raise exception 'Workspace is not assigned'; end if;
  insert into public.pilot_support_tickets(organization_id,requester_id,workspace,kind,subject,description,impact,page_context,request_key)
   values(org,u,payload->>'workspace',payload->>'kind',trim(payload->>'subject'),trim(payload->>'description'),payload->>'impact',coalesce(payload->>'pageContext','/app'),(payload->>'requestKey')::uuid)
   on conflict(requester_id,request_key) do update set request_key=excluded.request_key returning * into t;
  answer:=to_jsonb(t);target:=t.id;
 elsif action in ('ticket_detail','ticket_reply','ticket_status','job_create') then
  select * into t from public.pilot_support_tickets where id=(payload->>'ticketId')::uuid and organization_id=org and (creator or requester_id=u) for update;
  if not found then raise exception 'Ticket unavailable'; end if;target:=t.id;
  if action='ticket_reply' then
   if coalesce((payload->>'internal')::boolean,false) and not creator then raise exception 'Internal notes require Creator'; end if;
   insert into public.pilot_ticket_replies(ticket_id,author_id,body,internal) values(t.id,u,trim(payload->>'body'),coalesce((payload->>'internal')::boolean,false));
   update public.pilot_support_tickets set updated_at=now() where id=t.id;
  elsif action='ticket_status' then
   update public.pilot_support_tickets set status=payload->>'status',updated_at=now() where id=t.id;
  elsif action='job_create' then
   insert into public.pilot_development_jobs(organization_id,ticket_id,created_by,instruction) values(org,t.id,u,trim(payload->>'instruction')) returning * into j;
   update public.pilot_support_tickets set status='in_progress',updated_at=now() where id=t.id;
   answer:=to_jsonb(j);
  end if;
  if action<>'job_create' then answer:=jsonb_build_object('ticket',to_jsonb(t),'replies',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at),'[]') from public.pilot_ticket_replies r where ticket_id=t.id and (creator or not internal))); end if;
 elsif action='jobs' then
  select coalesce(jsonb_agg(to_jsonb(q)-'lease_token'),'[]') into answer from (select * from public.pilot_development_jobs where organization_id=org order by updated_at desc limit 30 offset offn) q;
 elsif action in ('job_cancel','job_approve','job_continue') then
  select * into j from public.pilot_development_jobs where id=(payload->>'jobId')::uuid and organization_id=org for update;
  if not found then raise exception 'Job unavailable'; end if;target:=j.id;
  if action='job_approve' then
   if j.status<>'review' or j.revision is null or j.revision<>payload->>'revision' or not coalesce((j.result->>'checksPassed')::boolean,false) then raise exception 'Passing checks and the current reviewed revision are required'; end if;
   update public.pilot_development_jobs set status='approved',approved_revision=revision,updated_at=now() where id=j.id returning * into j;
  elsif action='job_cancel' then
   if j.status='released' then raise exception 'A released change cannot be cancelled'; end if;
   update public.pilot_development_jobs set status='cancelled',lease_token=null,lease_until=null,approved_revision=null,updated_at=now() where id=j.id returning * into j;
  else
   if j.status not in ('review','failed','approved') then raise exception 'Wait for the current operation to finish'; end if;
   update public.pilot_development_jobs set status='queued',instruction=trim(payload->>'instruction'),approved_revision=null,revision=null,result='{}',updated_at=now() where id=j.id returning * into j;
  end if;answer:=to_jsonb(j)-'lease_token';
 elsif action='automations' then
  insert into public.pilot_automation_schedules(organization_id,id,cadence,local_time) values(org,'daily','daily','07:00'),(org,'weekly','weekly','08:00'),(org,'monthly','monthly','09:00'),(org,'annual','annual','09:00') on conflict do nothing;
  answer:=jsonb_build_object('schedules',(select jsonb_agg(to_jsonb(s)) from public.pilot_automation_schedules s where organization_id=org),'runs',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (select * from public.pilot_automation_runs where organization_id=org order by created_at desc limit 50) r));
 elsif action='automation_save' then
  update public.pilot_automation_schedules set enabled=(payload->>'enabled')::boolean,local_time=payload->>'localTime' where organization_id=org and id=payload->>'id';answer:='{"ok":true}';
 elsif action='health' then
  answer:=jsonb_build_object('worker',(select to_jsonb(w) from public.pilot_worker_state w where organization_id=org),'samples',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from (select category,status,count(*) samples,round(avg(duration_ms)) duration_ms,max(created_at) last_seen from public.pilot_health_samples where organization_id=org and created_at>now()-interval '24 hours' group by category,status) s),'email',(select coalesce(jsonb_object_agg(status,n),'{}') from (select d.status,count(*) n from public.platform_notification_deliveries d join public.platform_notifications n on n.id=d.notification_id join public.profiles p on p.user_id=n.user_id where p.active_organization_id=org group by d.status) d));
 elsif action='venues' then select coalesce(jsonb_agg(to_jsonb(v) order by campus,name),'[]') into answer from public.pilot_venues v;
 elsif action='telemetry' then
  if (select count(*) from public.pilot_health_samples where organization_id=org and created_at>now()-interval '1 minute' and category='frontend')<120 then
   insert into public.pilot_health_samples(organization_id,category,status,duration_ms) values(org,'frontend',case when payload->>'status'='error' then 'error' else 'loaded' end,least(600000,greatest(0,(payload->>'durationMs')::numeric)));
  end if;return '{"ok":true}';
 else raise exception 'Unknown operation'; end if;
 insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(org,auth.uid(),'pilot_'||action,'pilot_operations',target,'{}');
 return coalesce(answer,'{}');
end $$;
revoke all on function public.pilot_operations(text,jsonb),public.pilot_is_creator(uuid) from public,anon;
grant execute on function public.pilot_operations(text,jsonb),public.pilot_is_creator(uuid) to authenticated;

-- The worker only receives jobs explicitly approved for development. Lease fencing rejects stale or cancelled results.
create function public.pilot_worker_action(org uuid,action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.pilot_development_jobs; answer jsonb;
begin
 if action='claim' then
  insert into public.pilot_worker_state values(org,now(),left(coalesce(payload->>'version','unknown'),100)) on conflict(organization_id) do update set last_seen=now(),version=excluded.version;
  update public.pilot_development_jobs set status='failed',lease_token=null,lease_until=null,result=jsonb_build_object('summary','Worker lease expired. Review before retrying.'),updated_at=now() where organization_id=org and status='running' and lease_until<now();
  select * into j from public.pilot_development_jobs where organization_id=org and status='queued' order by created_at for update skip locked limit 1;
  if not found then return 'null';end if;
  update public.pilot_development_jobs set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',updated_at=now() where id=j.id returning * into j;return to_jsonb(j);
 elsif action in ('heartbeat','result') then
  select * into j from public.pilot_development_jobs where organization_id=org and id=(payload->>'jobId')::uuid and lease_token=(payload->>'leaseToken')::uuid and status='running' and lease_until>now() for update;
  if not found then raise exception 'Lease lost or job cancelled';end if;
  update public.pilot_worker_state set last_seen=now() where organization_id=org;
  if action='heartbeat' then update public.pilot_development_jobs set lease_until=now()+interval '3 minutes' where id=j.id;
  else
   if octet_length((payload->'result')::text)>500000 then raise exception 'Result too large';end if;
   update public.pilot_development_jobs set status=case when payload->>'status'='review' and payload->>'revision' ~ '^[a-f0-9]{40,64}$' then 'review' else 'failed' end,revision=payload->>'revision',approved_revision=null,result=payload->'result',lease_token=null,lease_until=null,updated_at=now() where id=j.id;
  end if;return '{"ok":true}';
 elsif action='schedules' then
  return jsonb_build_object('schedules',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.pilot_automation_schedules s where organization_id=org),'health',(select to_jsonb(w) from public.pilot_worker_state w where organization_id=org));
 elsif action='automation_result' then
  if not exists(select 1 from public.pilot_automation_schedules where organization_id=org and id=payload->>'scheduleId' and enabled) then raise exception 'Schedule disabled';end if;
  insert into public.pilot_automation_runs(organization_id,schedule_id,period,status,findings) values(org,payload->>'scheduleId',payload->>'period',payload->>'status',payload->'findings') on conflict do nothing;
  update public.pilot_automation_schedules set last_period=payload->>'period' where organization_id=org and id=payload->>'scheduleId';return '{"ok":true}';
 else raise exception 'Unknown worker action';end if;
end $$;
revoke all on function public.pilot_worker_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.pilot_worker_action(uuid,text,jsonb) to service_role;
commit;
