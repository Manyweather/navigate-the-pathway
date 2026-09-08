begin;
alter table public.sessions add column if not exists timezone text not null default 'UTC';

create table public.pathway_page_views (
  id uuid primary key, user_id uuid not null references auth.users(id), organization_id uuid not null references public.organizations(id),
  program_id uuid not null references public.programs(id), cohort_id uuid references public.cohorts(id),
  page text not null check (page ~ '^[a-z][a-z_]{0,49}$'), session_id text not null,
  viewed_at timestamptz not null default now(), ip_address inet
);
create index on public.pathway_page_views(program_id, viewed_at desc);
create index on public.pathway_page_views(user_id, viewed_at desc);

create table public.pathway_communication_policy (
  program_id uuid primary key references public.programs(id), student_advisor boolean not null default true,
  administrator_advisor boolean not null default true, updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table public.pathway_appointments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), program_id uuid not null references public.programs(id),
  requester_id uuid not null references auth.users(id), recipient_id uuid not null references auth.users(id), title text not null check(length(title) between 1 and 160),
  starts_at timestamptz not null, ends_at timestamptz not null, timezone text not null,
  status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
  proposal jsonb, version integer not null default 1, request_key uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(requester_id <> recipient_id), check(ends_at > starts_at), unique(requester_id, request_key)
);
create index on public.pathway_appointments(program_id, starts_at);
create table public.pathway_conversations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), program_id uuid not null references public.programs(id),
  kind text not null check(kind in ('appointment','dm')), appointment_id uuid unique references public.pathway_appointments(id),
  participant_a uuid not null references auth.users(id), participant_b uuid not null references auth.users(id),
  created_at timestamptz not null default now(), check(participant_a < participant_b), check((kind='appointment')=(appointment_id is not null))
);
create unique index pathway_dm_pair on public.pathway_conversations(program_id,participant_a,participant_b) where kind='dm';
create table public.pathway_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.pathway_conversations(id),
  author_id uuid not null references auth.users(id), body text not null check(length(body) between 1 and 4000),
  client_id uuid not null, created_at timestamptz not null default now(), unique(author_id,client_id)
);
create index on public.pathway_messages(conversation_id,created_at,id);
create table public.pathway_message_reads (
  conversation_id uuid not null references public.pathway_conversations(id), user_id uuid not null references auth.users(id), read_at timestamptz not null default now(), primary key(conversation_id,user_id)
);
create table public.pathway_message_reports (
  id uuid primary key default gen_random_uuid(), message_id uuid not null references public.pathway_messages(id), reporter_id uuid not null references auth.users(id),
  reason text not null check(length(reason) between 1 and 1000), created_at timestamptz not null default now(), unique(message_id,reporter_id)
);
create table public.pathway_notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), program_id uuid not null references public.programs(id),
  event_key text not null, title text not null, appointment_id uuid references public.pathway_appointments(id),
  read_at timestamptz, created_at timestamptz not null default now(), unique(user_id,event_key)
);
create table public.pathway_email_jobs (
  id uuid primary key default gen_random_uuid(), notification_id uuid not null unique references public.pathway_notifications(id),
  template text not null, status text not null default 'suppressed' check(status in ('suppressed','pending','delivered','failed')),
  created_at timestamptz not null default now(), attempts integer not null default 0
);
create table public.pathway_support_sources (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references auth.users(id), organization_id uuid not null references public.organizations(id),
  program_id uuid not null references public.programs(id), goals text not null default '', barriers text not null default '', deadlines text not null default '',
  packet_id uuid references public.advising_packets(id), expires_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(),
  check(length(goals)+length(barriers)+length(deadlines) between 1 and 12000)
);
create table public.pathway_support_reviews (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references public.pathway_support_sources(id), student_id uuid not null references auth.users(id),
  organization_id uuid not null references public.organizations(id), program_id uuid not null references public.programs(id), reviewer_id uuid not null references auth.users(id),
  area text not null check(length(area) between 1 and 160), evidence text not null check(length(evidence) between 1 and 4000), action text not null check(length(action) between 1 and 4000),
  status text not null default 'draft' check(status in ('draft','reviewed','in_progress','completed')), shared_with_student boolean not null default false,
  follow_up_on date, origin text not null default 'staff' check(origin in ('staff','ai_draft')), updated_at timestamptz not null default now()
);
create table public.pathway_roster_imports (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id), organization_id uuid not null references public.organizations(id), program_id uuid not null references public.programs(id),
  request_key uuid not null, rows jsonb not null, status text not null default 'preview' check(status in ('preview','committed','partial')), created_at timestamptz not null default now(), unique(actor_id,request_key)
);
create table public.pathway_roster_rows (
  import_id uuid not null references public.pathway_roster_imports(id), row_number integer not null, values jsonb not null,
  status text not null default 'pending' check(status in ('pending','created','updated','failed','invalid')), user_id uuid references auth.users(id), error text, primary key(import_id,row_number)
);
create table public.pathway_calendar_connections (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), provider text not null check(provider in ('google','microsoft')),
  credential_ciphertext text not null, availability_calendar_ids text[] not null default '{}', destination_calendar_id text,
  status text not null default 'connected' check(status in ('connected','reconnect_required','disconnected')), provider_account_id text not null,
  sync_cursor text, subscription_id text, subscription_resource_id text, subscription_secret text, subscription_expires_at timestamptz, last_synced_at timestamptz,
  created_at timestamptz not null default now(), unique(user_id,provider,provider_account_id)
);
create table public.pathway_calendar_oauth_states (
  state_hash text primary key, user_id uuid not null references auth.users(id), provider text not null,
  verifier_ciphertext text not null, redirect_origin text not null, expires_at timestamptz not null, used_at timestamptz
);
create table public.pathway_calendar_events (
  id uuid primary key default gen_random_uuid(), connection_id uuid not null references public.pathway_calendar_connections(id),
  event_key text not null, provider_event_id text not null, calendar_id text not null, portal_version text not null, last_synced_at timestamptz not null default now(), unique(connection_id,event_key)
);
create table public.pathway_background_jobs (
  id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('calendar_sync','appointment_reminder','support_generation')),
  dedupe_key text not null unique, payload jsonb not null default '{}', status text not null default 'pending' check(status in ('pending','running','completed','failed','disabled')),
  attempts integer not null default 0, run_after timestamptz not null default now(), locked_until timestamptz, last_error text, created_at timestamptz not null default now()
);

