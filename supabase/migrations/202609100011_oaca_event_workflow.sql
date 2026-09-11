begin;

alter table public.oaca_events add column if not exists publication_error text;

create table public.oaca_event_audience_versions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.oaca_events(id) on delete cascade,
  version integer not null check(version>0),
  audience_spec jsonb not null check(jsonb_typeof(audience_spec)='object'),
  recipient_count integer not null default 0 check(recipient_count>=0),
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  unique(event_id,version)
);

create table public.oaca_event_audience_recipients (
  audience_version_id uuid not null references public.oaca_event_audience_versions(id) on delete restrict,
  event_id uuid not null references public.oaca_events(id) on delete restrict,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(audience_version_id,user_id)
);
create index oaca_event_audience_recipients_event_user_idx on public.oaca_event_audience_recipients(event_id,user_id);

create table public.oaca_event_coordinator_alert_rules (
  event_id uuid not null references public.oaca_events(id) on delete cascade,
  activity_type text not null check(activity_type in ('rsvp','waitlist','event_message','checkin','correction','delivery_failure','event_change')),
  delivery_mode text not null default 'immediate' check(delivery_mode in ('immediate','hourly','off')),
  channels text[] not null default array['in_app']::text[] check(channels<@array['in_app','email','push','sms']::text[] and channels@>array['in_app']::text[]),
  configured_by uuid not null references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  primary key(event_id,activity_type)
);

create table public.oaca_event_activity (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.oaca_events(id) on delete restrict,
  activity_type text not null check(activity_type in ('rsvp','waitlist','event_message','checkin','correction','delivery_failure','event_change')),
  actor_id uuid references public.profiles(user_id),
  subject_user_id uuid references public.profiles(user_id),
  summary text not null check(length(summary) between 1 and 500),
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index oaca_event_activity_event_created_idx on public.oaca_event_activity(event_id,created_at desc);

create table public.oaca_event_coordinator_digest_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.oaca_events(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  activity_type text not null check(activity_type in ('rsvp','waitlist','event_message','checkin','correction','delivery_failure','event_change')),
  bucket_start timestamptz not null,
  bucket_end timestamptz not null,
  channels text[] not null default array['in_app']::text[] check(channels<@array['in_app','email','push','sms']::text[] and channels@>array['in_app']::text[]),
  status text not null default 'pending' check(status in ('pending','processing','completed','failed')),
  available_at timestamptz not null,
  attempts integer not null default 0 check(attempts between 0 and 20),
  last_error_code text,
  created_at timestamptz not null default now(),
  unique(event_id,user_id,activity_type,bucket_start)
);
create index oaca_event_coordinator_digest_ready_idx on public.oaca_event_coordinator_digest_jobs(status,available_at) where status='pending';

create or replace function public.oaca_audience_is_valid(audience jsonb) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare audience_key text; item text; has_target boolean:=false; id_list text[]:=array['assignedProviderIds','studentIds','organizationIds','userIds','excludeUserIds'];
begin
  if jsonb_typeof(audience)<>'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(audience) key where key<>all(array['includeAllStudents','includeAllMembers','cohortLabels','phases','years','campuses','assignedProviderIds','studentIds','organizationIds','studentCouncil','memberRoles','userIds','excludeUserIds'])) then return false; end if;
  foreach audience_key in array array['includeAllStudents','includeAllMembers','studentCouncil'] loop
    if audience ? audience_key and jsonb_typeof(audience->audience_key)<>'boolean' then return false; end if;
  end loop;
  has_target:=coalesce((audience->>'includeAllStudents')::boolean,false) or coalesce((audience->>'includeAllMembers')::boolean,false) or coalesce((audience->>'studentCouncil')::boolean,false);
  foreach audience_key in array array['cohortLabels','phases','years','campuses','assignedProviderIds','studentIds','organizationIds','memberRoles','userIds','excludeUserIds'] loop
    if audience ? audience_key then
      if jsonb_typeof(audience->audience_key)<>'array' or jsonb_array_length(audience->audience_key)>500 then return false; end if;
      for item in select value from jsonb_array_elements_text(audience->audience_key) loop
        if length(trim(item))<1 then return false; end if;
        if audience_key=any(id_list) and item!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
        if audience_key='memberRoles' and item not in ('student','faculty','staff','administrator') then return false; end if;
      end loop;
      if audience_key<>'excludeUserIds' then has_target:=has_target or jsonb_array_length(audience->audience_key)>0; end if;
    end if;
  end loop;
  return has_target;
end $$;

create or replace function public.oaca_resolve_event_audience(org uuid,audience jsonb) returns table(user_id uuid) language sql stable security definer set search_path=public,pg_temp as $$
  with active_members as (
    select distinct r.user_id
    from public.experience_role_assignments r join public.profiles p on p.user_id=r.user_id
    where r.experience_key='oaca' and r.organization_id=org and r.revoked_at is null and p.status='active'
  ), current_dimensions as (
    select distinct on (d.student_id) d.student_id,d.cohort_label,d.current_phase,d.current_year,d.campus
    from public.oaca_student_dimensions d
    where d.organization_id=org and d.effective_from<=current_date and (d.effective_to is null or d.effective_to>=current_date)
    order by d.student_id,d.effective_from desc
  )
  select m.user_id from active_members m
  where public.oaca_audience_is_valid(audience)
    and not exists(select 1 from jsonb_array_elements_text(coalesce(audience->'excludeUserIds','[]'::jsonb)) x where x::uuid=m.user_id)
    and (
      coalesce((audience->>'includeAllMembers')::boolean,false)
      or (coalesce((audience->>'includeAllStudents')::boolean,false) and exists(select 1 from public.experience_role_assignments r where r.user_id=m.user_id and r.experience_key='oaca' and r.organization_id=org and r.role='student' and r.revoked_at is null))
      or exists(select 1 from jsonb_array_elements_text(coalesce(audience->'memberRoles','[]'::jsonb)) x join public.experience_role_assignments r on r.role=x where r.user_id=m.user_id and r.experience_key='oaca' and r.organization_id=org and r.revoked_at is null)
      or exists(select 1 from jsonb_array_elements_text(coalesce(audience->'userIds','[]'::jsonb)) x where x::uuid=m.user_id)
      or exists(select 1 from jsonb_array_elements_text(coalesce(audience->'studentIds','[]'::jsonb)) x where x::uuid=m.user_id)
      or (
        exists(select 1 from public.experience_role_assignments r where r.user_id=m.user_id and r.experience_key='oaca' and r.organization_id=org and r.role='student' and r.revoked_at is null)
        and (
          exists(select 1 from current_dimensions d join jsonb_array_elements_text(coalesce(audience->'cohortLabels','[]'::jsonb)) x on x=d.cohort_label where d.student_id=m.user_id)
          or exists(select 1 from current_dimensions d join jsonb_array_elements_text(coalesce(audience->'phases','[]'::jsonb)) x on x=d.current_phase where d.student_id=m.user_id)
          or exists(select 1 from current_dimensions d join jsonb_array_elements_text(coalesce(audience->'years','[]'::jsonb)) x on x=d.current_year where d.student_id=m.user_id)
          or exists(select 1 from current_dimensions d join jsonb_array_elements_text(coalesce(audience->'campuses','[]'::jsonb)) x on x=d.campus where d.student_id=m.user_id)
          or exists(select 1 from public.oaca_advisor_assignments a join public.oaca_providers p on p.id=a.provider_id join jsonb_array_elements_text(coalesce(audience->'assignedProviderIds','[]'::jsonb)) x on x::uuid=p.id where a.student_id=m.user_id and p.organization_id=org and a.ended_at is null)
          or exists(select 1 from public.platform_student_affiliations a join jsonb_array_elements_text(coalesce(audience->'organizationIds','[]'::jsonb)) x on x::uuid=a.organization_id where a.student_id=m.user_id and a.affiliation_type='interest_group' and a.ended_at is null)
          or (coalesce((audience->>'studentCouncil')::boolean,false) and exists(select 1 from public.platform_student_affiliations a where a.student_id=m.user_id and a.affiliation_type='student_council' and a.ended_at is null))
        )
      )
    );
$$;

create or replace function public.oaca_student_matches_audience(target uuid,org uuid,audience jsonb) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.oaca_resolve_event_audience(org,audience) r where r.user_id=target);
$$;

