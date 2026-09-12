alter table public.oaca_events
  add column if not exists category text,
  add column if not exists accessibility_details text,
  add column if not exists public_catalog boolean not null default false;

create index if not exists oaca_events_student_catalog_idx
  on public.oaca_events(organization_id,public_catalog,starts_at desc)
  where status in ('published','completed');

create or replace function public.oaca_update_event(payload jsonb) returns public.oaca_events
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  saved public.oaca_events;
  fields text[]:='{}';
  old_start timestamptz;
  old_location text;
  old_modality text;
begin
  select * into saved from public.oaca_events where id=(payload->>'eventId')::uuid for update;
  if not found or not public.oaca_can_manage_event(saved.id) then raise exception 'This event is outside your assigned scope' using errcode='42501'; end if;
  old_start:=saved.starts_at; old_location:=saved.location; old_modality:=saved.modality;
  if payload?'title' then fields:=fields||'title'; end if;
  if payload?'description' then fields:=fields||'description'; end if;
  if payload?'category' then fields:=fields||'category'; end if;
  if payload?'accessibilityDetails' then fields:=fields||'accessibility_details'; end if;
  if payload?'publicCatalog' then fields:=fields||'public_catalog'; end if;
  if payload?'startsAt' then fields:=fields||'starts_at'; end if;
  if payload?'endsAt' then fields:=fields||'ends_at'; end if;
  if payload?'location' then fields:=fields||'location'; end if;
  if payload?'modality' then fields:=fields||'modality'; end if;
  if payload?'capacity' then fields:=fields||'capacity'; end if;
  update public.oaca_events set
    title=case when payload?'title' then left(trim(payload->>'title'),240) else title end,
    description=case when payload?'description' then left(coalesce(payload->>'description',''),12000) else description end,
    category=case when payload?'category' then nullif(left(trim(coalesce(payload->>'category','')),100),'') else category end,
    accessibility_details=case when payload?'accessibilityDetails' then nullif(left(trim(coalesce(payload->>'accessibilityDetails','')),2000),'') else accessibility_details end,
    public_catalog=case when payload?'publicCatalog' then coalesce((payload->>'publicCatalog')::boolean,false) else public_catalog end,
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

create or replace function public.oaca_create_event(payload jsonb) returns public.oaca_events
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  org uuid:=public.oaca_active_organization();
  actor uuid:=public.current_profile_user_id();
  saved public.oaca_events;
  audience jsonb:=coalesce(payload->'audience','{}'::jsonb);
  start_time timestamptz;
  end_time timestamptz;
  action_key text:=coalesce(payload->>'action','draft');
  target text;
  item jsonb;
  channels_value text[];
begin
  if org is null or not public.oaca_can_manage_outreach(org) then raise exception 'Outreach management capability and MFA are required' using errcode='42501'; end if;
  if action_key not in ('draft','publish') or not public.oaca_audience_is_valid(audience) then raise exception 'Choose a valid event action and audience' using errcode='23514'; end if;
  start_time:=(payload->>'startsAt')::timestamptz;
  end_time:=nullif(payload->>'endsAt','')::timestamptz;
  if length(trim(coalesce(payload->>'title','')))<1 or start_time is null or (end_time is not null and end_time<=start_time) then raise exception 'Add a title and valid event dates' using errcode='22007'; end if;
  if action_key='publish' and (jsonb_typeof(payload->'coordinatorUserIds')<>'array' or jsonb_array_length(payload->'coordinatorUserIds')<1 or jsonb_typeof(payload->'attendeeNotificationRules')<>'array' or jsonb_typeof(payload->'coordinatorAlertRules')<>'array') then raise exception 'Review the audience, coordinators, and notification settings before publishing' using errcode='23514'; end if;
  insert into public.oaca_events(organization_id,title,description,category,accessibility_details,public_catalog,starts_at,ends_at,modality,location,capacity,audience_spec,status,created_by)
  values(org,left(trim(payload->>'title'),240),left(coalesce(payload->>'description',''),12000),nullif(left(trim(coalesce(payload->>'category','')),100),''),nullif(left(trim(coalesce(payload->>'accessibilityDetails','')),2000),''),coalesce((payload->>'publicCatalog')::boolean,false),start_time,end_time,coalesce(nullif(payload->>'modality',''),'in_person'),nullif(left(coalesce(payload->>'location',''),500),''),nullif(payload->>'capacity','')::integer,audience,'draft',actor)
  returning * into saved;
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
    insert into public.oaca_event_coordinator_alert_rules(event_id,activity_type,delivery_mode,channels,configured_by)
    values(saved.id,item->>'activityType',item->>'deliveryMode',channels_value,actor)
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