-- Tables cannot be reached through PostgREST by users. All access goes through
-- the narrowly granted JWT-backed action function; service jobs use separate RPCs.
do $$ declare t text; begin
  foreach t in array array['pathway_page_views','pathway_communication_policy','pathway_appointments','pathway_conversations','pathway_messages','pathway_message_reads','pathway_message_reports','pathway_notifications','pathway_email_jobs','pathway_support_sources','pathway_support_reviews','pathway_roster_imports','pathway_roster_rows','pathway_calendar_connections','pathway_calendar_oauth_states','pathway_calendar_events','pathway_background_jobs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

create function public.pathway_role(u uuid,r text,o uuid,p uuid,c uuid default null) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.role_assignments a join public.profiles f on f.user_id=a.user_id
    where a.user_id=u and a.role=r and a.organization_id=o and (a.program_id is null or a.program_id=p)
    and (c is null or a.cohort_id is null or a.cohort_id=c) and a.revoked_at is null and f.status in ('active','invited'));
$$;
create function public.pathway_principal(o uuid,p uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.staff_mfa_verified() and public.has_role('administrator',o,p) and
    (public.has_capability('platform.creator',o,p) or public.has_capability('platform.principal_investigator',o,p));
$$;
create function public.pathway_pair(a uuid,b uuid,o uuid,p uuid,for_dm boolean default false) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare sa boolean; sb boolean; pol public.pathway_communication_policy;
begin
  if a=b then return false; end if;
  sa:=public.pathway_role(a,'student',o,p); sb:=public.pathway_role(b,'student',o,p);
  -- A student role on both identities always wins over additional staff roles.
  if sa and sb then return false; end if;
  select * into pol from public.pathway_communication_policy where program_id=p;
  if sa or sb then
    return (not for_dm or coalesce(pol.student_advisor,true)) and exists(
      select 1 from public.advisor_assignments x where x.organization_id=o and x.program_id=p
      and x.student_id=case when sa then a else b end and x.advisor_id=case when sa then b else a end
      and public.pathway_role(x.advisor_id,'advisor',o,p,x.cohort_id)
      and public.pathway_role(x.student_id,'student',o,p,x.cohort_id)
      and x.starts_at<=now() and (x.ends_at is null or x.ends_at>now()));
  end if;
  return (not for_dm or coalesce(pol.administrator_advisor,true)) and exists(
    select 1 from public.role_assignments ra join public.role_assignments rb on ra.organization_id=rb.organization_id
    where ra.user_id=a and rb.user_id=b and ra.organization_id=o and (ra.program_id is null or ra.program_id=p)
      and (rb.program_id is null or rb.program_id=p) and ra.revoked_at is null and rb.revoked_at is null
      and (ra.cohort_id is null or rb.cohort_id is null or ra.cohort_id=rb.cohort_id)
      and ((ra.role='administrator' and rb.role='advisor') or (ra.role='advisor' and rb.role='administrator'))
      and public.pathway_role(a,ra.role,o,p) and public.pathway_role(b,rb.role,o,p));
end $$;
create function public.pathway_notify(u uuid,p uuid,k text,t text,a uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare n uuid; begin
  insert into public.pathway_notifications(user_id,program_id,event_key,title,appointment_id) values(u,p,k,t,a)
    on conflict(user_id,event_key) do nothing returning id into n;
  if n is not null then insert into public.pathway_email_jobs(notification_id,template,status) values(n,'appointment_update','suppressed'); end if;
end $$;
create function public.pathway_source_visible(s public.pathway_support_sources,u uuid,staff boolean) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select s.revoked_at is null and (s.expires_at is null or s.expires_at>now())
 and (s.packet_id is null or exists(select 1 from public.advising_packets p where p.id=s.packet_id and p.student_id=s.student_id and p.status='active' and p.revoked_at is null and (p.expires_at is null or p.expires_at>now())))
 and (s.student_id=u or (staff and (public.pathway_principal(s.organization_id,s.program_id) or
   (public.pathway_role(u,'advisor',s.organization_id,s.program_id) and public.is_assigned_advisor(s.student_id,s.program_id)))));
$$;

create function public.pathway_action(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  u uuid:=public.current_profile_user_id(); f public.profiles; o uuid; p uuid; staff boolean:=public.staff_mfa_verified(); principal boolean;
  target uuid; ap public.pathway_appointments; conv public.pathway_conversations; src public.pathway_support_sources;
  out jsonb; item record; start_time timestamptz; end_time timestamptz; zone text; obj uuid; key uuid; before_time timestamptz;
begin
  select * into f from public.profiles where user_id=u and status in ('active','invited');
  if f.user_id is null or auth.uid() is null then raise exception 'Active account required' using errcode='42501'; end if;
  o:=f.active_organization_id; p:=f.active_program_id;
  if o is null or p is null or not exists(select 1 from public.programs where id=p and organization_id=o) then raise exception 'Choose an active program' using errcode='42501'; end if;
  if not exists(select 1 from public.role_assignments where user_id=u and organization_id=o and (program_id is null or program_id=p) and revoked_at is null) then raise exception 'Program access denied' using errcode='42501'; end if;
  principal:=public.pathway_principal(o,p);
  if exists(select 1 from public.role_assignments where user_id=u and organization_id=o and (program_id is null or program_id=p) and role in ('advisor','administrator') and revoked_at is null)
    and not public.pathway_role(u,'student',o,p) and not staff then raise exception 'Staff MFA required' using errcode='42501'; end if;

  if action='directory' then
    select coalesce(jsonb_agg(jsonb_build_object('id',z.user_id,'name',z.display_name,'roles',(select jsonb_agg(distinct r.role) from public.role_assignments r where r.user_id=z.user_id and r.organization_id=o and (r.program_id is null or r.program_id=p) and r.revoked_at is null)) order by z.display_name),'[]') into out
      from public.profiles z where public.pathway_pair(u,z.user_id,o,p,coalesce((payload->>'dm')::boolean,false)); return out;
  elsif action='notifications' then
    return coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select * from public.pathway_notifications where user_id=u and program_id=p order by created_at desc limit 100) n),'[]');
  elsif action='notification_read' then
    update public.pathway_notifications set read_at=now() where id=(payload->>'id')::uuid and user_id=u and program_id=p; return '{"ok":true}';
  elsif action='appointments' then
    return coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('other_name',(select display_name from public.profiles where user_id=case when a.requester_id=u then a.recipient_id else a.requester_id end),'conversation_id',(select id from public.pathway_conversations where appointment_id=a.id)) order by a.starts_at desc)
      from (select * from public.pathway_appointments where program_id=p and u in (requester_id,recipient_id) and public.pathway_pair(requester_id,recipient_id,o,p) order by starts_at desc limit 200) a),'[]');
  elsif action='appointment_request' then
    target:=(payload->>'recipientId')::uuid; key:=(payload->>'requestKey')::uuid;
    if not public.pathway_pair(u,target,o,p) then raise exception 'Appointment recipient is not permitted' using errcode='42501'; end if;
    if not public.pathway_role(u,'student',o,p) and not staff then raise exception 'Staff MFA required' using errcode='42501'; end if;
    start_time:=(payload->>'startsAt')::timestamptz; end_time:=(payload->>'endsAt')::timestamptz; zone:=payload->>'timezone';
    if start_time<=now() or end_time<=start_time or end_time-start_time>interval '8 hours' or not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Choose a valid future appointment and time zone'; end if;
    insert into public.pathway_appointments(organization_id,program_id,requester_id,recipient_id,title,starts_at,ends_at,timezone,request_key)
      values(o,p,u,target,trim(payload->>'title'),start_time,end_time,zone,key) on conflict(requester_id,request_key) do nothing returning * into ap;
    if ap.id is null then select * into ap from public.pathway_appointments where requester_id=u and request_key=key; end if;
    perform public.pathway_notify(target,p,ap.id||':request','New appointment request',ap.id); return to_jsonb(ap);
  elsif action='appointment_change' then
    -- Lock both participants in stable order, then the appointment. This serializes
    -- concurrent accepts even when the other appointment is still pending.
    select * into ap from public.pathway_appointments where id=(payload->>'id')::uuid and program_id=p;
    if ap.id is null or u not in (ap.requester_id,ap.recipient_id) or not public.pathway_pair(ap.requester_id,ap.recipient_id,o,p) then raise exception 'Appointment access denied' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended(least(ap.requester_id,ap.recipient_id)::text,0));
    perform pg_advisory_xact_lock(hashtextextended(greatest(ap.requester_id,ap.recipient_id)::text,0));
    select * into ap from public.pathway_appointments where id=ap.id for update;
    if ap.version<>(payload->>'version')::integer then raise exception 'Appointment changed. Refresh before continuing' using errcode='40001'; end if;
    if payload->>'decision'='reschedule' then
      if ap.status<>'accepted' then raise exception 'Only accepted appointments can be rescheduled'; end if;
      start_time:=(payload->>'startsAt')::timestamptz; end_time:=(payload->>'endsAt')::timestamptz; zone:=payload->>'timezone';
      if start_time<=now() or end_time<=start_time or end_time-start_time>interval '8 hours' or not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Choose a valid future appointment and time zone'; end if;
      update public.pathway_appointments set proposal=jsonb_build_object('starts_at',start_time,'ends_at',end_time,'timezone',zone,'requested_by',u),version=version+1,updated_at=now() where id=ap.id;
    elsif payload->>'decision'='accept' then
      if (ap.proposal is null and (ap.status<>'pending' or ap.recipient_id<>u)) or (ap.proposal is not null and (ap.status<>'accepted' or (ap.proposal->>'requested_by')::uuid=u)) then raise exception 'Recipient acceptance required' using errcode='42501'; end if;
      start_time:=coalesce((ap.proposal->>'starts_at')::timestamptz,ap.starts_at); end_time:=coalesce((ap.proposal->>'ends_at')::timestamptz,ap.ends_at);
      if start_time<=now() then raise exception 'This appointment time has passed'; end if;
      if exists(select 1 from public.pathway_appointments a where a.id<>ap.id and a.status='accepted' and (a.requester_id in (ap.requester_id,ap.recipient_id) or a.recipient_id in (ap.requester_id,ap.recipient_id)) and a.starts_at<end_time and a.ends_at>start_time) then raise exception 'A participant already has an appointment at this time' using errcode='23P01'; end if;
      if exists(select 1 from public.sessions s where s.program_id=p and s.status='scheduled' and s.starts_at<end_time and s.ends_at>start_time and (s.cohort_id is null or exists(select 1 from public.enrollments e where e.student_id in (ap.requester_id,ap.recipient_id) and e.program_id=p and e.cohort_id=s.cohort_id and e.status='active'))) then raise exception 'A program session conflicts with this appointment' using errcode='23P01'; end if;
      update public.pathway_appointments set starts_at=start_time,ends_at=end_time,timezone=coalesce(proposal->>'timezone',timezone),proposal=null,status='accepted',version=version+1,updated_at=now() where id=ap.id;
      insert into public.pathway_conversations(organization_id,program_id,kind,appointment_id,participant_a,participant_b) values(o,p,'appointment',ap.id,least(ap.requester_id,ap.recipient_id),greatest(ap.requester_id,ap.recipient_id)) on conflict(appointment_id) do nothing;
    elsif payload->>'decision'='decline' then
      if (ap.proposal is null and (ap.status<>'pending' or ap.recipient_id<>u)) or (ap.proposal is not null and (ap.proposal->>'requested_by')::uuid=u) then raise exception 'Only the recipient can decline' using errcode='42501'; end if;
      update public.pathway_appointments set status=case when proposal is null then 'declined' else status end,proposal=null,version=version+1,updated_at=now() where id=ap.id;
    elsif payload->>'decision'='cancel' then
      if ap.status not in ('pending','accepted') then raise exception 'Appointment already closed'; end if;
      update public.pathway_appointments set status='cancelled',proposal=null,version=version+1,updated_at=now() where id=ap.id;
    else raise exception 'Invalid appointment action'; end if;
    select * into ap from public.pathway_appointments where id=ap.id;
    target:=case when u=ap.requester_id then ap.recipient_id else ap.requester_id end;
    perform public.pathway_notify(target,p,ap.id||':'||ap.version,'Appointment '||(payload->>'decision'),ap.id);
    insert into public.pathway_background_jobs(kind,dedupe_key,payload) values('calendar_sync','appointment:'||ap.id||':'||ap.version,jsonb_build_object('appointmentId',ap.id)) on conflict do nothing;
    insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id) values(o,u,'appointment_'||(payload->>'decision'),'appointment',ap.id::text);
    return to_jsonb(ap);
  elsif action='conversations' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'title',case when c.kind='appointment' then (select title from public.pathway_appointments where id=c.appointment_id) else (select display_name from public.profiles where user_id=case when c.participant_a=u then c.participant_b else c.participant_a end) end,
      'readonly',c.kind='appointment' and (select status from public.pathway_appointments where id=c.appointment_id)<>'accepted',
      'unread',(select count(*) from public.pathway_messages m where m.conversation_id=c.id and m.author_id<>u and m.created_at>coalesce((select read_at from public.pathway_message_reads where conversation_id=c.id and user_id=u),'-infinity'::timestamptz))))
      from public.pathway_conversations c where c.program_id=p and u in (participant_a,participant_b) and public.pathway_pair(participant_a,participant_b,o,p,c.kind='dm')),'[]');
  elsif action='dm_create' then
    target:=(payload->>'recipientId')::uuid;
    if not public.pathway_pair(u,target,o,p,true) then raise exception 'Direct messaging is not permitted for this pair' using errcode='42501'; end if;
    insert into public.pathway_conversations(organization_id,program_id,kind,participant_a,participant_b) values(o,p,'dm',least(u,target),greatest(u,target)) on conflict do nothing;
    return (select to_jsonb(c) from public.pathway_conversations c where program_id=p and kind='dm' and participant_a=least(u,target) and participant_b=greatest(u,target));
  elsif action in ('messages','message_send','message_read','message_report') then
    select * into conv from public.pathway_conversations where id=(payload->>'conversationId')::uuid and program_id=p;
    if conv.id is null or u not in (conv.participant_a,conv.participant_b) or not public.pathway_pair(conv.participant_a,conv.participant_b,o,p,conv.kind='dm') then raise exception 'Conversation access denied' using errcode='42501'; end if;
    if action='messages' then
      return coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from (select m.id,author_profile.user_id as author_id,m.author_id as original_author_id,author_profile.display_name as author_name,m.body,m.created_at from public.pathway_messages m join public.profiles author_profile on author_profile.user_id=coalesce((select canonical_user_id from public.account_auth_identities where auth_user_id=m.author_id),m.author_id) where m.conversation_id=conv.id and (payload->>'before' is null or (m.created_at,m.id)<((payload->>'before')::timestamptz,(payload->>'beforeId')::uuid)) order by m.created_at desc,m.id desc limit 50) m),'[]');
    elsif action='message_send' then
      if conv.kind='appointment' and (select status from public.pathway_appointments where id=conv.appointment_id)<>'accepted' then raise exception 'This appointment chat is read-only' using errcode='42501'; end if;
      perform pg_advisory_xact_lock(hashtextextended('message:'||u,0));
      key:=(payload->>'clientId')::uuid;
      if exists(select 1 from public.pathway_messages where author_id=u and client_id=key and conversation_id=conv.id) then return '{"ok":true}'; end if;
      if (select count(*) from public.pathway_messages where author_id=u and created_at>now()-interval '1 minute')>=20 then raise exception 'Please wait before sending more messages' using errcode='P0429'; end if;
      insert into public.pathway_messages(conversation_id,author_id,body,client_id) values(conv.id,u,trim(payload->>'body'),key); return '{"ok":true}';
    elsif action='message_read' then
      insert into public.pathway_message_reads(conversation_id,user_id,read_at) values(conv.id,u,least(now(),(payload->>'through')::timestamptz)) on conflict(conversation_id,user_id) do update set read_at=greatest(pathway_message_reads.read_at,excluded.read_at); return '{"ok":true}';
    else
      if not exists(select 1 from public.pathway_messages where id=(payload->>'messageId')::uuid and conversation_id=conv.id) then raise exception 'Message not found'; end if;
      insert into public.pathway_message_reports(message_id,reporter_id,reason) values((payload->>'messageId')::uuid,u,trim(payload->>'reason')) on conflict do nothing;
      insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id) values(o,u,'message_reported','message',payload->>'messageId'); return '{"ok":true}';
    end if;
  elsif action='support' then
    return jsonb_build_object('ai',jsonb_build_object('enabled',false,'status','Not configured'),
      'sources',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('student_name',(select display_name from public.profiles where user_id=s.student_id),'packet_title',(select title from public.advising_packets where id=s.packet_id))) from public.pathway_support_sources s where s.program_id=p and ((s.student_id=u) or public.pathway_source_visible(s,u,staff))),'[]'),
      'reviews',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('student_name',(select display_name from public.profiles where user_id=r.student_id))) from public.pathway_support_reviews r join public.pathway_support_sources s on s.id=r.source_id where r.program_id=p and public.pathway_source_visible(s,u,staff) and (r.student_id<>u or (r.shared_with_student and r.status<>'draft'))),'[]'));
  elsif action='support_materials' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title)) from public.advising_packets where student_id=u and program_id=p and status='active' and revoked_at is null and (expires_at is null or expires_at>now())),'[]');
  elsif action='support_share' then
    if not public.pathway_role(u,'student',o,p) then raise exception 'Student role required' using errcode='42501'; end if;
    if payload->>'packetId' is not null and not exists(select 1 from public.advising_packets where id=(payload->>'packetId')::uuid and student_id=u and program_id=p and status='active' and revoked_at is null and (expires_at is null or expires_at>now())) then raise exception 'Share an active advising packet first'; end if;
    insert into public.pathway_support_sources(student_id,organization_id,program_id,goals,barriers,deadlines,packet_id,expires_at)
      values(u,o,p,coalesce(payload->>'goals',''),coalesce(payload->>'barriers',''),coalesce(payload->>'deadlines',''),(payload->>'packetId')::uuid,(payload->>'expiresAt')::timestamptz) returning id into obj; return jsonb_build_object('id',obj);
  elsif action='support_revoke' then
    update public.pathway_support_sources set revoked_at=now() where id=(payload->>'id')::uuid and student_id=u and program_id=p; return '{"ok":true}';
  elsif action='support_review' then
    select * into src from public.pathway_support_sources where id=(payload->>'sourceId')::uuid and program_id=p;
    if src.id is null or src.student_id=u or not staff or not public.pathway_source_visible(src,u,staff) then raise exception 'Support review access denied' using errcode='42501'; end if;
    obj:=coalesce((payload->>'id')::uuid,gen_random_uuid());
    if exists(select 1 from public.pathway_support_reviews where id=obj and source_id<>src.id) then raise exception 'Review source cannot change'; end if;
    insert into public.pathway_support_reviews(id,source_id,student_id,organization_id,program_id,reviewer_id,area,evidence,action,status,shared_with_student,follow_up_on)
    values(obj,src.id,src.student_id,o,p,u,trim(payload->>'area'),trim(payload->>'evidence'),trim(payload->>'action'),payload->>'status',coalesce((payload->>'share')::boolean,false),(payload->>'followUpOn')::date)
    on conflict(id) do update set reviewer_id=u,area=excluded.area,evidence=excluded.evidence,action=excluded.action,status=excluded.status,shared_with_student=excluded.shared_with_student,follow_up_on=excluded.follow_up_on,updated_at=now();
    insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id) values(o,u,'support_review_saved','support_review',obj::text); return jsonb_build_object('id',obj);
  elsif action='support_generate' then
    raise exception 'AI generation is not configured';
  end if;
  -- Administrative and operational actions are implemented in a separate function.
  return public.pathway_admin_action(action,payload,u,o,p,staff,principal);
end $$;

revoke all on function public.pathway_role(uuid,text,uuid,uuid,uuid),public.pathway_principal(uuid,uuid),public.pathway_pair(uuid,uuid,uuid,uuid,boolean),public.pathway_notify(uuid,uuid,text,text,uuid),public.pathway_source_visible(public.pathway_support_sources,uuid,boolean),public.pathway_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.pathway_action(text,jsonb) to authenticated;

commit;