create function public.oaca_queue_notification_channels(notice_id uuid,target_user uuid,channels_value text[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare prefs public.platform_notification_preferences; release_at timestamptz; has_email boolean; has_push boolean;
begin
  select * into prefs from public.platform_notification_preferences where user_id=target_user;
  release_at:=public.platform_quiet_hours_release(target_user);
  select exists(select 1 from public.account_auth_identities i where i.canonical_user_id=target_user and i.verified_at is not null) into has_email;
  select exists(select 1 from public.platform_push_subscriptions s where s.user_id=target_user and s.permission_status='granted' and s.revoked_at is null) into has_push;
  if 'email'=any(channels_value) then insert into public.platform_notification_deliveries(notification_id,channel,status,suppression_reason,available_at,idempotency_key) values(notice_id,'email',case when coalesce(prefs.email_enabled,true) and has_email then 'queued' else 'suppressed' end,case when not has_email then 'missing_verified_destination' when not coalesce(prefs.email_enabled,true) then 'preference_disabled' end,release_at,'notification:'||notice_id||':email') on conflict do nothing; end if;
  if 'push'=any(channels_value) then insert into public.platform_notification_deliveries(notification_id,channel,status,suppression_reason,available_at,idempotency_key) values(notice_id,'push',case when has_push then 'queued' else 'suppressed' end,case when not has_push then 'no_active_device' end,release_at,'notification:'||notice_id||':push') on conflict do nothing; end if;
  if 'sms'=any(channels_value) then insert into public.platform_notification_deliveries(notification_id,channel,status,suppression_reason,available_at,idempotency_key) values(notice_id,'sms',case when coalesce(prefs.sms_enabled,false) and prefs.phone_verified_at is not null and prefs.sms_opted_out_at is null then 'queued' else 'suppressed' end,case when prefs.phone_verified_at is null then 'missing_verified_destination' when prefs.sms_opted_out_at is not null then 'opted_out' else 'preference_disabled' end,release_at,'notification:'||notice_id||':sms') on conflict do nothing; end if;
end $$;

create function public.oaca_preview_event_audience(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_active_organization(); target_event uuid:=nullif(payload->>'eventId','')::uuid; audience jsonb:=coalesce(payload->'audience','{}'::jsonb); total integer; excluded integer; additions integer:=0; removals integer:=0; current_version uuid;
begin
  if org is null or not (public.oaca_can_manage_outreach(org) or (target_event is not null and public.oaca_can_manage_event(target_event))) then raise exception 'Event audience access is limited to authorized staff' using errcode='42501'; end if;
  if not public.oaca_audience_is_valid(audience) then raise exception 'Choose at least one valid event audience' using errcode='23514'; end if;
  select count(*)::integer into total from public.oaca_resolve_event_audience(org,audience);
  select count(distinct r.user_id)::integer into excluded from public.experience_role_assignments r join public.profiles p on p.user_id=r.user_id where r.experience_key='oaca' and r.organization_id=org and r.revoked_at is null and p.status='active' and exists(select 1 from jsonb_array_elements_text(coalesce(audience->'excludeUserIds','[]'::jsonb)) x where x::uuid=r.user_id);
  if target_event is not null then
    select id into current_version from public.oaca_event_audience_versions where event_id=target_event order by version desc limit 1;
    select count(*)::integer into additions from public.oaca_resolve_event_audience(org,audience) r where not exists(select 1 from public.oaca_event_audience_recipients old where old.audience_version_id=current_version and old.user_id=r.user_id);
    select count(*)::integer into removals from public.oaca_event_audience_recipients old where old.audience_version_id=current_version and not exists(select 1 from public.oaca_resolve_event_audience(org,audience) r where r.user_id=old.user_id);
  end if;
  return jsonb_build_object('count',total,'excludedCount',excluded,'additions',additions,'removals',removals,'sample',coalesce((select jsonb_agg(jsonb_build_object('userId',s.user_id,'displayName',s.display_name,'role',s.role)) from (select r.user_id,p.display_name,coalesce((select string_agg(distinct a.role,', ' order by a.role) from public.experience_role_assignments a where a.user_id=r.user_id and a.experience_key='oaca' and a.organization_id=org and a.revoked_at is null),'member') role from public.oaca_resolve_event_audience(org,audience) r join public.profiles p on p.user_id=r.user_id order by p.display_name limit 10) s),'[]'::jsonb));
end $$;

create function public.oaca_refresh_event_recipients(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare event_record public.oaca_events; audience jsonb; preview jsonb; latest_id uuid; next_version integer; saved_version public.oaca_event_audience_versions; target record; notice public.platform_notifications; channels_value text[]:=array['in_app','email']; publication_enabled boolean:=true;
begin
  select * into event_record from public.oaca_events where id=(payload->>'eventId')::uuid for update;
  if not found or not public.oaca_can_manage_event(event_record.id) then raise exception 'This event audience is outside your assigned scope' using errcode='42501'; end if;
  audience:=coalesce(payload->'audience',event_record.audience_spec);
  preview:=public.oaca_preview_event_audience(jsonb_build_object('eventId',event_record.id,'audience',audience));
  if not coalesce((payload->>'commit')::boolean,false) then return preview||jsonb_build_object('version',coalesce((select max(version) from public.oaca_event_audience_versions where event_id=event_record.id),0)); end if;
  select id,version into latest_id,next_version from public.oaca_event_audience_versions where event_id=event_record.id order by version desc limit 1;
  next_version:=coalesce(next_version,0)+1;
  insert into public.oaca_event_audience_versions(event_id,version,audience_spec,recipient_count,created_by) values(event_record.id,next_version,audience,(preview->>'count')::integer,public.current_profile_user_id()) returning * into saved_version;
  insert into public.oaca_event_audience_recipients(audience_version_id,event_id,user_id) select saved_version.id,event_record.id,r.user_id from public.oaca_resolve_event_audience(event_record.organization_id,audience) r;
  update public.oaca_events set audience_spec=audience,updated_at=now() where id=event_record.id;
  if event_record.status='published' then
    select r.channels,r.enabled into channels_value,publication_enabled from public.oaca_event_notification_rules r where r.event_id=event_record.id and r.notification_type='publication' and r.offset_minutes is null;
    channels_value:=coalesce(channels_value,array['in_app','email']); publication_enabled:=coalesce(publication_enabled,true);
    if publication_enabled then
      for target in select r.user_id from public.oaca_event_audience_recipients r where r.audience_version_id=saved_version.id and not exists(select 1 from public.oaca_event_audience_recipients old where old.audience_version_id=latest_id and old.user_id=r.user_id) loop
        notice:=public.oaca_create_notification(target.user_id,event_record.id,'publication',event_record.title,'A new Compass event is available. Open Compass for details and registration.','oaca_event_publication',1,'event-refresh:'||event_record.id||':version:'||next_version||':user:'||target.user_id);
        perform public.oaca_queue_notification_channels(notice.id,target.user_id,channels_value);
      end loop;
    end if;
  end if;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(event_record.organization_id,public.current_profile_user_id(),'oaca_event_recipients_refreshed','oaca_event',event_record.id,jsonb_build_object('version',next_version,'recipientCount',preview->'count','additions',preview->'additions','removals',preview->'removals'),'oaca');
  return preview||jsonb_build_object('version',next_version);
end $$;

create or replace function public.oaca_send_event_notification(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare event_record public.oaca_events; target record; notice public.platform_notifications; category_key text:=payload->>'type'; title_text text; body_text text; channels text[]:=array(select value from jsonb_array_elements_text(coalesce(payload->'channels','["in_app"]'::jsonb))); generation text:=coalesce(nullif(payload->>'generation',''),'manual'); recipient_count integer:=0; latest_id uuid;
begin
  select * into event_record from public.oaca_events where id=(payload->>'eventId')::uuid;
  if not found or not public.oaca_can_manage_event(event_record.id) then raise exception 'Only assigned event staff can notify this audience' using errcode='42501'; end if;
  if category_key not in ('publication','registration_confirmation','waitlist_confirmation','waitlist_promotion','reminder','event_change','cancellation','checkin_open','correction_outcome','follow_up','announcement') or not (channels@>array['in_app']::text[]) or not (channels<@array['in_app','email','push','sms']::text[]) then raise exception 'Choose valid notification channels' using errcode='23514'; end if;
  title_text:=coalesce(nullif(left(payload->>'title',240),''),event_record.title); body_text:=left(coalesce(payload->>'body','Open Compass for event details.'),1000);
  select id into latest_id from public.oaca_event_audience_versions where event_id=event_record.id order by version desc limit 1;
  for target in
    select distinct recipient.user_id from (
      select r.student_id user_id from public.oaca_event_registrations r where r.event_id=event_record.id and r.status<>'cancelled' and coalesce(payload->>'audience','registered')='registered'
      union all
      select r.user_id from public.oaca_event_audience_recipients r where r.audience_version_id=latest_id and coalesce(payload->>'audience','registered')='invited'
      union all
      select r.user_id from public.oaca_resolve_event_audience(event_record.organization_id,event_record.audience_spec) r where coalesce(payload->>'audience','registered')='all_active'
    ) recipient
  loop
    recipient_count:=recipient_count+1;
    notice:=public.oaca_create_notification(target.user_id,event_record.id,category_key,title_text,body_text,'oaca_event_'||category_key,1,'event:'||event_record.id||':'||category_key||':'||generation||':user:'||target.user_id);
    perform public.oaca_queue_notification_channels(notice.id,target.user_id,channels);
  end loop;
  return jsonb_build_object('recipientCount',recipient_count,'inPlatformCreated',recipient_count,'externalDeliveryConfiguration','provider_credentials_required');
end $$;

create or replace function public.oaca_publish_event(payload jsonb) returns public.oaca_events language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.oaca_events; rule_record public.oaca_event_notification_rules;
begin
  select * into saved from public.oaca_events where id=(payload->>'eventId')::uuid for update;
  if not found or not public.oaca_can_manage_event(saved.id) then raise exception 'This event is outside your authorized scope' using errcode='42501'; end if;
  if saved.status not in ('draft','scheduled') or saved.starts_at<=now() then raise exception 'Only a future draft or scheduled event can be published' using errcode='23514'; end if;
  if not exists(select 1 from public.oaca_event_hosts h where h.event_id=saved.id and h.host_role='owner') then raise exception 'Choose at least one named event coordinator' using errcode='23514'; end if;
  perform public.oaca_refresh_event_recipients(jsonb_build_object('eventId',saved.id,'audience',saved.audience_spec,'commit',true));
  update public.oaca_events set status='published',published_at=now(),publication_error=null,updated_at=now() where id=saved.id returning * into saved;
  select * into rule_record from public.oaca_event_notification_rules r where r.event_id=saved.id and r.notification_type='publication' and r.offset_minutes is null;
  if not found or rule_record.enabled then perform public.oaca_send_event_notification(jsonb_build_object('eventId',saved.id,'type','publication','title',saved.title,'body','A new Compass event is available. Open Compass for details and registration.','channels',coalesce(to_jsonb(rule_record.channels),'["in_app","email"]'::jsonb),'audience','invited','generation','publication')); end if;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(saved.organization_id,public.current_profile_user_id(),'oaca_event_published','oaca_event',saved.id,jsonb_build_object('recipientVersion',(select max(version) from public.oaca_event_audience_versions where event_id=saved.id)),'oaca');
  return saved;
end $$;

create or replace function public.oaca_create_event(payload jsonb) returns public.oaca_events language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_active_organization(); actor uuid:=public.current_profile_user_id(); saved public.oaca_events; audience jsonb:=coalesce(payload->'audience','{}'::jsonb); start_time timestamptz; end_time timestamptz; action_key text:=coalesce(payload->>'action','draft'); target text; item jsonb; channels_value text[];
begin
  if org is null or not public.oaca_can_manage_outreach(org) then raise exception 'Outreach management capability and MFA are required' using errcode='42501'; end if;
  if action_key not in ('draft','publish') or not public.oaca_audience_is_valid(audience) then raise exception 'Choose a valid event action and audience' using errcode='23514'; end if;
  start_time:=(payload->>'startsAt')::timestamptz; end_time:=nullif(payload->>'endsAt','')::timestamptz;
  if length(trim(coalesce(payload->>'title','')))<1 or start_time is null or (end_time is not null and end_time<=start_time) then raise exception 'Add a title and valid event dates' using errcode='22007'; end if;
  if action_key='publish' and (jsonb_typeof(payload->'coordinatorUserIds')<>'array' or jsonb_array_length(payload->'coordinatorUserIds')<1 or jsonb_typeof(payload->'attendeeNotificationRules')<>'array' or jsonb_typeof(payload->'coordinatorAlertRules')<>'array') then raise exception 'Review the audience, coordinators, and notification settings before publishing' using errcode='23514'; end if;
  insert into public.oaca_events(organization_id,title,description,starts_at,ends_at,modality,location,capacity,audience_spec,status,created_by)
  values(org,left(trim(payload->>'title'),240),left(coalesce(payload->>'description',''),12000),start_time,end_time,coalesce(nullif(payload->>'modality',''),'in_person'),nullif(left(coalesce(payload->>'location',''),500),''),nullif(payload->>'capacity','')::integer,audience,'draft',actor) returning * into saved;
  for target in select distinct value from jsonb_array_elements_text(coalesce(payload->'coordinatorUserIds','[]'::jsonb)) union select actor::text loop
    if target!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or not exists(select 1 from public.experience_role_assignments r where r.user_id=target::uuid and r.experience_key='oaca' and r.organization_id=org and r.role in ('faculty','staff','administrator') and r.revoked_at is null) then raise exception 'Choose active named Compass staff as coordinators' using errcode='23514'; end if;
    insert into public.oaca_event_hosts(event_id,user_id,host_role,assigned_by) values(saved.id,target::uuid,'owner',actor) on conflict do nothing;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload->'attendeeNotificationRules','[]'::jsonb)) loop
    channels_value:=array(select value from jsonb_array_elements_text(coalesce(item->'channels','["in_app"]'::jsonb)));
    if not channels_value@>array['in_app']::text[] or not channels_value<@array['in_app','email','push','sms']::text[] then raise exception 'Every attendee notification must remain available in Compass' using errcode='23514'; end if;
    insert into public.oaca_event_notification_rules(event_id,notification_type,offset_minutes,channels,enabled,scheduled_for,created_by)
    values(saved.id,item->>'type',nullif(item->>'offsetMinutes','')::integer,channels_value,coalesce((item->>'enabled')::boolean,true),case when item->>'type'='reminder' then saved.starts_at-make_interval(mins=>nullif(item->>'offsetMinutes','')::integer) else null end,actor)
    on conflict(event_id,notification_type,offset_minutes) do update set channels=excluded.channels,enabled=excluded.enabled,scheduled_for=excluded.scheduled_for,generation=oaca_event_notification_rules.generation+1,updated_at=now();
  end loop;
  for item in select value from jsonb_array_elements(coalesce(payload->'coordinatorAlertRules','[]'::jsonb)) loop
    channels_value:=array(select value from jsonb_array_elements_text(coalesce(item->'channels','["in_app"]'::jsonb)));
    insert into public.oaca_event_coordinator_alert_rules(event_id,activity_type,delivery_mode,channels,configured_by) values(saved.id,item->>'activityType',item->>'deliveryMode',channels_value,actor)
    on conflict(event_id,activity_type) do update set delivery_mode=excluded.delivery_mode,channels=excluded.channels,configured_by=excluded.configured_by,updated_at=now();
  end loop;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,actor,'oaca_event_created','oaca_event',saved.id,jsonb_build_object('audience',audience,'action',action_key,'coordinatorCount',(select count(*) from public.oaca_event_hosts h where h.event_id=saved.id and h.host_role='owner')),'oaca');
  if action_key='publish' then
    begin
      saved:=public.oaca_publish_event(jsonb_build_object('eventId',saved.id));
    exception when others then
      update public.oaca_events set status='draft',publication_error=left(sqlerrm,1000),updated_at=now() where id=saved.id returning * into saved;
      insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,actor,'oaca_event_publication_failed','oaca_event',saved.id,jsonb_build_object('reason',saved.publication_error),'oaca');
    end;
  end if;
  return saved;
end $$;

create or replace function public.oaca_assign_event_host(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare event_id uuid:=(payload->>'eventId')::uuid; target uuid:=(payload->>'userId')::uuid; org uuid;
begin
  select organization_id into org from public.oaca_events where id=event_id;
  if org is null or not public.oaca_can_manage_event(event_id) then raise exception 'This coordinator assignment is not allowed' using errcode='42501'; end if;
  if not exists(select 1 from public.experience_role_assignments r where r.user_id=target and r.experience_key='oaca' and r.organization_id=org and r.role in ('faculty','staff','administrator') and r.revoked_at is null) then raise exception 'Choose active Compass staff' using errcode='23514'; end if;
  insert into public.oaca_event_hosts(event_id,user_id,host_role,assigned_by) values(event_id,target,'owner',public.current_profile_user_id()) on conflict do nothing;
  insert into public.oaca_thread_participants(thread_id,user_id,participant_role) select t.id,target,'event_staff' from public.oaca_threads t where t.event_id=event_id and t.kind='event_inbox' on conflict do nothing;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_event_coordinator_assigned','oaca_event',event_id,jsonb_build_object('userId',target,'owner',true,'checkIn',true),'oaca');
  return '{"ok":true,"role":"owner","checkIn":true}'::jsonb;
end $$;

create function public.oaca_remove_event_host(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target_event uuid:=(payload->>'eventId')::uuid; target uuid:=(payload->>'userId')::uuid; org uuid;
begin
  select organization_id into org from public.oaca_events where id=target_event;
  if org is null or not public.oaca_can_manage_event(target_event) then raise exception 'This coordinator change is outside your assigned scope' using errcode='42501'; end if;
  if (select count(*) from public.oaca_event_hosts h where h.event_id=target_event and h.host_role='owner')<=1 and exists(select 1 from public.oaca_event_hosts h where h.event_id=target_event and h.user_id=target and h.host_role='owner') then raise exception 'An event must retain at least one coordinator' using errcode='23514'; end if;
  delete from public.oaca_event_hosts where event_id=target_event and user_id=target;
  delete from public.oaca_thread_participants p using public.oaca_threads t where p.thread_id=t.id and t.event_id=target_event and p.user_id=target and p.participant_role='event_staff';
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_event_coordinator_removed','oaca_event',target_event,jsonb_build_object('userId',target),'oaca');
  return '{"ok":true}'::jsonb;
end $$;

create function public.oaca_save_event_coordinator_alert_rules(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target_event uuid:=(payload->>'eventId')::uuid; item jsonb; channels_value text[]; saved integer:=0;
begin
  if not public.oaca_can_manage_event(target_event) or jsonb_typeof(payload->'rules')<>'array' then raise exception 'Coordinator alert settings are outside your scope' using errcode='42501'; end if;
  for item in select value from jsonb_array_elements(payload->'rules') loop
    channels_value:=array(select value from jsonb_array_elements_text(coalesce(item->'channels','["in_app"]'::jsonb)));
    if not channels_value@>array['in_app']::text[] or not channels_value<@array['in_app','email','push','sms']::text[] then raise exception 'Coordinator alerts must remain available in Compass' using errcode='23514'; end if;
    insert into public.oaca_event_coordinator_alert_rules(event_id,activity_type,delivery_mode,channels,configured_by) values(target_event,item->>'activityType',item->>'deliveryMode',channels_value,public.current_profile_user_id())
    on conflict(event_id,activity_type) do update set delivery_mode=excluded.delivery_mode,channels=excluded.channels,configured_by=excluded.configured_by,updated_at=now(); saved:=saved+1;
  end loop;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) select e.organization_id,public.current_profile_user_id(),'oaca_event_coordinator_alerts_updated','oaca_event',e.id,jsonb_build_object('ruleCount',saved),'oaca' from public.oaca_events e where e.id=target_event;
  return jsonb_build_object('ok',true,'saved',saved);
end $$;

create function public.oaca_record_event_activity(target_event uuid,type_key text,activity_actor uuid,subject_user uuid,summary_text text,metadata_value jsonb,idempotency text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.oaca_event_activity; host record; rule_record public.oaca_event_coordinator_alert_rules; notice public.platform_notifications; bucket timestamptz;
begin
  insert into public.oaca_event_activity(event_id,activity_type,actor_id,subject_user_id,summary,metadata,idempotency_key) values(target_event,type_key,activity_actor,subject_user,left(summary_text,500),coalesce(metadata_value,'{}'::jsonb),idempotency) on conflict(idempotency_key) do nothing returning * into saved;
  if not found then return; end if;
  for host in select distinct h.user_id from public.oaca_event_hosts h where h.event_id=target_event and h.host_role='owner' and h.user_id is distinct from activity_actor loop
    select * into rule_record from public.oaca_event_coordinator_alert_rules r where r.event_id=target_event and r.activity_type=type_key;
    if not found then rule_record.delivery_mode:='immediate'; rule_record.channels:=array['in_app']; end if;
    if rule_record.delivery_mode='immediate' then
      notice:=public.oaca_create_notification(host.user_id,target_event,'event_staff_'||type_key,'Event activity','New secured event activity is available in Compass.','oaca_event_staff_'||type_key,1,'event-activity:'||saved.id||':user:'||host.user_id);
      perform public.oaca_queue_notification_channels(notice.id,host.user_id,rule_record.channels);
    elsif rule_record.delivery_mode='hourly' then
      bucket:=date_trunc('hour',saved.created_at);
      insert into public.oaca_event_coordinator_digest_jobs(event_id,user_id,activity_type,bucket_start,bucket_end,channels,available_at) values(target_event,host.user_id,type_key,bucket,bucket+interval '1 hour',rule_record.channels,bucket+interval '1 hour') on conflict do nothing;
    end if;
  end loop;
end $$;

create function public.oaca_enqueue_event_coordinator_digests() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job record; notice public.platform_notifications; total integer:=0; activity_count integer;
begin
  for job in select * from public.oaca_event_coordinator_digest_jobs where status='pending' and available_at<=now() for update skip locked loop
    update public.oaca_event_coordinator_digest_jobs set status='processing',attempts=attempts+1 where id=job.id;
    select count(*)::integer into activity_count from public.oaca_event_activity a where a.event_id=job.event_id and a.activity_type=job.activity_type and a.created_at>=job.bucket_start and a.created_at<job.bucket_end;
    notice:=public.oaca_create_notification(job.user_id,job.event_id,'event_staff_digest','Event activity summary',activity_count||' secured '||replace(job.activity_type,'_',' ')||' update'||case when activity_count=1 then '' else 's' end||' are available in Compass.','oaca_event_staff_digest',1,'event-digest:'||job.id);
    perform public.oaca_queue_notification_channels(notice.id,job.user_id,job.channels);
    update public.oaca_event_coordinator_digest_jobs set status='completed' where id=job.id; total:=total+1;
  end loop;
  return jsonb_build_object('digests',total);
end $$;

create or replace function public.oaca_initialize_event_operations() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.oaca_event_hosts(event_id,user_id,host_role,assigned_by) values(new.id,new.created_by,'owner',new.created_by) on conflict do nothing;
  insert into public.oaca_event_notification_rules(event_id,notification_type,offset_minutes,channels,enabled,scheduled_for,created_by) values
    (new.id,'reminder',1440,array['in_app','email'],true,new.starts_at-interval '24 hours',new.created_by),
    (new.id,'reminder',60,array['in_app','email'],true,new.starts_at-interval '1 hour',new.created_by)
  on conflict do nothing;
  insert into public.oaca_event_coordinator_alert_rules(event_id,activity_type,delivery_mode,channels,configured_by) values
    (new.id,'rsvp','hourly',array['in_app','email'],new.created_by),(new.id,'waitlist','hourly',array['in_app','email'],new.created_by),
    (new.id,'event_message','immediate',array['in_app','email'],new.created_by),(new.id,'checkin','hourly',array['in_app'],new.created_by),
    (new.id,'correction','immediate',array['in_app','email'],new.created_by),(new.id,'delivery_failure','immediate',array['in_app'],new.created_by),
    (new.id,'event_change','immediate',array['in_app','email'],new.created_by)
  on conflict do nothing;
  return new;
end $$;

insert into public.oaca_event_coordinator_alert_rules(event_id,activity_type,delivery_mode,channels,configured_by)
select e.id,x.activity_type,x.delivery_mode,x.channels,e.created_by from public.oaca_events e cross join (values
  ('rsvp','hourly',array['in_app','email']::text[]),('waitlist','hourly',array['in_app','email']::text[]),('event_message','immediate',array['in_app','email']::text[]),('checkin','hourly',array['in_app']::text[]),('correction','immediate',array['in_app','email']::text[]),('delivery_failure','immediate',array['in_app']::text[]),('event_change','immediate',array['in_app','email']::text[])
) x(activity_type,delivery_mode,channels) on conflict do nothing;

create function public.oaca_capture_registration_activity() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' and old.status=new.status then return new; end if;
  perform public.oaca_record_event_activity(new.event_id,case when new.status='waitlisted' then 'waitlist' else 'rsvp' end,new.student_id,new.student_id,case when new.status='waitlisted' then 'Waitlist activity recorded.' else 'RSVP activity recorded.' end,jsonb_build_object('status',new.status),'registration:'||new.event_id||':'||new.student_id||':'||new.status||':'||new.registered_at::text);
  return new;
end $$;
create trigger oaca_event_registration_activity after insert or update of status on public.oaca_event_registrations for each row execute function public.oaca_capture_registration_activity();

create function public.oaca_capture_attendance_activity() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.oaca_record_event_activity(new.event_id,'checkin',new.changed_by,new.student_id,'Attendance or check-in activity recorded.',jsonb_build_object('source',new.change_source,'status',new.new_status),'attendance-change:'||new.id);
  return new;
end $$;
create trigger oaca_event_attendance_activity after insert on public.oaca_event_attendance_changes for each row execute function public.oaca_capture_attendance_activity();

create function public.oaca_capture_correction_activity() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' and old.status=new.status then return new; end if;
  perform public.oaca_record_event_activity(new.event_id,'correction',case when tg_op='INSERT' then new.student_id else new.resolved_by end,new.student_id,'Attendance correction activity recorded.',jsonb_build_object('status',new.status),'correction:'||new.id||':'||new.status);
  return new;
end $$;
create trigger oaca_event_correction_activity after insert or update of status on public.oaca_attendance_correction_requests for each row execute function public.oaca_capture_correction_activity();

create function public.oaca_capture_message_activity() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare target_event uuid; target_student uuid;
begin
  select t.event_id,t.student_id into target_event,target_student from public.oaca_threads t where t.id=new.thread_id and t.kind='event_inbox';
  if target_event is not null then perform public.oaca_record_event_activity(target_event,'event_message',new.sender_id,target_student,'New event conversation activity recorded.',jsonb_build_object('channel',new.channel,'direction',new.direction),'event-message:'||new.id); end if;
  return new;
end $$;
create trigger oaca_event_message_activity after insert on public.oaca_messages for each row execute function public.oaca_capture_message_activity();

create function public.oaca_capture_event_change_activity() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.title is distinct from new.title or old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at or old.location is distinct from new.location or old.modality is distinct from new.modality or old.status is distinct from new.status then
    perform public.oaca_record_event_activity(new.id,'event_change',public.current_profile_user_id(),null,'Event details or status changed.',jsonb_build_object('status',new.status),'event-change:'||new.id||':'||new.updated_at::text);
  end if;
  return new;
end $$;
create trigger oaca_event_change_activity after update on public.oaca_events for each row execute function public.oaca_capture_event_change_activity();

create function public.oaca_capture_delivery_failure_activity() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare target_event uuid; category_key text;
begin
  if new.status='failed' and old.status is distinct from new.status then
    select n.event_id,n.category into target_event,category_key from public.platform_notifications n where n.id=new.notification_id;
    if target_event is not null and category_key not like 'event_staff_%' then perform public.oaca_record_event_activity(target_event,'delivery_failure',null,null,'An attendee notification delivery failed.',jsonb_build_object('channel',new.channel),'delivery-failure:'||new.id); end if;
  end if;
  return new;
end $$;
create trigger oaca_event_delivery_failure_activity after update of status on public.platform_notification_deliveries for each row execute function public.oaca_capture_delivery_failure_activity();

create or replace function public.oaca_event_workspace(payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=public.current_profile_user_id(); org uuid:=public.oaca_active_organization(); selected uuid:=nullif(payload->>'eventId','')::uuid; staff boolean; result jsonb;
begin
  if org is null then raise exception 'Compass membership is required' using errcode='42501'; end if;
  staff:=public.staff_mfa_verified() and exists(select 1 from public.experience_role_assignments r where r.user_id=actor and r.experience_key='oaca' and r.organization_id=org and r.role in ('faculty','staff','administrator') and r.revoked_at is null);
  if selected is not null and staff and not public.oaca_can_manage_event(selected) then raise exception 'Only assigned event staff can open this roster' using errcode='42501'; end if;
  select jsonb_build_object(
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'startsAt',e.starts_at,'endsAt',e.ends_at,'timezone',e.timezone,'modality',e.modality,'location',e.location,'capacity',e.capacity,'status',e.status,'audience',e.audience_spec,'sourceSystem',e.source_system,'publicationError',e.publication_error,'canManage',public.oaca_can_manage_event(e.id),'registrationCount',(select count(*) from public.oaca_event_registrations r where r.event_id=e.id and r.status<>'cancelled'),'presentCount',(select count(*) from public.oaca_event_registrations r where r.event_id=e.id and r.attendance_status='present'),'absentCount',(select count(*) from public.oaca_event_registrations r where r.event_id=e.id and r.attendance_status='absent'),'notRecordedCount',(select count(*) from public.oaca_event_registrations r where r.event_id=e.id and r.attendance_status='not_recorded'),'attendanceStatus',(select r.attendance_status from public.oaca_event_registrations r where r.event_id=e.id and r.student_id=actor),'registered',exists(select 1 from public.oaca_event_registrations r where r.event_id=e.id and r.student_id=actor and r.status<>'cancelled'),'checkinOpen',exists(select 1 from public.oaca_event_checkin_sessions s where s.event_id=e.id and s.closed_at is null and s.closes_at>now())) order by e.starts_at desc) from public.oaca_events e where e.organization_id=org and (case when staff then (e.status in ('published','completed','cancelled') or public.oaca_can_manage_event(e.id)) else e.status in ('published','completed') and public.oaca_student_matches_audience(actor,org,e.audience_spec) end)),'[]'::jsonb),
    'roster',case when selected is not null and staff then coalesce((select jsonb_agg(jsonb_build_object('studentId',r.student_id,'displayName',p.display_name,'registrationStatus',r.status,'registrationSource',r.registration_source,'attendanceStatus',r.attendance_status,'attendanceSource',r.attendance_source,'version',r.attendance_version,'updatedAt',r.updated_at) order by p.display_name) from public.oaca_event_registrations r join public.profiles p on p.user_id=r.student_id where r.event_id=selected),'[]'::jsonb) else '[]'::jsonb end,
    'hosts',case when selected is not null and staff then coalesce((select jsonb_agg(jsonb_build_object('userId',h.user_id,'displayName',p.display_name,'role',h.host_role) order by p.display_name) from public.oaca_event_hosts h join public.profiles p on p.user_id=h.user_id where h.event_id=selected),'[]'::jsonb) else '[]'::jsonb end,
    'staffOptions',case when staff then coalesce((select jsonb_agg(jsonb_build_object('userId',x.user_id,'displayName',x.display_name,'groupKey',x.group_key,'groupLabel',x.group_label) order by x.group_order,x.display_name) from (select distinct r.user_id,p.display_name,case when exists(select 1 from public.oaca_providers op join public.oaca_provider_services ps on ps.provider_id=op.id join public.oaca_service_lines s on s.id=ps.service_line_id where op.user_id=r.user_id and s.key='academic_advising') then 'academic_advising' when exists(select 1 from public.oaca_providers op join public.oaca_provider_services ps on ps.provider_id=op.id join public.oaca_service_lines s on s.id=ps.service_line_id where op.user_id=r.user_id and s.key='career_advising') then 'career_advising' when exists(select 1 from public.oaca_providers op join public.oaca_provider_services ps on ps.provider_id=op.id join public.oaca_service_lines s on s.id=ps.service_line_id where op.user_id=r.user_id and s.key='peer_tutoring') then 'tutoring' when r.role='administrator' then 'administration' when r.role='faculty' then 'faculty' else 'staff' end group_key,case when exists(select 1 from public.oaca_providers op join public.oaca_provider_services ps on ps.provider_id=op.id join public.oaca_service_lines s on s.id=ps.service_line_id where op.user_id=r.user_id and s.key='academic_advising') then 'Academic Advisors' when exists(select 1 from public.oaca_providers op join public.oaca_provider_services ps on ps.provider_id=op.id join public.oaca_service_lines s on s.id=ps.service_line_id where op.user_id=r.user_id and s.key='career_advising') then 'Career Advising' when exists(select 1 from public.oaca_providers op join public.oaca_provider_services ps on ps.provider_id=op.id join public.oaca_service_lines s on s.id=ps.service_line_id where op.user_id=r.user_id and s.key='peer_tutoring') then 'Tutoring Management' when r.role='administrator' then 'Administration' when r.role='faculty' then 'Faculty' else 'Staff' end group_label,case when r.role='administrator' then 5 when r.role='faculty' then 4 else 3 end group_order from public.experience_role_assignments r join public.profiles p on p.user_id=r.user_id where r.experience_key='oaca' and r.organization_id=org and r.role in ('faculty','staff','administrator') and r.revoked_at is null and p.status='active') x),'[]'::jsonb) else '[]'::jsonb end,
    'audienceOptions',case when staff then jsonb_build_object('cohorts',coalesce((select jsonb_agg(value order by value) from (select distinct cohort_label value from public.oaca_student_dimensions where organization_id=org and cohort_label is not null) x),'[]'::jsonb),'phases',coalesce((select jsonb_agg(value order by value) from (select distinct current_phase value from public.oaca_student_dimensions where organization_id=org and current_phase is not null) x),'[]'::jsonb),'years',coalesce((select jsonb_agg(value order by value) from (select distinct current_year value from public.oaca_student_dimensions where organization_id=org and current_year is not null) x),'[]'::jsonb),'campuses',coalesce((select jsonb_agg(value order by value) from (select distinct campus value from public.oaca_student_dimensions where organization_id=org and campus is not null) x),'[]'::jsonb),'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'college',g.college) order by case when g.college='College of Medicine' then 0 else 1 end,g.name) from public.genesis_organizations g where g.archived_at is null),'[]'::jsonb),'memberRoles',jsonb_build_array(jsonb_build_object('key','student','label','Students'),jsonb_build_object('key','faculty','label','Faculty'),jsonb_build_object('key','staff','label','Staff'),jsonb_build_object('key','administrator','label','Administrators')),'people',coalesce((select jsonb_agg(jsonb_build_object('userId',p.user_id,'displayName',p.display_name,'role',x.roles) order by p.display_name) from public.profiles p join (select r.user_id,string_agg(distinct r.role,', ' order by r.role) roles from public.experience_role_assignments r where r.experience_key='oaca' and r.organization_id=org and r.revoked_at is null group by r.user_id) x on x.user_id=p.user_id where p.status='active'),'[]'::jsonb),'providers',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'displayName',profile.display_name) order by profile.display_name) from public.oaca_providers p join public.profiles profile on profile.user_id=p.user_id where p.organization_id=org and p.active),'[]'::jsonb)) else '{}'::jsonb end,
    'corrections',case when selected is not null and staff then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'studentId',c.student_id,'displayName',p.display_name,'requestedStatus',c.requested_status,'explanation',c.explanation,'status',c.status,'createdAt',c.created_at,'resolutionNote',c.resolution_note) order by c.created_at desc) from public.oaca_attendance_correction_requests c join public.profiles p on p.user_id=c.student_id where c.event_id=selected),'[]'::jsonb) else coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'eventId',c.event_id,'requestedStatus',c.requested_status,'status',c.status,'createdAt',c.created_at,'resolutionNote',c.resolution_note) order by c.created_at desc) from public.oaca_attendance_correction_requests c where c.student_id=actor),'[]'::jsonb) end,
    'notifications',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'eventId',n.event_id,'category',n.category,'title',n.title,'body',n.body,'deepLink',n.deep_link,'readAt',n.read_at,'dismissedAt',n.dismissed_at,'createdAt',n.created_at) order by n.created_at desc) from public.platform_notifications n where n.user_id=actor and n.experience_key='oaca' and n.dismissed_at is null),'[]'::jsonb),
    'preferences',coalesce((select jsonb_build_object('emailEnabled',p.email_enabled,'smsEnabled',p.sms_enabled,'phoneVerified',p.phone_verified_at is not null,'quietHoursStart',p.quiet_hours_start,'quietHoursEnd',p.quiet_hours_end,'timezone',p.timezone) from public.platform_notification_preferences p where p.user_id=actor),jsonb_build_object('emailEnabled',true,'smsEnabled',false,'phoneVerified',false,'quietHoursStart',null,'quietHoursEnd',null,'timezone','America/Los_Angeles')),
    'pushSubscriptions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'provider',s.provider,'deviceLabel',s.device_label,'permissionStatus',s.permission_status,'createdAt',s.created_at) order by s.created_at desc) from public.platform_push_subscriptions s where s.user_id=actor and s.revoked_at is null),'[]'::jsonb),
    'notificationRules',case when selected is not null and staff then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'type',r.notification_type,'offsetMinutes',r.offset_minutes,'channels',r.channels,'enabled',r.enabled,'scheduledFor',r.scheduled_for,'generation',r.generation) order by r.notification_type,r.offset_minutes desc) from public.oaca_event_notification_rules r where r.event_id=selected),'[]'::jsonb) else '[]'::jsonb end,
    'coordinatorAlertRules',case when selected is not null and staff then coalesce((select jsonb_agg(jsonb_build_object('activityType',r.activity_type,'deliveryMode',r.delivery_mode,'channels',r.channels) order by r.activity_type) from public.oaca_event_coordinator_alert_rules r where r.event_id=selected),'[]'::jsonb) else '[]'::jsonb end,
    'activity',case when selected is not null and staff then coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'eventId',a.event_id,'activityType',a.activity_type,'summary',a.summary,'createdAt',a.created_at) order by a.created_at desc) from public.oaca_event_activity a where a.event_id=selected limit 100),'[]'::jsonb) else '[]'::jsonb end,
    'recipientVersion',case when selected is not null and staff then coalesce((select max(v.version) from public.oaca_event_audience_versions v where v.event_id=selected),0) else 0 end,
    'recipientCount',case when selected is not null and staff then coalesce((select v.recipient_count from public.oaca_event_audience_versions v where v.event_id=selected order by v.version desc limit 1),0) else 0 end,
    'deliveries',case when selected is not null and staff then coalesce((select jsonb_object_agg(status,total) from (select d.status,count(*) total from public.platform_notification_deliveries d join public.platform_notifications n on n.id=d.notification_id where n.event_id=selected group by d.status) x),'{}'::jsonb) else '{}'::jsonb end,
    'threads',case when selected is not null then coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'studentId',t.student_id,'studentName',(select p.display_name from public.profiles p where p.user_id=t.student_id),'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'senderId',m.sender_id,'body',m.body,'direction',m.direction,'channel',m.channel,'createdAt',m.created_at) order by m.created_at) from public.oaca_messages m where m.thread_id=t.id),'[]'::jsonb)) order by t.created_at desc) from public.oaca_threads t where t.event_id=selected and exists(select 1 from public.oaca_thread_participants tp where tp.thread_id=t.id and tp.user_id=actor)),'[]'::jsonb) else '[]'::jsonb end,
    'unreadCount',(select count(*) from public.platform_notifications n where n.user_id=actor and n.experience_key='oaca' and n.read_at is null and n.dismissed_at is null)
  ) into result;
  return result;