create or replace function public.oaca_event_feed(payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  org uuid:=public.oaca_active_organization();
  actor uuid:=public.current_profile_user_id();
  manager boolean;
  result jsonb;
begin
  if org is null then raise exception 'OACA membership is required' using errcode='42501'; end if;
  manager:=public.oaca_can_manage_outreach(org);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,
    'title',e.title,
    'description',e.description,
    'startsAt',e.starts_at,
    'endsAt',e.ends_at,
    'modality',e.modality,
    'location',e.location,
    'capacity',e.capacity,
    'registrationCount',(select count(*) from public.oaca_event_registrations r where r.event_id=e.id and r.status in ('registered','attended')),
    'registered',coalesce((select r.status in ('registered','attended','waitlisted') from public.oaca_event_registrations r where r.event_id=e.id and r.student_id=actor),false),
    'registrationStatus',coalesce((select r.status from public.oaca_event_registrations r where r.event_id=e.id and r.student_id=actor),'none'),
    'waitlistPosition',case when exists(select 1 from public.oaca_event_registrations mine where mine.event_id=e.id and mine.student_id=actor and mine.status='waitlisted') then (select 1+count(*) from public.oaca_event_registrations ahead where ahead.event_id=e.id and ahead.status='waitlisted' and ahead.registered_at<(select mine.registered_at from public.oaca_event_registrations mine where mine.event_id=e.id and mine.student_id=actor and mine.status='waitlisted')) else null end,
    'attendanceStatus',(select r.attendance_status from public.oaca_event_registrations r where r.event_id=e.id and r.student_id=actor),
    'category',e.category,
    'accessibilityDetails',e.accessibility_details,
    'audienceEligible',public.oaca_student_matches_audience(actor,org,e.audience_spec),
    'publicCatalog',e.public_catalog,
    'canCancelRegistration',e.starts_at>now() and exists(select 1 from public.oaca_event_registrations r where r.event_id=e.id and r.student_id=actor and r.status in ('registered','waitlisted')),
    'status',e.status,
    'audience',case when manager then e.audience_spec else '{}'::jsonb end,
    'formId',e.form_id
  ) order by e.starts_at),'[]'::jsonb) into result
  from public.oaca_events e
  where e.organization_id=org
    and (
      manager
      or (
        e.status in ('published','completed')
        and (
          public.oaca_student_matches_audience(actor,org,e.audience_spec)
          or (e.public_catalog and coalesce(e.ends_at,e.starts_at)<now())
        )
      )
    );
  return result;
end $$;

create or replace function public.oaca_register_event(payload jsonb) returns public.oaca_event_registrations
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  event_record public.oaca_events;
  saved public.oaca_event_registrations;
  registered_count integer;
  actor uuid:=public.current_profile_user_id();
