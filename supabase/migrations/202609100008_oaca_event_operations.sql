begin;

-- Additive event operations. Penji originals remain private platform files; only the
-- minimum normalized fields below are released from quarantine after approval.
create table public.oaca_event_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check(length(title) between 1 and 240),
  recurrence text not null default 'once' check(recurrence in ('once','weekly')),
  source_system text,
  source_key_hash text check(source_key_hash is null or source_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique(organization_id,source_system,source_key_hash)
);

alter table public.oaca_events add column if not exists series_id uuid references public.oaca_event_series(id) on delete set null;
alter table public.oaca_events add column if not exists source_system text;
alter table public.oaca_events add column if not exists source_key_hash text check(source_key_hash is null or source_key_hash ~ '^[0-9a-f]{64}$');
alter table public.oaca_events add column if not exists staff_edited_fields text[] not null default '{}';
alter table public.oaca_events add column if not exists source_snapshot jsonb not null default '{}'::jsonb;
create unique index oaca_events_source_key_idx on public.oaca_events(organization_id,source_system,source_key_hash) where source_key_hash is not null;

create table public.oaca_event_hosts (
  event_id uuid not null references public.oaca_events(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  host_role text not null check(host_role in ('owner','check_in')),
  assigned_by uuid not null references public.profiles(user_id),
  assigned_at timestamptz not null default now(),
  primary key(event_id,user_id,host_role)
);

alter table public.oaca_event_registrations add column if not exists attendance_status text not null default 'not_recorded' check(attendance_status in ('present','absent','not_recorded'));
alter table public.oaca_event_registrations add column if not exists attendance_source text check(attendance_source in ('admin','provider','student_qr','staff_qr','manual','import'));
alter table public.oaca_event_registrations add column if not exists attendance_marked_by uuid references public.profiles(user_id);
alter table public.oaca_event_registrations add column if not exists attendance_marked_at timestamptz;
alter table public.oaca_event_registrations add column if not exists attendance_version integer not null default 0 check(attendance_version>=0);
alter table public.oaca_event_registrations add column if not exists registration_source text not null default 'student' check(registration_source in ('student','staff','walk_in','import','audience'));
alter table public.oaca_event_registrations add column if not exists source_log_hash text check(source_log_hash is null or source_log_hash ~ '^[0-9a-f]{64}$');
alter table public.oaca_event_registrations add column if not exists updated_at timestamptz not null default now();

create table public.oaca_event_attendance_changes (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.oaca_events(id) on delete restrict,
  student_id uuid not null references public.profiles(user_id) on delete restrict,
  old_status text not null check(old_status in ('present','absent','not_recorded')),
  new_status text not null check(new_status in ('present','absent','not_recorded')),
  old_version integer not null,
  new_version integer not null,
  changed_by uuid not null references public.profiles(user_id),
  change_source text not null,
  changed_at timestamptz not null default now()
);

create table public.oaca_event_checkin_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.oaca_events(id) on delete cascade,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  opened_by uuid not null references public.profiles(user_id),
  opened_at timestamptz not null default now(),
  closes_at timestamptz not null,
  closed_by uuid references public.profiles(user_id),
  closed_at timestamptz,
  check(closes_at>opened_at)
);
create unique index oaca_event_one_open_checkin on public.oaca_event_checkin_sessions(event_id) where closed_at is null;

create table public.oaca_student_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  redeemed_event_id uuid references public.oaca_events(id),
  redeemed_by uuid references public.profiles(user_id),
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  check(expires_at>created_at)
);

create table public.oaca_attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.oaca_events(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  requested_status text not null check(requested_status in ('present','absent','not_recorded')),
  explanation text not null default '' check(length(explanation)<=2000),
  status text not null default 'open' check(status in ('open','approved','declined','withdrawn')),
  resolved_by uuid references public.profiles(user_id),
  resolution_note text check(length(resolution_note)<=2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index oaca_one_open_attendance_correction on public.oaca_attendance_correction_requests(event_id,student_id) where status='open';

create table public.oaca_event_import_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  events_file_id uuid not null references public.platform_files(id),
  attendance_file_id uuid not null references public.platform_files(id),
  source_system text not null default 'penji' check(source_system='penji'),
  status text not null default 'awaiting_scan' check(status in ('awaiting_scan','validating','ready_for_review','approved','importing','completed','completed_with_issues','rejected','failed')),
  source_event_rows integer not null default 0 check(source_event_rows>=0),
  source_attendance_rows integer not null default 0 check(source_attendance_rows>=0),
  occurrence_count integer not null default 0 check(occurrence_count>=0),
  matched_students integer not null default 0 check(matched_students>=0),
  merged_duplicates integer not null default 0 check(merged_duplicates>=0),
  quality_summary jsonb not null default '{}'::jsonb,
  requested_by uuid not null references public.profiles(user_id),
  reviewed_by uuid references public.profiles(user_id),
  reviewed_at timestamptz,
  processor_version text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(events_file_id<>attendance_file_id)
);

create table public.oaca_event_import_issues (
  id bigint generated always as identity primary key,
  package_id uuid not null references public.oaca_event_import_packages(id) on delete cascade,
  source_file text not null check(source_file in ('events','attendance')),
  row_number integer not null check(row_number>0),
  severity text not null check(severity in ('warning','error')),
  issue_code text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table public.oaca_event_import_jobs (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null unique references public.oaca_event_import_packages(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','running','completed','failed')),
  attempts integer not null default 0 check(attempts between 0 and 20),
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  last_error_code text,
  created_at timestamptz not null default now()
);

create table public.oaca_event_source_links (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.oaca_event_import_packages(id),
  event_id uuid not null references public.oaca_events(id) on delete cascade,
  source_key_hash text not null check(source_key_hash ~ '^[0-9a-f]{64}$'),
  source_row_number integer not null check(source_row_number>0),
  source_snapshot jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique(package_id,source_row_number),
  unique(event_id,source_key_hash)
);

create table public.oaca_event_identity_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  identity_kind text not null check(identity_kind in ('sso','email','student_id')),
  external_key_hash text not null check(external_key_hash ~ '^[0-9a-f]{64}$'),
  profile_id uuid references public.profiles(user_id) on delete set null,
  match_status text not null check(match_status in ('matched','unmatched','ambiguous')),
  package_id uuid not null references public.oaca_event_import_packages(id),
  matched_at timestamptz,
  primary key(organization_id,identity_kind,external_key_hash)
);

create table public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  experience_key text not null references public.experiences(key),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  event_id uuid references public.oaca_events(id) on delete cascade,
  category text not null,
  title text not null check(length(title) between 1 and 240),
  body text not null default '' check(length(body)<=1000),
  deep_link text not null check(deep_link like '/%'),
  template_key text not null,
  template_version integer not null default 1,
  idempotency_key text not null unique,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.oaca_event_notification_rules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.oaca_events(id) on delete cascade,
  notification_type text not null check(notification_type in ('publication','registration_confirmation','waitlist_confirmation','waitlist_promotion','reminder','event_change','cancellation','checkin_open','correction_outcome','follow_up','announcement')),
  offset_minutes integer check(offset_minutes between 0 and 525600),
  channels text[] not null default array['in_app']::text[] check(channels<@array['in_app','email','push','sms']::text[] and channels@>array['in_app']::text[]),
  enabled boolean not null default true,
  scheduled_for timestamptz,
  generation integer not null default 1 check(generation>0),
  enqueued_generation integer not null default 0 check(enqueued_generation>=0),
  created_by uuid not null references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  unique nulls not distinct(event_id,notification_type,offset_minutes)
);

create table public.platform_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  provider text not null default 'web_push' check(provider in ('web_push','apns','fcm')),
  endpoint_hash text not null check(endpoint_hash ~ '^[0-9a-f]{64}$'),
  encrypted_subscription text not null,
  device_label text check(length(device_label)<=120),
  permission_status text not null default 'granted' check(permission_status in ('granted','denied','revoked','expired')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_id,provider,endpoint_hash)
);

create table public.platform_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.platform_notifications(id) on delete cascade,
  channel text not null check(channel in ('email','push','sms')),
  push_subscription_id uuid references public.platform_push_subscriptions(id) on delete set null,
  status text not null check(status in ('queued','suppressed','sent','delivered','failed','opened','clicked','replied','cancelled')),
  suppression_reason text,
  available_at timestamptz not null default now(),
  provider_message_id text,
  idempotency_key text not null unique,
  attempts integer not null default 0 check(attempts between 0 and 20),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_notification_delivery_events (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.platform_notification_deliveries(id) on delete restrict,
  provider_event_id text not null unique,
  provider_message_id text,
  status text not null check(status in ('sent','delivered','failed','opened','clicked','replied')),
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.oaca_event_calendar_links (
  event_id uuid not null references public.oaca_events(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  connection_id uuid references public.pathway_calendar_connections(id) on delete set null,
  provider text not null default 'microsoft' check(provider='microsoft'),
  provider_event_id text,
  portal_version text not null,
  last_synced_at timestamptz,
  primary key(event_id,user_id)
);

create table public.oaca_event_calendar_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.oaca_events(id) on delete cascade,
  operation text not null check(operation in ('upsert','cancel')),
  portal_version text not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check(status in ('pending','running','completed','failed','disabled')),
  attempts integer not null default 0 check(attempts between 0 and 20),
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  last_error_code text,
  created_at timestamptz not null default now()
);

alter table public.oaca_threads drop constraint if exists oaca_threads_kind_check;
alter table public.oaca_threads add constraint oaca_threads_kind_check check(kind in ('appointment','service_inbox','event_inbox'));
alter table public.oaca_threads add column if not exists event_id uuid references public.oaca_events(id) on delete cascade;
alter table public.oaca_threads add column if not exists student_id uuid references public.profiles(user_id) on delete cascade;
alter table public.oaca_threads add constraint oaca_threads_event_kind_check check((kind='event_inbox')=(event_id is not null and student_id is not null));
create unique index oaca_event_one_student_thread on public.oaca_threads(event_id,student_id) where kind='event_inbox';

alter table public.oaca_messages add column if not exists direction text not null default 'portal' check(direction in ('portal','inbound','outbound'));
alter table public.oaca_messages add column if not exists channel text not null default 'in_app' check(channel in ('in_app','sms'));
alter table public.oaca_messages add column if not exists provider_message_id text;
create unique index oaca_messages_provider_id_idx on public.oaca_messages(provider_message_id) where provider_message_id is not null;

create table public.oaca_sms_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  phone_hash text not null check(phone_hash ~ '^[0-9a-f]{64}$'),
  provider_message_id text not null unique,
  received_at timestamptz not null default now(),
  status text not null default 'restricted' check(status in ('restricted','matched','discarded')),
  metadata jsonb not null default '{}'::jsonb
);