end $$;

create function public.prevent_event_workflow_history_mutation() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin raise exception 'Event workflow history is immutable'; end $$;
create trigger oaca_event_audience_versions_immutable before update or delete on public.oaca_event_audience_versions for each row execute function public.prevent_event_workflow_history_mutation();
create trigger oaca_event_audience_recipients_immutable before update or delete on public.oaca_event_audience_recipients for each row execute function public.prevent_event_workflow_history_mutation();
create trigger oaca_event_activity_immutable before update or delete on public.oaca_event_activity for each row execute function public.prevent_event_workflow_history_mutation();

alter table public.oaca_event_audience_versions enable row level security;
alter table public.oaca_event_audience_recipients enable row level security;
alter table public.oaca_event_coordinator_alert_rules enable row level security;
alter table public.oaca_event_activity enable row level security;
alter table public.oaca_event_coordinator_digest_jobs enable row level security;
create policy oaca_event_coordinator_alert_rules_assigned on public.oaca_event_coordinator_alert_rules for select to authenticated using(public.oaca_can_manage_event(event_id));
create policy oaca_event_activity_assigned on public.oaca_event_activity for select to authenticated using(public.oaca_can_manage_event(event_id));

drop policy if exists oaca_events_scoped on public.oaca_events;
create policy oaca_events_scoped on public.oaca_events for select to authenticated using(
  (public.staff_mfa_verified() and exists(select 1 from public.experience_role_assignments r where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.organization_id=oaca_events.organization_id and r.role in ('faculty','staff','administrator') and r.revoked_at is null) and (status in ('published','completed','cancelled') or public.oaca_can_manage_event(id)))
  or (status in ('published','completed') and public.oaca_student_matches_audience(public.current_profile_user_id(),organization_id,audience_spec))
);