begin
  select * into event_record from public.oaca_events where id=(payload->>'eventId')::uuid for update;
  if not found
    or event_record.status<>'published'
    or event_record.starts_at<=now()
    or not public.oaca_student_matches_audience(actor,event_record.organization_id,event_record.audience_spec)
    or not exists(select 1 from public.experience_role_assignments a where a.user_id=actor and a.experience_key='oaca' and a.organization_id=event_record.organization_id and a.role='student' and a.revoked_at is null)
  then raise exception 'This event is not available to your account' using errcode='42501'; end if;

  select * into saved from public.oaca_event_registrations where event_id=event_record.id and student_id=actor for update;
  if found and saved.status in ('registered','waitlisted','attended') then return saved; end if;

  select count(*) into registered_count from public.oaca_event_registrations
    where event_id=event_record.id and student_id<>actor and status in ('registered','attended');
  insert into public.oaca_event_registrations(event_id,student_id,status)
    values(event_record.id,actor,case when event_record.capacity is not null and registered_count>=event_record.capacity then 'waitlisted' else 'registered' end)
  on conflict(event_id,student_id) do update
    set status=excluded.status,cancelled_at=null,registered_at=now(),updated_at=now()
  returning * into saved;
  update public.oaca_campaign_recipients r set event_registered_at=coalesce(event_registered_at,now())
    from public.oaca_outreach_campaigns c
    where r.campaign_id=c.id and r.user_id=saved.student_id and c.event_id=event_record.id;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key)
    values(event_record.organization_id,actor,'oaca_event_registration','oaca_event',event_record.id,jsonb_build_object('status',saved.status),'oaca');
  return saved;
end $$;

create or replace function public.oaca_cancel_event_registration(payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  event_record public.oaca_events;
  saved public.oaca_event_registrations;
  promoted public.oaca_event_registrations;
  notice public.platform_notifications;
  actor uuid:=public.current_profile_user_id();
  prior_status text;
begin
  select * into event_record from public.oaca_events where id=(payload->>'eventId')::uuid for update;
  if not found or event_record.starts_at<=now() or not exists(select 1 from public.experience_role_assignments a where a.user_id=actor and a.experience_key='oaca' and a.organization_id=event_record.organization_id and a.role='student' and a.revoked_at is null) then raise exception 'This registration can no longer be cancelled' using errcode='23514'; end if;
  select * into saved from public.oaca_event_registrations where event_id=event_record.id and student_id=actor for update;
  if not found or saved.status not in ('registered','waitlisted') then raise exception 'There is no active registration to cancel' using errcode='23514'; end if;
  prior_status:=saved.status;
  update public.oaca_event_registrations set status='cancelled',cancelled_at=now(),updated_at=now()
    where event_id=saved.event_id and student_id=saved.student_id returning * into saved;

  if prior_status='registered' then
    select * into promoted from public.oaca_event_registrations
      where event_id=event_record.id and status='waitlisted'
      order by registered_at,student_id
      for update skip locked limit 1;
    if found then
      update public.oaca_event_registrations set status='registered',updated_at=now()
        where event_id=promoted.event_id and student_id=promoted.student_id returning * into promoted;
      notice:=public.oaca_create_notification(promoted.student_id,event_record.id,'waitlist_promotion','You have a place at '||event_record.title,'A space opened and your event registration is now confirmed. Open Compass for current details.','oaca_event',1,'waitlist-promotion:'||event_record.id||':'||promoted.student_id);
      perform public.oaca_queue_notification_channels(notice.id,promoted.student_id,array['in_app','email']::text[]);
      insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key)
        values(event_record.organization_id,actor,'oaca_event_waitlist_promoted','oaca_event',event_record.id,jsonb_build_object('studentId',promoted.student_id),'oaca');
    end if;
  end if;

  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key)
    values(event_record.organization_id,actor,'oaca_event_registration_cancelled','oaca_event',event_record.id,jsonb_build_object('priorStatus',prior_status,'promotedStudentId',promoted.student_id),'oaca');
  return jsonb_build_object('status','cancelled','promoted',promoted.student_id is not null);
end $$;

revoke all on function public.oaca_cancel_event_registration(jsonb) from public,anon;
grant execute on function public.oaca_cancel_event_registration(jsonb) to authenticated;