create table public.oaca_sms_inbound_receipts (
  provider_message_id text primary key,
  phone_hash text not null check(phone_hash ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now()
);

create index oaca_event_hosts_user_idx on public.oaca_event_hosts(user_id,event_id);
create index oaca_event_attendance_event_idx on public.oaca_event_registrations(event_id,attendance_status,student_id);
create index platform_notifications_inbox_idx on public.platform_notifications(user_id,created_at desc) where dismissed_at is null;
create index platform_notification_delivery_ready_idx on public.platform_notification_deliveries(status,available_at) where status='queued';

create function public.oaca_can_manage_event(target_event uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.staff_mfa_verified() and exists(
    select 1 from public.oaca_events e where e.id=target_event and (
      e.created_by=public.current_profile_user_id()
      or exists(select 1 from public.oaca_event_hosts h where h.event_id=e.id and h.user_id=public.current_profile_user_id())
      or exists(select 1 from public.experience_role_assignments r where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.organization_id=e.organization_id and r.role='administrator' and r.revoked_at is null)
    )
  );
$$;

create function public.oaca_event_workspace(payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=public.current_profile_user_id(); org uuid:=public.oaca_active_organization(); selected uuid:=nullif(payload->>'eventId','')::uuid; staff boolean; result jsonb;
begin
  if org is null then raise exception 'OACA membership is required' using errcode='42501'; end if;
  staff:=public.staff_mfa_verified() and exists(select 1 from public.experience_role_assignments r where r.user_id=actor and r.experience_key='oaca' and r.organization_id=org and r.role in ('faculty','staff','administrator') and r.revoked_at is null);
  if selected is not null and staff and not public.oaca_can_manage_event(selected) then raise exception 'Only assigned event staff can open this roster' using errcode='42501'; end if;
  select jsonb_build_object(
    'events',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'title',e.title,'description',e.description,'startsAt',e.starts_at,'endsAt',e.ends_at,'timezone',e.timezone,'modality',e.modality,'location',e.location,'capacity',e.capacity,'status',e.status,'audience',e.audience_spec,
      'canManage',public.oaca_can_manage_event(e.id),'registrationCount',(select count(*) from public.oaca_event_registrations r where r.event_id=e.id and r.status<>'cancelled'),
      'presentCount',(select count(*) from public.oaca_event_registrations r where r.event_id=e.id and r.attendance_status='present'),
      'absentCount',(select count(*) from public.oaca_event_registrations r where r.event_id=e.id and r.attendance_status='absent'),
      'notRecordedCount',(select count(*) from public.oaca_event_registrations r where r.event_id=e.id and r.attendance_status='not_recorded'),
      'attendanceStatus',(select r.attendance_status from public.oaca_event_registrations r where r.event_id=e.id and r.student_id=actor),
      'registered',exists(select 1 from public.oaca_event_registrations r where r.event_id=e.id and r.student_id=actor and r.status<>'cancelled'),
      'checkinOpen',exists(select 1 from public.oaca_event_checkin_sessions s where s.event_id=e.id and s.closed_at is null and s.closes_at>now())
    ) order by e.starts_at desc) from public.oaca_events e where e.organization_id=org and (case when staff then public.oaca_can_manage_event(e.id) else e.status in ('published','completed') and public.oaca_student_matches_audience(actor,org,e.audience_spec) end)),'[]'::jsonb),
    'roster',case when selected is not null and staff then coalesce((select jsonb_agg(jsonb_build_object('studentId',r.student_id,'displayName',p.display_name,'registrationStatus',r.status,'registrationSource',r.registration_source,'attendanceStatus',r.attendance_status,'attendanceSource',r.attendance_source,'version',r.attendance_version,'updatedAt',r.updated_at) order by p.display_name) from public.oaca_event_registrations r join public.profiles p on p.user_id=r.student_id where r.event_id=selected),'[]'::jsonb) else '[]'::jsonb end,
    'hosts',case when selected is not null and staff then coalesce((select jsonb_agg(jsonb_build_object('userId',h.user_id,'displayName',p.display_name,'role',h.host_role) order by p.display_name) from public.oaca_event_hosts h join public.profiles p on p.user_id=h.user_id where h.event_id=selected),'[]'::jsonb) else '[]'::jsonb end,
    'staffOptions',case when selected is not null and staff then coalesce((select jsonb_agg(jsonb_build_object('userId',x.user_id,'displayName',x.display_name) order by x.display_name) from (select distinct r.user_id,p.display_name from public.experience_role_assignments r join public.profiles p on p.user_id=r.user_id where r.experience_key='oaca' and r.organization_id=org and r.role in ('faculty','staff','administrator') and r.revoked_at is null and p.status='active') x),'[]'::jsonb) else '[]'::jsonb end,
    'corrections',case when selected is not null and staff then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'studentId',c.student_id,'displayName',p.display_name,'requestedStatus',c.requested_status,'explanation',c.explanation,'status',c.status,'createdAt',c.created_at) order by c.created_at desc) from public.oaca_attendance_correction_requests c join public.profiles p on p.user_id=c.student_id where c.event_id=selected),'[]'::jsonb) else coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'eventId',c.event_id,'requestedStatus',c.requested_status,'status',c.status,'createdAt',c.created_at,'resolutionNote',c.resolution_note) order by c.created_at desc) from public.oaca_attendance_correction_requests c where c.student_id=actor),'[]'::jsonb) end,
    'notifications',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'eventId',n.event_id,'category',n.category,'title',n.title,'body',n.body,'deepLink',n.deep_link,'readAt',n.read_at,'dismissedAt',n.dismissed_at,'createdAt',n.created_at) order by n.created_at desc) from public.platform_notifications n where n.user_id=actor and n.experience_key='oaca' and n.dismissed_at is null),'[]'::jsonb),
    'preferences',coalesce((select jsonb_build_object('emailEnabled',p.email_enabled,'smsEnabled',p.sms_enabled,'phoneVerified',p.phone_verified_at is not null,'quietHoursStart',p.quiet_hours_start,'quietHoursEnd',p.quiet_hours_end,'timezone',p.timezone) from public.platform_notification_preferences p where p.user_id=actor),jsonb_build_object('emailEnabled',true,'smsEnabled',false,'phoneVerified',false,'quietHoursStart',null,'quietHoursEnd',null,'timezone','America/Los_Angeles')),
    'pushSubscriptions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'provider',s.provider,'deviceLabel',s.device_label,'permissionStatus',s.permission_status,'createdAt',s.created_at) order by s.created_at desc) from public.platform_push_subscriptions s where s.user_id=actor and s.revoked_at is null),'[]'::jsonb),
    'notificationRules',case when selected is not null and staff then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'type',r.notification_type,'offsetMinutes',r.offset_minutes,'channels',r.channels,'enabled',r.enabled,'scheduledFor',r.scheduled_for,'generation',r.generation) order by r.notification_type,r.offset_minutes desc) from public.oaca_event_notification_rules r where r.event_id=selected),'[]'::jsonb) else '[]'::jsonb end,
    'deliveries',case when selected is not null and staff then coalesce((select jsonb_object_agg(status,total) from (select d.status,count(*) total from public.platform_notification_deliveries d join public.platform_notifications n on n.id=d.notification_id where n.event_id=selected group by d.status) x),'{}'::jsonb) else '{}'::jsonb end,
    'threads',case when selected is not null then coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'studentId',t.student_id,'studentName',(select p.display_name from public.profiles p where p.user_id=t.student_id),'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'senderId',m.sender_id,'body',m.body,'direction',m.direction,'channel',m.channel,'createdAt',m.created_at) order by m.created_at) from public.oaca_messages m where m.thread_id=t.id),'[]'::jsonb)) order by t.created_at desc) from public.oaca_threads t where t.event_id=selected and exists(select 1 from public.oaca_thread_participants tp where tp.thread_id=t.id and tp.user_id=actor)),'[]'::jsonb) else '[]'::jsonb end,
    'unreadCount',(select count(*) from public.platform_notifications n where n.user_id=actor and n.experience_key='oaca' and n.read_at is null and n.dismissed_at is null)
  ) into result;
  return result;
end $$;

create function public.oaca_update_event(payload jsonb) returns public.oaca_events language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.oaca_events; fields text[]:='{}'; old_start timestamptz; old_location text; old_modality text;
begin
  select * into saved from public.oaca_events where id=(payload->>'eventId')::uuid for update;
  if not found or not public.oaca_can_manage_event(saved.id) then raise exception 'This event is outside your assigned scope' using errcode='42501'; end if;
  old_start:=saved.starts_at; old_location:=saved.location; old_modality:=saved.modality;
  if payload?'title' then fields:=fields||'title'; end if; if payload?'description' then fields:=fields||'description'; end if;
  if payload?'startsAt' then fields:=fields||'starts_at'; end if; if payload?'endsAt' then fields:=fields||'ends_at'; end if;
  if payload?'location' then fields:=fields||'location'; end if; if payload?'modality' then fields:=fields||'modality'; end if; if payload?'capacity' then fields:=fields||'capacity'; end if;
  update public.oaca_events set
    title=case when payload?'title' then left(trim(payload->>'title'),240) else title end,
    description=case when payload?'description' then left(coalesce(payload->>'description',''),12000) else description end,
    starts_at=case when payload?'startsAt' then (payload->>'startsAt')::timestamptz else starts_at end,
    ends_at=case when payload?'endsAt' then nullif(payload->>'endsAt','')::timestamptz else ends_at end,
    location=case when payload?'location' then nullif(left(coalesce(payload->>'location',''),500),'') else location end,
    modality=case when payload?'modality' then payload->>'modality' else modality end,
    capacity=case when payload?'capacity' then nullif(payload->>'capacity','')::integer else capacity end,
    staff_edited_fields=array(select distinct unnest(oaca_events.staff_edited_fields||fields)),updated_at=now()
  where id=saved.id returning * into saved;
  if old_start is distinct from saved.starts_at or old_location is distinct from saved.location or old_modality is distinct from saved.modality then
    update public.oaca_event_notification_rules set generation=generation+1,updated_at=now(),scheduled_for=case when notification_type='reminder' then saved.starts_at-make_interval(mins=>offset_minutes) else scheduled_for end where event_id=saved.id;
    update public.platform_notification_deliveries d set status='cancelled',updated_at=now() from public.platform_notifications n where d.notification_id=n.id and n.event_id=saved.id and d.status='queued' and n.category in ('reminder','event_change');
    if saved.status='published' then perform public.oaca_send_event_notification(jsonb_build_object('eventId',saved.id,'type','event_change','title','Event details changed: '||saved.title,'body','The event time, location, or format changed. Open Compass for current details.','channels',jsonb_build_array('in_app','email'),'audience','registered','generation',extract(epoch from now())::bigint::text)); end if;
  end if;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(saved.organization_id,public.current_profile_user_id(),'oaca_event_updated','oaca_event',saved.id,jsonb_build_object('fields',fields),'oaca');
  return saved;