revoke all on public.oaca_event_audience_versions,public.oaca_event_audience_recipients,public.oaca_event_coordinator_alert_rules,public.oaca_event_activity,public.oaca_event_coordinator_digest_jobs from anon,authenticated;
grant select on public.oaca_event_coordinator_alert_rules,public.oaca_event_activity to authenticated;
grant all on public.oaca_event_audience_versions,public.oaca_event_audience_recipients,public.oaca_event_coordinator_alert_rules,public.oaca_event_activity,public.oaca_event_coordinator_digest_jobs to service_role;

revoke all on function public.oaca_resolve_event_audience(uuid,jsonb),public.oaca_queue_notification_channels(uuid,uuid,text[]),public.oaca_record_event_activity(uuid,text,uuid,uuid,text,jsonb,text),public.oaca_enqueue_event_coordinator_digests() from public,anon,authenticated;
grant execute on function public.oaca_enqueue_event_coordinator_digests() to service_role;
revoke all on function public.oaca_preview_event_audience(jsonb),public.oaca_refresh_event_recipients(jsonb),public.oaca_remove_event_host(jsonb),public.oaca_save_event_coordinator_alert_rules(jsonb) from public,anon;
grant execute on function public.oaca_preview_event_audience(jsonb),public.oaca_refresh_event_recipients(jsonb),public.oaca_remove_event_host(jsonb),public.oaca_save_event_coordinator_alert_rules(jsonb) to authenticated;

commit;