end $$;

create function public.oaca_assign_event_host(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare event_id uuid:=(payload->>'eventId')::uuid; target uuid:=(payload->>'userId')::uuid; role_key text:=payload->>'role'; org uuid;
begin
  select organization_id into org from public.oaca_events where id=event_id;
  if org is null or not public.oaca_can_manage_event(event_id) or role_key not in ('owner','check_in') then raise exception 'This host assignment is not allowed' using errcode='42501'; end if;
  if not exists(select 1 from public.experience_role_assignments r where r.user_id=target and r.experience_key='oaca' and r.organization_id=org and r.role in ('faculty','staff','administrator') and r.revoked_at is null) then raise exception 'Choose active OACA staff' using errcode='23514'; end if;
  insert into public.oaca_event_hosts(event_id,user_id,host_role,assigned_by) values(event_id,target,role_key,public.current_profile_user_id()) on conflict do nothing;
  insert into public.oaca_thread_participants(thread_id,user_id,participant_role) select t.id,target,'event_staff' from public.oaca_threads t where t.event_id=event_id and t.kind='event_inbox' on conflict do nothing;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_event_host_assigned','oaca_event',event_id,jsonb_build_object('userId',target,'role',role_key),'oaca');
  return '{"ok":true}'::jsonb;
end $$;

create function public.oaca_update_event_attendance(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target_event uuid:=(payload->>'eventId')::uuid; student uuid:=(payload->>'studentId')::uuid; next_status text:=payload->>'status'; expected integer:=coalesce((payload->>'version')::integer,0); current public.oaca_event_registrations; next_version integer; org uuid;
begin
  if next_status not in ('present','absent','not_recorded') or not public.oaca_can_manage_event(target_event) then raise exception 'Attendance access is limited to assigned event staff' using errcode='42501'; end if;
  select organization_id into org from public.oaca_events where id=target_event;
  select * into current from public.oaca_event_registrations where event_id=target_event and student_id=student for update;
  if not found then
    if not public.oaca_student_matches_audience(student,org,(select audience_spec from public.oaca_events where id=target_event)) then raise exception 'Choose an active student eligible for this event' using errcode='42501'; end if;
    insert into public.oaca_event_registrations(event_id,student_id,status,registration_source,attendance_status,attendance_source,attendance_marked_by,attendance_marked_at,attendance_version)
    values(target_event,student,case when next_status='present' then 'attended' when next_status='absent' then 'no_show' else 'registered' end,'walk_in',next_status,'manual',public.current_profile_user_id(),now(),1) returning * into current;
    insert into public.oaca_event_attendance_changes(event_id,student_id,old_status,new_status,old_version,new_version,changed_by,change_source) values(target_event,student,'not_recorded',next_status,0,1,public.current_profile_user_id(),'manual');
  else
    if current.attendance_version<>expected then raise exception 'Attendance changed on another device; reload this roster' using errcode='40001'; end if;
    next_version:=current.attendance_version+1;
    update public.oaca_event_registrations set attendance_status=next_status,status=case when next_status='present' then 'attended' when next_status='absent' then 'no_show' else case when status in ('attended','no_show') then 'registered' else status end end,attendance_source='manual',attendance_marked_by=public.current_profile_user_id(),attendance_marked_at=now(),attendance_version=next_version,updated_at=now() where event_id=target_event and student_id=student;
    insert into public.oaca_event_attendance_changes(event_id,student_id,old_status,new_status,old_version,new_version,changed_by,change_source) values(target_event,student,current.attendance_status,next_status,current.attendance_version,next_version,public.current_profile_user_id(),'manual');
    current.attendance_version:=next_version; current.attendance_status:=next_status;
  end if;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_event_attendance_changed','oaca_event',target_event,jsonb_build_object('studentId',student,'from',coalesce(current.attendance_status,'not_recorded'),'to',next_status),'oaca');
  return jsonb_build_object('studentId',student,'status',next_status,'version',current.attendance_version);
end $$;

create function public.oaca_set_event_checkin(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target_event uuid:=(payload->>'eventId')::uuid; action text:=payload->>'action'; raw_token text; saved public.oaca_event_checkin_sessions; minutes integer:=least(greatest(coalesce((payload->>'minutes')::integer,120),5),720);
begin
  if not public.oaca_can_manage_event(target_event) then raise exception 'Only assigned event staff can control check-in' using errcode='42501'; end if;
  if action='close' then update public.oaca_event_checkin_sessions set closed_at=now(),closed_by=public.current_profile_user_id() where event_id=target_event and closed_at is null; return '{"open":false}'::jsonb; end if;
  if action<>'open' then raise exception 'Choose open or close' using errcode='22023'; end if;
  update public.oaca_event_checkin_sessions set closed_at=now(),closed_by=public.current_profile_user_id() where event_id=target_event and closed_at is null;
  raw_token:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into public.oaca_event_checkin_sessions(event_id,token_hash,opened_by,closes_at) values(target_event,encode(digest(raw_token,'sha256'),'hex'),public.current_profile_user_id(),now()+make_interval(mins=>minutes)) returning * into saved;
  perform public.oaca_send_event_notification(jsonb_build_object('eventId',target_event,'type','checkin_open','title','Event check-in is open','body','Open Compass to check in at the event.','channels',jsonb_build_array('in_app'),'audience','registered','generation',saved.id::text));
  return jsonb_build_object('open',true,'token',raw_token,'closesAt',saved.closes_at,'deepLink','/app/oaca?checkin='||raw_token);
end $$;

create function public.oaca_self_checkin(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare session public.oaca_event_checkin_sessions; event_record public.oaca_events; actor uuid:=public.current_profile_user_id(); old_status text:='not_recorded'; old_version integer:=0; saved public.oaca_event_registrations;
begin
  select * into session from public.oaca_event_checkin_sessions where token_hash=encode(digest(payload->>'token','sha256'),'hex') and closed_at is null and closes_at>now() for update;
  if not found then raise exception 'This event check-in is closed or invalid' using errcode='42501'; end if;
  select * into event_record from public.oaca_events where id=session.event_id;
  if event_record.status not in ('published','completed') or not public.oaca_student_matches_audience(actor,event_record.organization_id,event_record.audience_spec) then raise exception 'This event is not available to your account' using errcode='42501'; end if;
  select attendance_status,attendance_version into old_status,old_version from public.oaca_event_registrations where event_id=event_record.id and student_id=actor;
  insert into public.oaca_event_registrations(event_id,student_id,status,registration_source,attendance_status,attendance_source,attendance_marked_by,attendance_marked_at,attendance_version)
  values(event_record.id,actor,'attended','walk_in','present','student_qr',actor,now(),1)
  on conflict(event_id,student_id) do update set status='attended',attendance_status='present',attendance_source='student_qr',attendance_marked_by=actor,attendance_marked_at=now(),attendance_version=oaca_event_registrations.attendance_version+1,updated_at=now() returning * into saved;
  if old_status is distinct from 'present' then insert into public.oaca_event_attendance_changes(event_id,student_id,old_status,new_status,old_version,new_version,changed_by,change_source) values(event_record.id,actor,coalesce(old_status,'not_recorded'),'present',coalesce(old_version,0),saved.attendance_version,actor,'student_qr'); end if;
  return jsonb_build_object('ok',true,'eventId',event_record.id,'title',event_record.title,'attendanceStatus','present');
end $$;

create function public.oaca_issue_student_qr(payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare raw_token text:=gen_random_uuid()::text||gen_random_uuid()::text; saved public.oaca_student_qr_tokens;
begin
  perform public.require_experience_membership('oaca');
  if not exists(select 1 from public.experience_role_assignments r join public.profiles p on p.user_id=r.user_id where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.role='student' and r.revoked_at is null and p.status='active') then raise exception 'Active student access is required' using errcode='42501'; end if;
  insert into public.oaca_student_qr_tokens(student_id,token_hash,expires_at) values(public.current_profile_user_id(),encode(digest(raw_token,'sha256'),'hex'),now()+interval '5 minutes') returning * into saved;
  return jsonb_build_object('token',raw_token,'expiresAt',saved.expires_at);
end $$;

create function public.oaca_scan_student_qr(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare token_record public.oaca_student_qr_tokens; target_event uuid:=(payload->>'eventId')::uuid; event_record public.oaca_events; current public.oaca_event_registrations; old_status text:='not_recorded'; old_version integer:=0;
begin
  if not public.oaca_can_manage_event(target_event) then raise exception 'Only assigned event staff can scan student codes' using errcode='42501'; end if;
  select * into token_record from public.oaca_student_qr_tokens where token_hash=encode(digest(payload->>'token','sha256'),'hex') and redeemed_at is null and expires_at>now() for update;
  if not found then raise exception 'This personal code expired or was already used' using errcode='42501'; end if;
  select * into event_record from public.oaca_events where id=target_event;
  if not found or not public.oaca_student_matches_audience(token_record.student_id,event_record.organization_id,event_record.audience_spec) then raise exception 'This student is not eligible for this event' using errcode='42501'; end if;
  select * into current from public.oaca_event_registrations where event_id=target_event and student_id=token_record.student_id for update;
  if found then old_status:=current.attendance_status; old_version:=current.attendance_version; end if;
  insert into public.oaca_event_registrations(event_id,student_id,status,registration_source,attendance_status,attendance_source,attendance_marked_by,attendance_marked_at,attendance_version)
  values(target_event,token_record.student_id,'attended','walk_in','present','staff_qr',public.current_profile_user_id(),now(),1)
  on conflict(event_id,student_id) do update set status='attended',attendance_status='present',attendance_source='staff_qr',attendance_marked_by=public.current_profile_user_id(),attendance_marked_at=now(),attendance_version=oaca_event_registrations.attendance_version+1,updated_at=now() returning * into current;
  update public.oaca_student_qr_tokens set redeemed_event_id=target_event,redeemed_by=public.current_profile_user_id(),redeemed_at=now() where id=token_record.id;
  if old_status is distinct from 'present' then insert into public.oaca_event_attendance_changes(event_id,student_id,old_status,new_status,old_version,new_version,changed_by,change_source) values(target_event,token_record.student_id,old_status,'present',old_version,current.attendance_version,public.current_profile_user_id(),'staff_qr'); end if;
  return jsonb_build_object('ok',true,'studentId',token_record.student_id,'status','present','version',current.attendance_version);
end $$;

create function public.oaca_request_attendance_correction(payload jsonb) returns public.oaca_attendance_correction_requests language plpgsql security definer set search_path=public,pg_temp as $$
declare event_record public.oaca_events; saved public.oaca_attendance_correction_requests; requested text:=payload->>'requestedStatus';
begin
  select * into event_record from public.oaca_events where id=(payload->>'eventId')::uuid;
  if not found or requested not in ('present','absent','not_recorded') or not exists(select 1 from public.oaca_event_registrations r where r.event_id=event_record.id and r.student_id=public.current_profile_user_id()) then raise exception 'This attendance record is not available' using errcode='42501'; end if;
  insert into public.oaca_attendance_correction_requests(event_id,student_id,requested_status,explanation) values(event_record.id,public.current_profile_user_id(),requested,left(coalesce(payload->>'explanation',''),2000)) returning * into saved;
  return saved;
end $$;

create function public.oaca_resolve_attendance_correction(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare correction public.oaca_attendance_correction_requests; decision text:=payload->>'decision'; registration public.oaca_event_registrations;
begin
  select * into correction from public.oaca_attendance_correction_requests where id=(payload->>'correctionId')::uuid and status='open' for update;
  if not found or not public.oaca_can_manage_event(correction.event_id) or decision not in ('approve','decline') then raise exception 'This correction cannot be resolved' using errcode='42501'; end if;
  if decision='approve' then
    select * into registration from public.oaca_event_registrations where event_id=correction.event_id and student_id=correction.student_id;
    perform public.oaca_update_event_attendance(jsonb_build_object('eventId',correction.event_id,'studentId',correction.student_id,'status',correction.requested_status,'version',registration.attendance_version));
  end if;
  update public.oaca_attendance_correction_requests set status=case when decision='approve' then 'approved' else 'declined' end,resolved_by=public.current_profile_user_id(),resolution_note=left(coalesce(payload->>'resolutionNote',''),2000),resolved_at=now() where id=correction.id;
  perform public.oaca_create_notification(correction.student_id,correction.event_id,'correction_outcome','Attendance correction updated','Your attendance correction has been reviewed.','oaca_correction_outcome',1,'correction:'||correction.id||':'||decision);
  return jsonb_build_object('ok',true,'status',case when decision='approve' then 'approved' else 'declined' end);
end $$;

create function public.oaca_create_event_import_package(payload jsonb) returns public.oaca_event_import_packages language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_active_organization(); events_file public.platform_files; attendance_file public.platform_files; saved public.oaca_event_import_packages;
begin
  if org is null or not public.oaca_can_manage_imports(org) then raise exception 'Import management capability and MFA are required' using errcode='42501'; end if;
  select * into events_file from public.platform_files where id=(payload->>'eventsFileId')::uuid and owner_id=public.current_profile_user_id() and experience_key='oaca' and archived_at is null;
  select * into attendance_file from public.platform_files where id=(payload->>'attendanceFileId')::uuid and owner_id=public.current_profile_user_id() and experience_key='oaca' and archived_at is null;
  if events_file.id is null or attendance_file.id is null or events_file.mime_type not in ('text/csv','application/csv','application/vnd.ms-excel') or attendance_file.mime_type not in ('text/csv','application/csv','application/vnd.ms-excel') then raise exception 'Choose the two private Penji CSV uploads' using errcode='22023'; end if;
  insert into public.oaca_event_import_packages(organization_id,events_file_id,attendance_file_id,status,requested_by) values(org,events_file.id,attendance_file.id,case when events_file.scan_status='clean' and attendance_file.scan_status='clean' then 'ready_for_review' else 'awaiting_scan' end,public.current_profile_user_id()) returning * into saved;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_event_import_created','oaca_event_import_package',saved.id,jsonb_build_object('eventsFileId',events_file.id,'attendanceFileId',attendance_file.id),'oaca');
  return saved;
end $$;

create function public.oaca_review_event_import_package(payload jsonb) returns public.oaca_event_import_packages language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.oaca_event_import_packages; decision text:=payload->>'decision'; event_file public.platform_files; log_file public.platform_files;
begin
  select * into saved from public.oaca_event_import_packages where id=(payload->>'packageId')::uuid for update;
  if not found or not public.oaca_can_manage_imports(saved.organization_id) or decision not in ('approve','reject') then raise exception 'This import decision is not allowed' using errcode='42501'; end if;
  select * into event_file from public.platform_files where id=saved.events_file_id; select * into log_file from public.platform_files where id=saved.attendance_file_id;
  if decision='approve' and (saved.requested_by=public.current_profile_user_id() or event_file.scan_status<>'clean' or log_file.scan_status<>'clean') then raise exception 'A second authorized reviewer may approve only after both scans are clean' using errcode='42501'; end if;
  update public.oaca_event_import_packages set status=case when decision='approve' then 'approved' else 'rejected' end,reviewed_by=public.current_profile_user_id(),reviewed_at=now(),updated_at=now() where id=saved.id returning * into saved;
  if decision='approve' then insert into public.oaca_event_import_jobs(package_id) values(saved.id) on conflict(package_id) do nothing; end if;
  return saved;
end $$;

-- Trusted processor only. It receives an allowlisted normalized projection, never
-- addresses, phone numbers, ZIP codes, demographics, or other ignored metadata.
create function public.oaca_process_event_import_package(package_id uuid, event_rows jsonb, attendance_rows jsonb, processor_version text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare package public.oaca_event_import_packages; row_data jsonb; source_key text; event_key text; series_key text; saved_event public.oaca_events; saved_series public.oaca_event_series; student uuid; existing public.oaca_event_registrations; attendance text; starts timestamptz; ends timestamptz; series_end date; occurrence_start timestamptz; occurrence_end timestamptz; row_number integer:=0; attendance_number integer:=0; occurrences integer:=0; matched integer:=0; merged integer:=0; conflicts integer:=0; event_map jsonb:='{}'::jsonb; identity_value text; identity_type text;
begin
  select * into package from public.oaca_event_import_packages where id=package_id for update;
  if not found or package.status not in ('approved','importing') then raise exception 'Event import package is not approved'; end if;
  update public.oaca_event_import_packages set status='importing',processor_version=left($4,100),updated_at=now() where id=package.id;
  delete from public.oaca_event_import_issues where oaca_event_import_issues.package_id=package.id;
  for row_data in select value from jsonb_array_elements(coalesce(event_rows,'[]'::jsonb)) loop
    row_number:=row_number+1;
    begin
      starts:=(row_data->>'startsAt')::timestamptz; ends:=nullif(row_data->>'endsAt','')::timestamptz; series_end:=coalesce(nullif(row_data->>'seriesEndsOn','')::date,starts::date);
      if nullif(trim(row_data->>'title'),'') is null or ends is null or ends<=starts then raise exception 'invalid event'; end if;
      series_key:=encode(digest('penji:series:'||lower(trim(row_data->>'title'))||':'||starts::date::text,'sha256'),'hex');
      insert into public.oaca_event_series(organization_id,title,recurrence,source_system,source_key_hash) values(package.organization_id,left(trim(row_data->>'title'),240),case when series_end>starts::date then 'weekly' else 'once' end,'penji',series_key) on conflict(organization_id,source_system,source_key_hash) do update set title=excluded.title returning * into saved_series;
      occurrence_start:=starts;
      while occurrence_start::date<=series_end loop
        occurrence_end:=occurrence_start+(ends-starts);
        source_key:=encode(digest('penji:event:'||lower(trim(row_data->>'title'))||':'||to_char(occurrence_start at time zone 'America/Los_Angeles','YYYY-MM-DD HH24:MI'),'sha256'),'hex');
        insert into public.oaca_events(organization_id,series_id,title,description,starts_at,ends_at,timezone,modality,location,capacity,audience_spec,status,created_by,published_at,completed_at,source_system,source_key_hash,source_snapshot)
        values(package.organization_id,saved_series.id,left(trim(row_data->>'title'),240),left(coalesce(row_data->>'description',''),12000),occurrence_start,occurrence_end,'America/Los_Angeles',case when lower(coalesce(row_data->>'modality','')) in ('teams','hybrid') then lower(row_data->>'modality') else 'in_person' end,nullif(left(coalesce(row_data->>'location',''),500),''),case when nullif(row_data->>'capacity','')::integer=9999 then null else nullif(row_data->>'capacity','')::integer end,'{"includeAllStudents":true}'::jsonb,case when occurrence_start>now() then 'published' else 'completed' end,package.requested_by,case when occurrence_start>now() then now() end,case when occurrence_start<=now() then occurrence_end end,'penji',source_key,jsonb_build_object('title',row_data->>'title','startsAt',occurrence_start,'endsAt',occurrence_end,'location',row_data->>'location','capacity',row_data->>'capacity'))
        on conflict(organization_id,source_system,source_key_hash) where source_key_hash is not null do update set
          title=case when not ('title'=any(oaca_events.staff_edited_fields)) then excluded.title else oaca_events.title end,
          starts_at=case when not ('starts_at'=any(oaca_events.staff_edited_fields)) then excluded.starts_at else oaca_events.starts_at end,
          ends_at=case when not ('ends_at'=any(oaca_events.staff_edited_fields)) then excluded.ends_at else oaca_events.ends_at end,
          location=case when not ('location'=any(oaca_events.staff_edited_fields)) then excluded.location else oaca_events.location end,
          capacity=case when not ('capacity'=any(oaca_events.staff_edited_fields)) then excluded.capacity else oaca_events.capacity end,
          source_snapshot=excluded.source_snapshot,updated_at=now() returning * into saved_event;
        insert into public.oaca_event_source_links(package_id,event_id,source_key_hash,source_row_number,source_snapshot) values(package.id,saved_event.id,source_key,row_number,saved_event.source_snapshot) on conflict do nothing;
        event_key:=lower(trim(row_data->>'title'))||'|'||to_char(occurrence_start at time zone 'America/Los_Angeles','YYYY-MM-DD HH24:MI'); event_map:=event_map||jsonb_build_object(event_key,saved_event.id);
        insert into public.oaca_event_hosts(event_id,user_id,host_role,assigned_by) values(saved_event.id,package.requested_by,'owner',package.requested_by) on conflict do nothing;
        insert into public.oaca_event_notification_rules(event_id,notification_type,offset_minutes,channels,enabled,scheduled_for,created_by) values(saved_event.id,'reminder',1440,array['in_app','email'],true,saved_event.starts_at-interval '24 hours',package.requested_by),(saved_event.id,'reminder',60,array['in_app','email'],true,saved_event.starts_at-interval '1 hour',package.requested_by) on conflict do nothing;
        occurrences:=occurrences+1; occurrence_start:=occurrence_start+interval '7 days';
      end loop;
    exception when others then insert into public.oaca_event_import_issues(package_id,source_file,row_number,severity,issue_code,message) values(package.id,'events',row_number,'error','event_validation_failed','The normalized event row was rejected; no raw values were retained.');
    end;
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(attendance_rows,'[]'::jsonb)) loop
    attendance_number:=attendance_number+1; student:=null;
    begin
      event_key:=lower(trim(row_data->>'eventName'))||'|'||to_char((row_data->>'startsAt')::timestamptz at time zone 'America/Los_Angeles','YYYY-MM-DD HH24:MI'); saved_event.id:=(event_map->>event_key)::uuid;
      if saved_event.id is null then select id into saved_event.id from public.oaca_events where organization_id=package.organization_id and source_system='penji' and source_key_hash=encode(digest('penji:event:'||lower(trim(row_data->>'eventName'))||':'||to_char((row_data->>'startsAt')::timestamptz at time zone 'America/Los_Angeles','YYYY-MM-DD HH24:MI'),'sha256'),'hex'); end if;
      if saved_event.id is null then raise exception 'event unmatched'; end if;
      foreach identity_type in array array['sso','email','student_id'] loop
        identity_value:=case identity_type when 'sso' then lower(trim(coalesce(row_data->>'studentSso',''))) when 'email' then lower(trim(coalesce(row_data->>'studentEmail',''))) else lower(trim(coalesce(row_data->>'studentId',''))) end;
        if identity_value<>'' and student is null then
          select l.profile_id into student from public.oaca_event_identity_links l where l.organization_id=package.organization_id and l.identity_kind=identity_type and l.external_key_hash=encode(digest('penji:'||identity_type||':'||identity_value,'sha256'),'hex') and l.match_status='matched';
          if student is null and identity_type='email' then select i.canonical_user_id into student from public.account_auth_identities i where lower(i.email)=identity_value limit 1; end if;
          if student is not null then insert into public.oaca_event_identity_links(organization_id,identity_kind,external_key_hash,profile_id,match_status,package_id,matched_at) values(package.organization_id,identity_type,encode(digest('penji:'||identity_type||':'||identity_value,'sha256'),'hex'),student,'matched',package.id,now()) on conflict(organization_id,identity_kind,external_key_hash) do update set profile_id=excluded.profile_id,match_status='matched',package_id=excluded.package_id,matched_at=now(); end if;
        end if;
      end loop;
      if student is null then insert into public.oaca_event_import_issues(package_id,source_file,row_number,severity,issue_code,message) values(package.id,'attendance',attendance_number,'warning','student_unmatched','Student identifiers could not be matched through the restricted identity service.'); continue; end if;
      attendance:=case lower(trim(coalesce(row_data->>'attendance',''))) when 'present' then 'present' when 'absent' then 'absent' else 'not_recorded' end;
      select * into existing from public.oaca_event_registrations where event_id=saved_event.id and student_id=student for update;
      if found and existing.source_log_hash is not null then
        if existing.attendance_status=attendance or (existing.attendance_status='not_recorded' and attendance='not_recorded') then merged:=merged+1; continue;
        else conflicts:=conflicts+1; insert into public.oaca_event_import_issues(package_id,source_file,row_number,severity,issue_code,message) values(package.id,'attendance',attendance_number,'error','conflicting_duplicate','Conflicting attendance values were quarantined for staff review.'); continue; end if;
      end if;
      insert into public.oaca_event_registrations(event_id,student_id,status,registration_source,attendance_status,attendance_source,attendance_marked_at,attendance_version,source_log_hash)
      values(saved_event.id,student,case when attendance='present' then 'attended' when attendance='absent' then 'no_show' else 'registered' end,'import',attendance,'import',now(),1,encode(digest('penji:log:'||trim(row_data->>'sourceLogId'),'sha256'),'hex'))
      on conflict(event_id,student_id) do update set status=excluded.status,registration_source='import',attendance_status=excluded.attendance_status,attendance_source='import',attendance_marked_at=now(),attendance_version=oaca_event_registrations.attendance_version+1,source_log_hash=excluded.source_log_hash,updated_at=now();
      matched:=matched+1;
    exception when others then insert into public.oaca_event_import_issues(package_id,source_file,row_number,severity,issue_code,message) values(package.id,'attendance',attendance_number,'error','attendance_validation_failed','The normalized attendance row was rejected; no raw values were retained.');
    end;
  end loop;
  update public.oaca_event_import_packages set status=case when exists(select 1 from public.oaca_event_import_issues i where i.package_id=package.id and i.severity='error') then 'completed_with_issues' else 'completed' end,source_event_rows=row_number,source_attendance_rows=attendance_number,occurrence_count=occurrences,matched_students=matched,merged_duplicates=merged,quality_summary=jsonb_build_object('eventRows',row_number,'attendanceRows',attendance_number,'occurrences',occurrences,'matchedAttendanceRows',matched,'mergedDuplicates',merged,'conflictingDuplicates',conflicts,'ignoredMetadata',true),completed_at=now(),updated_at=now() where id=package.id;
  update public.oaca_event_import_jobs set status='completed',attempts=attempts+1,locked_until=null where oaca_event_import_jobs.package_id=package.id;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(package.organization_id,package.reviewed_by,'oaca_event_import_completed','oaca_event_import_package',package.id,jsonb_build_object('eventRows',row_number,'attendanceRows',attendance_number,'occurrences',occurrences,'matchedAttendanceRows',matched,'mergedDuplicates',merged,'conflictingDuplicates',conflicts),'oaca');
  return jsonb_build_object('packageId',package.id,'eventRows',row_number,'attendanceRows',attendance_number,'occurrences',occurrences,'matchedAttendanceRows',matched,'mergedDuplicates',merged,'conflictingDuplicates',conflicts);
end $$;

create function public.oaca_create_notification(target_user uuid,target_event uuid,category_key text,title_text text,body_text text,template text,version_number integer,idempotency text) returns public.platform_notifications language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.platform_notifications;
begin
  insert into public.platform_notifications(experience_key,user_id,event_id,category,title,body,deep_link,template_key,template_version,idempotency_key) values('oaca',target_user,target_event,left(category_key,80),left(title_text,240),left(body_text,1000),'/app/oaca?event='||target_event,template,version_number,idempotency) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning * into saved;
  return saved;
end $$;

create function public.platform_quiet_hours_release(target_user uuid) returns timestamptz language plpgsql stable security definer set search_path=public,pg_temp as $$
declare pref public.platform_notification_preferences; local_now timestamp; local_time time; release timestamp;
begin
  select * into pref from public.platform_notification_preferences where user_id=target_user;
  if not found or pref.quiet_hours_start is null or pref.quiet_hours_end is null then return now(); end if;
  local_now:=now() at time zone pref.timezone; local_time:=local_now::time;
  if pref.quiet_hours_start<pref.quiet_hours_end and local_time>=pref.quiet_hours_start and local_time<pref.quiet_hours_end then release:=local_now::date+pref.quiet_hours_end;
  elsif pref.quiet_hours_start>pref.quiet_hours_end and (local_time>=pref.quiet_hours_start or local_time<pref.quiet_hours_end) then release:=case when local_time>=pref.quiet_hours_start then local_now::date+1 else local_now::date end+pref.quiet_hours_end;
  else return now(); end if;
  return release at time zone pref.timezone;
end $$;

create function public.oaca_send_event_notification(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare event_record public.oaca_events; target record; prefs public.platform_notification_preferences; notice public.platform_notifications; category_key text:=coalesce(nullif(payload->>'type',''),'announcement'); channels text[]:=array(select value from jsonb_array_elements_text(coalesce(payload->'channels','["in_app"]'::jsonb))); title_text text; body_text text; generation text:=coalesce(payload->>'generation','1'); recipient_count integer:=0; release_at timestamptz; has_email boolean; has_push boolean;
begin
  select * into event_record from public.oaca_events where id=(payload->>'eventId')::uuid;
  if not found or not public.oaca_can_manage_event(event_record.id) then raise exception 'Only assigned event staff can notify this roster' using errcode='42501'; end if;
  if category_key not in ('publication','registration_confirmation','waitlist_confirmation','waitlist_promotion','reminder','event_change','cancellation','checkin_open','correction_outcome','follow_up','announcement') or not (channels@>array['in_app']::text[]) or not (channels<@array['in_app','email','push','sms']::text[]) then raise exception 'Choose valid notification channels' using errcode='23514'; end if;
  title_text:=coalesce(nullif(left(payload->>'title',240),''),event_record.title); body_text:=left(coalesce(payload->>'body','Open Compass for event details.'),1000);
  for target in select r.student_id from public.oaca_event_registrations r where r.event_id=event_record.id and r.status<>'cancelled' union select m.user_id from public.experience_role_assignments m where coalesce(payload->>'audience','registered')='all_active' and m.experience_key='oaca' and m.organization_id=event_record.organization_id and m.role='student' and m.revoked_at is null loop
    recipient_count:=recipient_count+1;
    notice:=public.oaca_create_notification(target.student_id,event_record.id,category_key,title_text,body_text,'oaca_event_'||category_key,1,'event:'||event_record.id||':'||category_key||':'||generation||':user:'||target.student_id);
    select * into prefs from public.platform_notification_preferences where user_id=target.student_id; release_at:=public.platform_quiet_hours_release(target.student_id);
    select exists(select 1 from public.account_auth_identities i where i.canonical_user_id=target.student_id) into has_email;
    select exists(select 1 from public.platform_push_subscriptions s where s.user_id=target.student_id and s.permission_status='granted' and s.revoked_at is null) into has_push;
    if 'email'=any(channels) then insert into public.platform_notification_deliveries(notification_id,channel,status,suppression_reason,available_at,idempotency_key) values(notice.id,'email',case when coalesce(prefs.email_enabled,true) and has_email then 'queued' else 'suppressed' end,case when not has_email then 'missing_verified_destination' when not coalesce(prefs.email_enabled,true) then 'preference_disabled' end,release_at,'notification:'||notice.id||':email') on conflict do nothing; end if;
    if 'push'=any(channels) then insert into public.platform_notification_deliveries(notification_id,channel,status,suppression_reason,available_at,idempotency_key) values(notice.id,'push',case when has_push then 'queued' else 'suppressed' end,case when not has_push then 'no_active_device' end,release_at,'notification:'||notice.id||':push') on conflict do nothing; end if;
    if 'sms'=any(channels) then insert into public.platform_notification_deliveries(notification_id,channel,status,suppression_reason,available_at,idempotency_key) values(notice.id,'sms',case when prefs.sms_enabled and prefs.phone_verified_at is not null and prefs.sms_opted_out_at is null then 'queued' else 'suppressed' end,case when prefs.phone_verified_at is null then 'missing_verified_destination' when prefs.sms_opted_out_at is not null then 'opted_out' else 'preference_disabled' end,release_at,'notification:'||notice.id||':sms') on conflict do nothing; end if;
  end loop;
  return jsonb_build_object('recipientCount',recipient_count,'inPlatformCreated',recipient_count,'externalDeliveryConfiguration','provider_credentials_required');
end $$;

create function public.oaca_save_event_notification_rule(payload jsonb) returns public.oaca_event_notification_rules language plpgsql security definer set search_path=public,pg_temp as $$
declare event_record public.oaca_events; saved public.oaca_event_notification_rules; type_key text:=payload->>'type'; offset_value integer:=nullif(payload->>'offsetMinutes','')::integer; channels_value text[]:=array(select value from jsonb_array_elements_text(coalesce(payload->'channels','["in_app"]')));
begin
  select * into event_record from public.oaca_events where id=(payload->>'eventId')::uuid;
  if not found or not public.oaca_can_manage_event(event_record.id) or not channels_value@>array['in_app']::text[] then raise exception 'This notification rule is outside your scope' using errcode='42501'; end if;
  insert into public.oaca_event_notification_rules(event_id,notification_type,offset_minutes,channels,enabled,scheduled_for,created_by) values(event_record.id,type_key,offset_value,channels_value,coalesce((payload->>'enabled')::boolean,true),case when type_key='reminder' then event_record.starts_at-make_interval(mins=>offset_value) else null end,public.current_profile_user_id()) on conflict(event_id,notification_type,offset_minutes) do update set channels=excluded.channels,enabled=excluded.enabled,scheduled_for=excluded.scheduled_for,generation=oaca_event_notification_rules.generation+1,updated_at=now() returning * into saved;
  return saved;
end $$;

create or replace function public.oaca_publish_event(payload jsonb) returns public.oaca_events language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.oaca_events;
begin
  select * into saved from public.oaca_events where id=(payload->>'eventId')::uuid for update;
  if not found or not public.oaca_can_manage_event(saved.id) then raise exception 'This event is outside your authorized scope' using errcode='42501'; end if;
  if saved.status not in ('draft','scheduled') or saved.starts_at<=now() then raise exception 'Only a future draft or scheduled event can be published' using errcode='23514'; end if;
  update public.oaca_events set status='published',published_at=now(),updated_at=now() where id=saved.id returning * into saved;
  perform public.oaca_send_event_notification(jsonb_build_object('eventId',saved.id,'type','publication','title',saved.title,'body','A new OACA event is available. Open Compass for details and registration.','channels',jsonb_build_array('in_app','email'),'audience','all_active','generation','publication'));
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(saved.organization_id,public.current_profile_user_id(),'oaca_event_published','oaca_event',saved.id,'{}','oaca');
  return saved;
end $$;

create function public.oaca_cancel_event(payload jsonb) returns public.oaca_events language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.oaca_events;
begin
  select * into saved from public.oaca_events where id=(payload->>'eventId')::uuid for update;
  if not found or not public.oaca_can_manage_event(saved.id) or saved.status in ('cancelled','archived','completed') then raise exception 'This event cannot be cancelled' using errcode='42501'; end if;
  update public.oaca_events set status='cancelled',updated_at=now() where id=saved.id returning * into saved;
  update public.oaca_event_checkin_sessions set closed_at=now(),closed_by=public.current_profile_user_id() where event_id=saved.id and closed_at is null;
  update public.platform_notification_deliveries d set status='cancelled',updated_at=now() from public.platform_notifications n where d.notification_id=n.id and n.event_id=saved.id and d.status='queued';
  perform public.oaca_send_event_notification(jsonb_build_object('eventId',saved.id,'type','cancellation','title','Event cancelled: '||saved.title,'body','This event has been cancelled. Open Compass for the current record.','channels',coalesce(payload->'channels',jsonb_build_array('in_app','email')),'audience','registered','generation','cancelled'));
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(saved.organization_id,public.current_profile_user_id(),'oaca_event_cancelled','oaca_event',saved.id,'{}','oaca');
  return saved;
end $$;

create function public.oaca_enqueue_due_event_notifications() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rule_record record; target record; prefs public.platform_notification_preferences; notice public.platform_notifications; release_at timestamptz; queued integer:=0; has_email boolean; has_push boolean;
begin
  for rule_record in select r.*,e.title event_title,e.starts_at,e.location from public.oaca_event_notification_rules r join public.oaca_events e on e.id=r.event_id where r.enabled and r.scheduled_for<=now() and r.enqueued_generation<r.generation and e.status='published' for update of r skip locked loop
    for target in select student_id from public.oaca_event_registrations where event_id=rule_record.event_id and status<>'cancelled' loop
      notice:=public.oaca_create_notification(target.student_id,rule_record.event_id,rule_record.notification_type,rule_record.event_title,case when rule_record.notification_type='reminder' then 'Your event is coming up. Open Compass for current time and location.' else 'Open Compass for current event details.' end,'oaca_event_'||rule_record.notification_type,1,'event-rule:'||rule_record.id||':generation:'||rule_record.generation||':user:'||target.student_id);
      select * into prefs from public.platform_notification_preferences where user_id=target.student_id; release_at:=public.platform_quiet_hours_release(target.student_id);
      select exists(select 1 from public.account_auth_identities i where i.canonical_user_id=target.student_id) into has_email;
      select exists(select 1 from public.platform_push_subscriptions s where s.user_id=target.student_id and s.permission_status='granted' and s.revoked_at is null) into has_push;
      if 'email'=any(rule_record.channels) then insert into public.platform_notification_deliveries(notification_id,channel,status,suppression_reason,available_at,idempotency_key) values(notice.id,'email',case when coalesce(prefs.email_enabled,true) and has_email then 'queued' else 'suppressed' end,case when not has_email then 'missing_verified_destination' when not coalesce(prefs.email_enabled,true) then 'preference_disabled' end,release_at,'notification:'||notice.id||':email') on conflict do nothing; end if;
      if 'push'=any(rule_record.channels) then insert into public.platform_notification_deliveries(notification_id,channel,status,suppression_reason,available_at,idempotency_key) values(notice.id,'push',case when has_push then 'queued' else 'suppressed' end,case when not has_push then 'no_active_device' end,release_at,'notification:'||notice.id||':push') on conflict do nothing; end if;
      if 'sms'=any(rule_record.channels) then insert into public.platform_notification_deliveries(notification_id,channel,status,suppression_reason,available_at,idempotency_key) values(notice.id,'sms',case when prefs.sms_enabled and prefs.phone_verified_at is not null and prefs.sms_opted_out_at is null then 'queued' else 'suppressed' end,case when prefs.phone_verified_at is null then 'missing_verified_destination' when prefs.sms_opted_out_at is not null then 'opted_out' else 'preference_disabled' end,release_at,'notification:'||notice.id||':sms') on conflict do nothing; end if;
      queued:=queued+1;
    end loop;
    update public.oaca_event_notification_rules set enqueued_generation=generation,updated_at=now() where id=rule_record.id;
  end loop;
  return jsonb_build_object('notificationsCreated',queued);
end $$;

create function public.platform_update_notification(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare action text:=payload->>'action'; notice_id uuid:=(payload->>'notificationId')::uuid;
begin
  if action not in ('read','dismiss') then raise exception 'Choose read or dismiss' using errcode='22023'; end if;
  update public.platform_notifications set read_at=case when action='read' then coalesce(read_at,now()) else read_at end,dismissed_at=case when action='dismiss' then now() else dismissed_at end where id=notice_id and user_id=public.current_profile_user_id();
  if not found then raise exception 'Notification not found' using errcode='42501'; end if;
  return '{"ok":true}'::jsonb;
end $$;

create function public.platform_save_push_subscription(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare endpoint text:=payload->>'endpoint'; provider_key text:=coalesce(nullif(payload->>'provider',''),'web_push'); saved public.platform_push_subscriptions;
begin
  if provider_key not in ('web_push','apns','fcm') or endpoint not like 'https://%' or length(payload::text)>12000 then raise exception 'Invalid push subscription' using errcode='23514'; end if;
  insert into public.platform_push_subscriptions(user_id,provider,endpoint_hash,encrypted_subscription,device_label) values(public.current_profile_user_id(),provider_key,encode(digest(endpoint,'sha256'),'hex'),payload::text,nullif(left(coalesce(payload->>'deviceLabel',''),120),'')) on conflict(user_id,provider,endpoint_hash) do update set encrypted_subscription=excluded.encrypted_subscription,device_label=excluded.device_label,permission_status='granted',revoked_at=null returning * into saved;
  return jsonb_build_object('id',saved.id,'provider',saved.provider,'permissionStatus',saved.permission_status);
end $$;

create function public.platform_remove_push_subscription(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin update public.platform_push_subscriptions set permission_status='revoked',revoked_at=now() where id=(payload->>'subscriptionId')::uuid and user_id=public.current_profile_user_id(); if not found then raise exception 'Device subscription not found' using errcode='42501'; end if; return '{"ok":true}'::jsonb; end $$;

create function public.platform_save_notification_preferences(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.platform_notification_preferences; requested_sms boolean:=coalesce((payload->>'smsEnabled')::boolean,false); zone text:=coalesce(nullif(payload->>'timezone',''),'America/Los_Angeles');
begin
  if zone not in (select name from pg_timezone_names) then raise exception 'Choose a valid timezone' using errcode='23514'; end if;
  insert into public.platform_notification_preferences(user_id,email_enabled,sms_enabled,quiet_hours_start,quiet_hours_end,timezone)
  values(public.current_profile_user_id(),coalesce((payload->>'emailEnabled')::boolean,true),false,nullif(payload->>'quietHoursStart','')::time,nullif(payload->>'quietHoursEnd','')::time,zone)
  on conflict(user_id) do update set email_enabled=excluded.email_enabled,sms_enabled=case when requested_sms and platform_notification_preferences.phone_verified_at is not null and platform_notification_preferences.sms_opted_out_at is null then true else false end,quiet_hours_start=excluded.quiet_hours_start,quiet_hours_end=excluded.quiet_hours_end,timezone=excluded.timezone,updated_at=now() returning * into saved;
  return jsonb_build_object('emailEnabled',saved.email_enabled,'smsEnabled',saved.sms_enabled,'phoneVerified',saved.phone_verified_at is not null,'quietHoursStart',saved.quiet_hours_start,'quietHoursEnd',saved.quiet_hours_end,'timezone',saved.timezone);
end $$;

create function public.oaca_send_event_message(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target_event uuid:=(payload->>'eventId')::uuid; student uuid:=nullif(payload->>'studentId','')::uuid; actor uuid:=public.current_profile_user_id(); thread public.oaca_threads; message public.oaca_messages; org uuid; channel_key text:=coalesce(nullif(payload->>'channel',''),'in_app'); notice public.platform_notifications;
begin
  select organization_id into org from public.oaca_events where id=target_event;
  if student is null then student:=actor; end if;
  if actor<>student and not public.oaca_can_manage_event(target_event) then raise exception 'Only assigned event staff can message this student' using errcode='42501'; end if;
  if actor=student and not exists(select 1 from public.oaca_event_registrations r where r.event_id=target_event and r.student_id=actor and r.status<>'cancelled') then raise exception 'Register for this event before starting a conversation' using errcode='42501'; end if;
  select t.* into thread from public.oaca_threads t where t.event_id=target_event and t.student_id=student and t.kind='event_inbox' limit 1;
  if not found then
    insert into public.oaca_threads(organization_id,kind,event_id,student_id) values(org,'event_inbox',target_event,student) returning * into thread;
    insert into public.oaca_thread_participants(thread_id,user_id,participant_role) values(thread.id,student,'student'),(thread.id,actor,case when actor=student then 'student' else 'event_staff' end) on conflict do nothing;
    insert into public.oaca_thread_participants(thread_id,user_id,participant_role) select thread.id,h.user_id,'event_staff' from public.oaca_event_hosts h where h.event_id=target_event on conflict do nothing;
  end if;
  if actor<>student then insert into public.oaca_thread_participants(thread_id,user_id,participant_role) values(thread.id,actor,'event_staff') on conflict do nothing; end if;
  insert into public.oaca_messages(thread_id,sender_id,body,direction,channel) values(thread.id,actor,left(trim(payload->>'body'),5000),case when channel_key='sms' then 'outbound' else 'portal' end,channel_key) returning * into message;
  if actor<>student then notice:=public.oaca_create_notification(student,target_event,'event_message','New event message','Open Compass to read and reply.','oaca_event_message',1,'message:'||message.id); end if;
  if channel_key='sms' and actor<>student then insert into public.platform_notification_deliveries(notification_id,channel,status,suppression_reason,available_at,idempotency_key) values(notice.id,'sms',case when exists(select 1 from public.platform_notification_preferences p where p.user_id=student and p.sms_enabled and p.phone_verified_at is not null and p.sms_opted_out_at is null) then 'queued' else 'suppressed' end,case when not exists(select 1 from public.platform_notification_preferences p where p.user_id=student and p.sms_enabled and p.phone_verified_at is not null and p.sms_opted_out_at is null) then 'sms_unavailable' end,public.platform_quiet_hours_release(student),'message:'||message.id||':sms'); end if;
  return jsonb_build_object('threadId',thread.id,'messageId',message.id,'channel',channel_key);
end $$;

-- Called only by the signature-validating provider adapter in the Worker.
create function public.oaca_receive_event_sms(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare phone text:=regexp_replace(coalesce(payload->>'from',''),'[^0-9+]','','g'); phone_hash text; provider_id text:=left(payload->>'providerMessageId',240); body_text text:=left(trim(coalesce(payload->>'body','')),5000); keyword text:=upper(body_text); student uuid; target_event uuid:=nullif(payload->>'eventId','')::uuid; org uuid; thread public.oaca_threads; saved_message public.oaca_messages; help_notice public.platform_notifications;
begin
  if phone='' or provider_id='' then raise exception 'Verified sender and provider message ID are required'; end if;
  phone_hash:=encode(digest(phone,'sha256'),'hex');
  insert into public.oaca_sms_inbound_receipts(provider_message_id,phone_hash) values(provider_id,phone_hash) on conflict do nothing;
  if not found then return '{"duplicate":true}'::jsonb; end if;
  select p.user_id into student from public.platform_notification_preferences p where regexp_replace(coalesce(p.verified_phone,''),'[^0-9+]','','g')=phone and p.phone_verified_at is not null limit 1;
  if student is null or target_event is null or not exists(select 1 from public.oaca_event_registrations r where r.event_id=target_event and r.student_id=student) then
    insert into public.oaca_sms_reconciliation_queue(phone_hash,provider_message_id,metadata) values(phone_hash,provider_id,jsonb_build_object('eventId',target_event,'reason',case when student is null then 'unknown_or_unverified_phone' else 'event_not_resolved' end));
    return '{"restricted":true}'::jsonb;
  end if;
  if keyword in ('STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT') then
    update public.platform_notification_preferences set sms_enabled=false,sms_opted_out_at=now(),updated_at=now() where user_id=student;
    help_notice:=public.oaca_create_notification(student,target_event,'event_message','SMS notifications disabled','SMS is off. Reply START to enable it again.','oaca_sms_stop',1,'sms-stop:'||provider_id);
    insert into public.platform_notification_deliveries(notification_id,channel,status,available_at,idempotency_key) values(help_notice.id,'sms','queued',public.platform_quiet_hours_release(student),'sms-stop:'||provider_id);
    return '{"keyword":"STOP","smsEnabled":false}'::jsonb;
  end if;
  if keyword in ('START','UNSTOP') then
    update public.platform_notification_preferences set sms_enabled=true,sms_opted_out_at=null,updated_at=now() where user_id=student;
    help_notice:=public.oaca_create_notification(student,target_event,'event_message','SMS notifications enabled','SMS is on. Reply STOP to opt out or HELP for support.','oaca_sms_start',1,'sms-start:'||provider_id);
    insert into public.platform_notification_deliveries(notification_id,channel,status,available_at,idempotency_key) values(help_notice.id,'sms','queued',public.platform_quiet_hours_release(student),'sms-start:'||provider_id);
    return '{"keyword":"START","smsEnabled":true}'::jsonb;
  end if;
  select organization_id into org from public.oaca_events where id=target_event;
  if keyword='HELP' then
    help_notice:=public.oaca_create_notification(student,target_event,'event_message','Compass SMS help','Reply STOP to opt out. For support, open Compass or contact OACA.','oaca_sms_help',1,'sms-help:'||provider_id);
    insert into public.platform_notification_deliveries(notification_id,channel,status,available_at,idempotency_key) values(help_notice.id,'sms','queued',public.platform_quiet_hours_release(student),'sms-help:'||provider_id);
    return '{"keyword":"HELP","queued":true}'::jsonb;
  end if;
  select * into thread from public.oaca_threads where event_id=target_event and student_id=student and kind='event_inbox' limit 1;
  if not found then
    insert into public.oaca_threads(organization_id,kind,event_id,student_id) values(org,'event_inbox',target_event,student) returning * into thread;
    insert into public.oaca_thread_participants(thread_id,user_id,participant_role) values(thread.id,student,'student');
    insert into public.oaca_thread_participants(thread_id,user_id,participant_role) select thread.id,h.user_id,'event_staff' from public.oaca_event_hosts h where h.event_id=target_event on conflict do nothing;
  end if;
  insert into public.oaca_messages(thread_id,sender_id,body,direction,channel,provider_message_id) values(thread.id,student,body_text,'inbound','sms',provider_id) returning * into saved_message;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,student,'oaca_event_sms_received','oaca_thread',thread.id,jsonb_build_object('eventId',target_event,'providerMessageIdHash',encode(digest(provider_id,'sha256'),'hex')),'oaca');
  return jsonb_build_object('threadId',thread.id,'messageId',saved_message.id,'accepted',true);
end $$;

create function public.platform_record_notification_delivery_event(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare delivery public.platform_notification_deliveries; state text:=payload->>'status'; event_key text:=left(payload->>'providerEventId',240); message_key text:=left(payload->>'providerMessageId',240);
begin
  if state not in ('sent','delivered','failed','opened','clicked','replied') or event_key='' or message_key='' then raise exception 'Invalid delivery event'; end if;
  select * into delivery from public.platform_notification_deliveries where provider_message_id=message_key for update;
  if not found then raise exception 'Delivery message was not found'; end if;
  insert into public.platform_notification_delivery_events(delivery_id,provider_event_id,provider_message_id,status,occurred_at,metadata) values(delivery.id,event_key,message_key,state,coalesce(nullif(payload->>'occurredAt','')::timestamptz,now()),jsonb_build_object('provider',left(coalesce(payload->>'provider','unknown'),40))) on conflict(provider_event_id) do nothing;
  if found then update public.platform_notification_deliveries set status=state,updated_at=now(),last_error_code=case when state='failed' then left(coalesce(payload->>'errorCode','provider_failed'),120) else last_error_code end where id=delivery.id; end if;
  return '{"ok":true}'::jsonb;
end $$;

create function public.oaca_initialize_event_operations() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.oaca_event_hosts(event_id,user_id,host_role,assigned_by) values(new.id,new.created_by,'owner',new.created_by) on conflict do nothing;
  insert into public.oaca_event_notification_rules(event_id,notification_type,offset_minutes,channels,enabled,scheduled_for,created_by) values
    (new.id,'reminder',1440,array['in_app','email'],true,new.starts_at-interval '24 hours',new.created_by),
    (new.id,'reminder',60,array['in_app','email'],true,new.starts_at-interval '1 hour',new.created_by)
  on conflict do nothing;
  return new;
end $$;
create trigger oaca_event_initialize_operations after insert on public.oaca_events for each row execute function public.oaca_initialize_event_operations();
insert into public.oaca_event_hosts(event_id,user_id,host_role,assigned_by)
select id,created_by,'owner',created_by from public.oaca_events on conflict do nothing;
insert into public.oaca_event_notification_rules(event_id,notification_type,offset_minutes,channels,enabled,scheduled_for,created_by)
select id,'reminder',1440,array['in_app','email'],true,starts_at-interval '24 hours',created_by from public.oaca_events
union all
select id,'reminder',60,array['in_app','email'],true,starts_at-interval '1 hour',created_by from public.oaca_events
on conflict do nothing;

create function public.oaca_queue_event_calendar_sync() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare version_key text;
begin
  if new.status not in ('published','cancelled') then return new; end if;
  version_key:=encode(digest(new.id::text||':'||new.status||':'||new.starts_at::text||':'||coalesce(new.ends_at::text,'')||':'||coalesce(new.location,'')||':'||new.updated_at::text,'sha256'),'hex');
  insert into public.oaca_event_calendar_jobs(event_id,operation,portal_version,idempotency_key) values(new.id,case when new.status='cancelled' then 'cancel' else 'upsert' end,version_key,'event-calendar:'||new.id||':'||version_key) on conflict(idempotency_key) do nothing;
  return new;
end $$;
create trigger oaca_event_calendar_sync after insert or update of status,starts_at,ends_at,location,modality on public.oaca_events for each row execute function public.oaca_queue_event_calendar_sync();

create function public.oaca_notify_event_registration() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare event_record public.oaca_events; category_key text; notice public.platform_notifications; prefs public.platform_notification_preferences; has_email boolean;
begin
  if new.status not in ('registered','waitlisted') then return new; end if;
  if tg_op='UPDATE' then if old.status=new.status then return new; end if; end if;
  select * into event_record from public.oaca_events where id=new.event_id;
  if tg_op='UPDATE' and old.status='waitlisted' and new.status='registered' then category_key:='waitlist_promotion'; elsif new.status='waitlisted' then category_key:='waitlist_confirmation'; else category_key:='registration_confirmation'; end if;
  notice:=public.oaca_create_notification(new.student_id,new.event_id,category_key,event_record.title,case category_key when 'waitlist_promotion' then 'A space opened and you are registered.' when 'waitlist_confirmation' then 'You are on the waitlist.' else 'Your event registration is confirmed.' end,'oaca_event_'||category_key,1,'registration:'||new.event_id||':'||new.student_id||':'||category_key||':'||new.registered_at::text);
  select * into prefs from public.platform_notification_preferences where user_id=new.student_id;
  select exists(select 1 from public.account_auth_identities i where i.canonical_user_id=new.student_id) into has_email;
  insert into public.platform_notification_deliveries(notification_id,channel,status,suppression_reason,available_at,idempotency_key) values(notice.id,'email',case when coalesce(prefs.email_enabled,true) and has_email then 'queued' else 'suppressed' end,case when not has_email then 'missing_verified_destination' when not coalesce(prefs.email_enabled,true) then 'preference_disabled' end,public.platform_quiet_hours_release(new.student_id),'notification:'||notice.id||':email') on conflict do nothing;
  return new;
end $$;
create trigger oaca_event_registration_notification after insert or update of status on public.oaca_event_registrations for each row execute function public.oaca_notify_event_registration();

create function public.prevent_event_audit_mutation() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin raise exception 'Event audit history is immutable'; end $$;
create trigger oaca_event_attendance_changes_immutable before update or delete on public.oaca_event_attendance_changes for each row execute function public.prevent_event_audit_mutation();
create trigger platform_notification_delivery_events_immutable before update or delete on public.platform_notification_delivery_events for each row execute function public.prevent_event_audit_mutation();
create trigger oaca_sms_inbound_receipts_immutable before update or delete on public.oaca_sms_inbound_receipts for each row execute function public.prevent_event_audit_mutation();

alter table public.oaca_event_series enable row level security;
alter table public.oaca_event_hosts enable row level security;
alter table public.oaca_event_attendance_changes enable row level security;
alter table public.oaca_event_checkin_sessions enable row level security;
alter table public.oaca_student_qr_tokens enable row level security;
alter table public.oaca_attendance_correction_requests enable row level security;
alter table public.oaca_event_import_packages enable row level security;
alter table public.oaca_event_import_issues enable row level security;
alter table public.oaca_event_import_jobs enable row level security;
alter table public.oaca_event_source_links enable row level security;
alter table public.oaca_event_identity_links enable row level security;
alter table public.platform_notifications enable row level security;
alter table public.oaca_event_notification_rules enable row level security;
alter table public.platform_push_subscriptions enable row level security;
alter table public.platform_notification_deliveries enable row level security;
alter table public.platform_notification_delivery_events enable row level security;
alter table public.oaca_event_calendar_links enable row level security;
alter table public.oaca_event_calendar_jobs enable row level security;
alter table public.oaca_sms_reconciliation_queue enable row level security;
alter table public.oaca_sms_inbound_receipts enable row level security;

create policy platform_notifications_self on public.platform_notifications for select to authenticated using(user_id=public.current_profile_user_id());
create policy platform_push_subscriptions_self on public.platform_push_subscriptions for select to authenticated using(user_id=public.current_profile_user_id());
create policy oaca_event_corrections_self on public.oaca_attendance_correction_requests for select to authenticated using(student_id=public.current_profile_user_id() or public.oaca_can_manage_event(event_id));
create policy oaca_event_hosts_assigned on public.oaca_event_hosts for select to authenticated using(user_id=public.current_profile_user_id() or public.oaca_can_manage_event(event_id));
drop policy if exists oaca_event_registrations_scoped on public.oaca_event_registrations;
create policy oaca_event_registrations_scoped on public.oaca_event_registrations for select to authenticated using(student_id=public.current_profile_user_id() or public.oaca_can_manage_event(event_id));

revoke all on public.oaca_event_series,public.oaca_event_hosts,public.oaca_event_attendance_changes,public.oaca_event_checkin_sessions,public.oaca_student_qr_tokens,public.oaca_attendance_correction_requests,public.oaca_event_import_packages,public.oaca_event_import_issues,public.oaca_event_import_jobs,public.oaca_event_source_links,public.oaca_event_identity_links,public.platform_notifications,public.oaca_event_notification_rules,public.platform_push_subscriptions,public.platform_notification_deliveries,public.platform_notification_delivery_events,public.oaca_event_calendar_links,public.oaca_event_calendar_jobs,public.oaca_sms_reconciliation_queue,public.oaca_sms_inbound_receipts from anon,authenticated;
grant select on public.platform_notifications,public.platform_push_subscriptions,public.oaca_attendance_correction_requests,public.oaca_event_hosts to authenticated;
grant all on public.oaca_event_series,public.oaca_event_hosts,public.oaca_event_attendance_changes,public.oaca_event_checkin_sessions,public.oaca_student_qr_tokens,public.oaca_attendance_correction_requests,public.oaca_event_import_packages,public.oaca_event_import_issues,public.oaca_event_import_jobs,public.oaca_event_source_links,public.oaca_event_identity_links,public.platform_notifications,public.oaca_event_notification_rules,public.platform_push_subscriptions,public.platform_notification_deliveries,public.platform_notification_delivery_events,public.oaca_event_calendar_links,public.oaca_event_calendar_jobs,public.oaca_sms_reconciliation_queue,public.oaca_sms_inbound_receipts to service_role;

revoke all on function public.oaca_can_manage_event(uuid),public.oaca_event_workspace(jsonb),public.oaca_update_event(jsonb),public.oaca_assign_event_host(jsonb),public.oaca_update_event_attendance(jsonb),public.oaca_set_event_checkin(jsonb),public.oaca_self_checkin(jsonb),public.oaca_issue_student_qr(jsonb),public.oaca_scan_student_qr(jsonb),public.oaca_request_attendance_correction(jsonb),public.oaca_resolve_attendance_correction(jsonb),public.oaca_create_event_import_package(jsonb),public.oaca_review_event_import_package(jsonb),public.oaca_create_notification(uuid,uuid,text,text,text,text,integer,text),public.platform_quiet_hours_release(uuid),public.oaca_send_event_notification(jsonb),public.oaca_save_event_notification_rule(jsonb),public.platform_update_notification(jsonb),public.platform_save_push_subscription(jsonb),public.platform_remove_push_subscription(jsonb),public.platform_save_notification_preferences(jsonb),public.oaca_send_event_message(jsonb) from public,anon;
grant execute on function public.oaca_can_manage_event(uuid),public.oaca_event_workspace(jsonb),public.oaca_update_event(jsonb),public.oaca_assign_event_host(jsonb),public.oaca_update_event_attendance(jsonb),public.oaca_set_event_checkin(jsonb),public.oaca_self_checkin(jsonb),public.oaca_issue_student_qr(jsonb),public.oaca_scan_student_qr(jsonb),public.oaca_request_attendance_correction(jsonb),public.oaca_resolve_attendance_correction(jsonb),public.oaca_create_event_import_package(jsonb),public.oaca_review_event_import_package(jsonb),public.oaca_send_event_notification(jsonb),public.oaca_save_event_notification_rule(jsonb),public.platform_update_notification(jsonb),public.platform_save_push_subscription(jsonb),public.platform_remove_push_subscription(jsonb),public.platform_save_notification_preferences(jsonb),public.oaca_send_event_message(jsonb) to authenticated;
revoke all on function public.oaca_cancel_event(jsonb) from public,anon;
grant execute on function public.oaca_cancel_event(jsonb) to authenticated;
revoke all on function public.oaca_process_event_import_package(uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.oaca_process_event_import_package(uuid,jsonb,jsonb,text) to service_role;
revoke all on function public.oaca_enqueue_due_event_notifications() from public,anon,authenticated;
grant execute on function public.oaca_enqueue_due_event_notifications() to service_role;
revoke all on function public.oaca_receive_event_sms(jsonb) from public,anon,authenticated;
grant execute on function public.oaca_receive_event_sms(jsonb) to service_role;
revoke all on function public.platform_record_notification_delivery_event(jsonb) from public,anon,authenticated;
grant execute on function public.platform_record_notification_delivery_event(jsonb) to service_role;

commit;
