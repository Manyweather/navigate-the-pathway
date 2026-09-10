begin;

create table public.oaca_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check(length(title) between 1 and 240),
  form_schema jsonb not null default '[]'::jsonb check(jsonb_typeof(form_schema)='array' and jsonb_array_length(form_schema) between 1 and 30),
  status text not null default 'draft' check(status in ('draft','published','closed','archived')),
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.oaca_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check(length(title) between 1 and 240),
  description text not null default '' check(length(description)<=12000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'America/Los_Angeles',
  modality text not null check(modality in ('in_person','teams','hybrid')),
  location text check(length(location)<=500),
  capacity integer check(capacity between 1 and 5000),
  audience_spec jsonb not null default '{"includeAllStudents":true}'::jsonb check(jsonb_typeof(audience_spec)='object'),
  form_id uuid references public.oaca_forms(id) on delete set null,
  status text not null default 'draft' check(status in ('draft','scheduled','published','completed','cancelled','archived')),
  created_by uuid not null references public.profiles(user_id),
  published_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at is null or ends_at>starts_at)
);

create table public.oaca_event_registrations (
  event_id uuid not null references public.oaca_events(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null default 'registered' check(status in ('registered','waitlisted','cancelled','attended','no_show')),
  registered_at timestamptz not null default now(),
  cancelled_at timestamptz,
  primary key(event_id,student_id)
);

create table public.oaca_outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check(length(name) between 1 and 240),
  subject text not null check(length(subject) between 1 and 160),
  preview_text text not null default '' check(length(preview_text)<=240),
  content jsonb not null default '{}'::jsonb check(jsonb_typeof(content)='object'),
  audience_spec jsonb not null check(jsonb_typeof(audience_spec)='object'),
  event_id uuid references public.oaca_events(id) on delete set null,
  form_id uuid references public.oaca_forms(id) on delete set null,
  media_file_id uuid references public.platform_files(id) on delete set null,
  track_opens boolean not null default false,
  status text not null default 'draft' check(status in ('draft','scheduled','queued','sending','sent','cancelled')),
  scheduled_for timestamptz,
  recipient_count integer not null default 0 check(recipient_count>=0),
  created_by uuid not null references public.profiles(user_id),
  queued_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.oaca_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.oaca_outreach_campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  destination_hash text check(destination_hash is null or destination_hash ~ '^[0-9a-f]{64}$'),
  delivery_status text not null default 'queued' check(delivery_status in ('queued','suppressed','sent','delivered','failed','cancelled')),
  suppression_reason text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  form_submitted_at timestamptz,
  event_registered_at timestamptz,
  appointment_requested_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id,user_id)
);

create table public.oaca_campaign_engagement (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.oaca_outreach_campaigns(id) on delete cascade,
  recipient_id uuid not null references public.oaca_campaign_recipients(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  event_type text not null check(event_type in ('delivered','opened','clicked','form_submitted','event_registered','appointment_requested')),
  link_key text check(length(link_key)<=100),
  occurred_at timestamptz not null default now(),
  unique(recipient_id,event_type,link_key)
);

create table public.oaca_form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.oaca_forms(id) on delete restrict,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  campaign_id uuid references public.oaca_outreach_campaigns(id) on delete set null,
  event_id uuid references public.oaca_events(id) on delete set null,
  responses jsonb not null check(jsonb_typeof(responses)='object'),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(form_id,student_id)
);

create table public.oaca_appointment_nudges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  sent_by uuid not null references public.profiles(user_id),
  service_key text not null check(service_key in ('academic_advising','career_advising','peer_tutoring')),
  provider_id uuid references public.oaca_providers(id) on delete set null,
  reason_category text not null default 'appointment_recommended' check(reason_category in ('appointment_recommended','milestone_due','follow_up_due','student_requested')),
  channels text[] not null default array['in_app']::text[] check(channels<@array['in_app','email','sms']::text[] and channels@>array['in_app']::text[]),
  due_by date,
  status text not null default 'queued' check(status in ('queued','delivered','opened','dismissed','converted','expired','cancelled')),
  appointment_id uuid references public.oaca_appointments(id) on delete set null,
  delivered_at timestamptz,
  opened_at timestamptz,
  dismissed_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.oaca_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  experience_key text not null default 'oaca' references public.experiences(key) check(experience_key='oaca'),
  job_kind text not null check(job_kind in ('campaign_email','appointment_nudge_email','appointment_nudge_sms')),
  campaign_recipient_id uuid references public.oaca_campaign_recipients(id) on delete cascade,
  nudge_id uuid references public.oaca_appointment_nudges(id) on delete cascade,
  channel text not null check(channel in ('email','sms')),
  idempotency_key text not null unique,
  status text not null default 'pending' check(status in ('pending','processing','delivered','failed','suppressed','cancelled')),
  available_at timestamptz not null default now(),
  attempts integer not null default 0 check(attempts between 0 and 20),
  locked_until timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  check((campaign_recipient_id is not null)::integer+(nudge_id is not null)::integer=1)
);

create index oaca_events_org_start_idx on public.oaca_events(organization_id,starts_at,status);
create index oaca_campaigns_org_created_idx on public.oaca_outreach_campaigns(organization_id,created_at desc);
create index oaca_campaign_recipients_user_idx on public.oaca_campaign_recipients(user_id,created_at desc);
create index oaca_nudges_student_status_idx on public.oaca_appointment_nudges(student_id,status,created_at desc);
create index oaca_delivery_jobs_ready_idx on public.oaca_delivery_jobs(status,available_at) where status='pending';

create function public.oaca_can_manage_outreach(org uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.staff_mfa_verified() and (
    exists(select 1 from public.experience_role_assignments r where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.organization_id=org and r.role='administrator' and r.revoked_at is null)
    or exists(select 1 from public.experience_capability_assignments c where c.user_id=public.current_profile_user_id() and c.experience_key='oaca' and c.organization_id=org and c.capability='oaca.outreach.manage' and c.revoked_at is null)
  );
$$;

create function public.oaca_can_view_outreach_insights(org uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.staff_mfa_verified() and (
    public.oaca_can_manage_outreach(org)
    or exists(select 1 from public.experience_capability_assignments c where c.user_id=public.current_profile_user_id() and c.experience_key='oaca' and c.organization_id=org and c.capability='oaca.outreach.insights' and c.revoked_at is null)
  );
$$;

create function public.oaca_can_view_identifiable_form_responses(org uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.staff_mfa_verified() and exists(select 1 from public.experience_capability_assignments c where c.user_id=public.current_profile_user_id() and c.experience_key='oaca' and c.organization_id=org and c.capability='oaca.forms.identifiable_responses' and c.revoked_at is null);
$$;

create function public.oaca_audience_is_valid(audience jsonb) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare audience_key text; item jsonb; has_target boolean:=false;
begin
  if jsonb_typeof(audience)<>'object' then return false; end if;
  if audience ? 'includeAllStudents' and jsonb_typeof(audience->'includeAllStudents')<>'boolean' then return false; end if;
  has_target:=coalesce((audience->>'includeAllStudents')::boolean,false);
  foreach audience_key in array array['cohortLabels','phases','years','campuses','assignedProviderIds','studentIds'] loop
    if audience ? audience_key then
      if jsonb_typeof(audience->audience_key)<>'array' or jsonb_array_length(audience->audience_key)>500 then return false; end if;
      for item in select value from jsonb_array_elements(audience->audience_key) loop if jsonb_typeof(item)<>'string' or length(trim(item#>>'{}'))<1 then return false; end if; end loop;
      has_target:=has_target or jsonb_array_length(audience->audience_key)>0;
    end if;
  end loop;
  return has_target;
end $$;

create function public.oaca_student_matches_audience(target uuid,org uuid,audience jsonb) returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result boolean;
begin
  if not public.oaca_audience_is_valid(audience) then return false; end if;
  select exists(select 1 from public.experience_role_assignments r join public.profiles p on p.user_id=r.user_id where r.user_id=target and r.experience_key='oaca' and r.organization_id=org and r.role='student' and r.revoked_at is null and p.status='active')
    and (coalesce((audience->>'includeAllStudents')::boolean,false) or audience ?| array['cohortLabels','phases','years','campuses','assignedProviderIds','studentIds'])
    and (coalesce(jsonb_array_length(audience->'cohortLabels'),0)=0 or exists(select 1 from jsonb_array_elements_text(audience->'cohortLabels') x where x=(select d.cohort_label from public.oaca_student_dimensions d where d.student_id=target and d.organization_id=org and d.effective_from<=current_date and (d.effective_to is null or d.effective_to>=current_date) order by d.effective_from desc limit 1)))
    and (coalesce(jsonb_array_length(audience->'phases'),0)=0 or exists(select 1 from jsonb_array_elements_text(audience->'phases') x where x=(select d.current_phase from public.oaca_student_dimensions d where d.student_id=target and d.organization_id=org and d.effective_from<=current_date and (d.effective_to is null or d.effective_to>=current_date) order by d.effective_from desc limit 1)))
    and (coalesce(jsonb_array_length(audience->'years'),0)=0 or exists(select 1 from jsonb_array_elements_text(audience->'years') x where x=(select d.current_year from public.oaca_student_dimensions d where d.student_id=target and d.organization_id=org and d.effective_from<=current_date and (d.effective_to is null or d.effective_to>=current_date) order by d.effective_from desc limit 1)))
    and (coalesce(jsonb_array_length(audience->'campuses'),0)=0 or exists(select 1 from jsonb_array_elements_text(audience->'campuses') x where x=(select d.campus from public.oaca_student_dimensions d where d.student_id=target and d.organization_id=org and d.effective_from<=current_date and (d.effective_to is null or d.effective_to>=current_date) order by d.effective_from desc limit 1)))
    and (coalesce(jsonb_array_length(audience->'assignedProviderIds'),0)=0 or exists(select 1 from public.oaca_advisor_assignments a join public.oaca_providers p on p.id=a.provider_id join jsonb_array_elements_text(audience->'assignedProviderIds') x on x=p.id::text where a.student_id=target and p.organization_id=org and a.ended_at is null))
    and (coalesce(jsonb_array_length(audience->'studentIds'),0)=0 or exists(select 1 from jsonb_array_elements_text(audience->'studentIds') x where x=target::text)) into result;
  return result;
end $$;

create function public.oaca_active_organization() returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  select r.organization_id from public.experience_role_assignments r join public.profiles p on p.user_id=r.user_id where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.organization_id is not null and r.revoked_at is null order by (r.organization_id=p.active_organization_id) desc limit 1;
$$;

create function public.oaca_can_view_campaign(target_campaign uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.oaca_outreach_campaigns c where c.id=target_campaign and (public.oaca_can_manage_outreach(c.organization_id) or exists(select 1 from public.oaca_campaign_recipients r where r.campaign_id=c.id and r.user_id=public.current_profile_user_id())));
$$;

create function public.oaca_audience_options(payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_active_organization(); result jsonb;
begin
  if org is null or not public.oaca_can_manage_outreach(org) then raise exception 'Outreach management capability and MFA are required' using errcode='42501'; end if;
  select jsonb_build_object(
    'cohorts',coalesce((select jsonb_agg(value order by value) from (select distinct cohort_label value from public.oaca_student_dimensions where organization_id=org and cohort_label is not null) x),'[]'::jsonb),
    'phases',coalesce((select jsonb_agg(value order by value) from (select distinct current_phase value from public.oaca_student_dimensions where organization_id=org and current_phase is not null) x),'[]'::jsonb),
    'years',coalesce((select jsonb_agg(value order by value) from (select distinct current_year value from public.oaca_student_dimensions where organization_id=org and current_year is not null) x),'[]'::jsonb),
    'campuses',coalesce((select jsonb_agg(value order by value) from (select distinct campus value from public.oaca_student_dimensions where organization_id=org and campus is not null) x),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create function public.oaca_event_feed(payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_active_organization(); actor uuid:=public.current_profile_user_id(); manager boolean; result jsonb;
begin
  if org is null then raise exception 'OACA membership is required' using errcode='42501'; end if;
  manager:=public.oaca_can_manage_outreach(org);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'startsAt',e.starts_at,'endsAt',e.ends_at,'modality',e.modality,'location',e.location,'capacity',e.capacity,'registrationCount',(select count(*) from public.oaca_event_registrations r where r.event_id=e.id and r.status in ('registered','attended')),'registered',exists(select 1 from public.oaca_event_registrations r where r.event_id=e.id and r.student_id=actor and r.status in ('registered','attended','waitlisted')),'status',e.status,'audience',e.audience_spec,'formId',e.form_id) order by e.starts_at),'[]'::jsonb) into result
  from public.oaca_events e where e.organization_id=org and (manager or (e.status='published' and e.starts_at>now()-interval '12 hours' and public.oaca_student_matches_audience(actor,org,e.audience_spec)));
  return result;
end $$;

create function public.oaca_create_event(payload jsonb) returns public.oaca_events language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_active_organization(); saved public.oaca_events; audience jsonb:=coalesce(payload->'audience','{}'::jsonb); start_time timestamptz; end_time timestamptz;
begin
  if org is null or not public.oaca_can_manage_outreach(org) then raise exception 'Outreach management capability and MFA are required' using errcode='42501'; end if;
  if not public.oaca_audience_is_valid(audience) then raise exception 'Choose a valid event audience' using errcode='23514'; end if;
  start_time:=(payload->>'startsAt')::timestamptz; end_time:=nullif(payload->>'endsAt','')::timestamptz;
  if start_time is null or (end_time is not null and end_time<=start_time) then raise exception 'Choose a valid event time' using errcode='22007'; end if;
  insert into public.oaca_events(organization_id,title,description,starts_at,ends_at,modality,location,capacity,audience_spec,status,created_by)
  values(org,left(trim(payload->>'title'),240),left(coalesce(payload->>'description',''),12000),start_time,end_time,coalesce(nullif(payload->>'modality',''),'in_person'),nullif(left(coalesce(payload->>'location',''),500),''),nullif(payload->>'capacity','')::integer,audience,'draft',public.current_profile_user_id()) returning * into saved;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_event_created','oaca_event',saved.id,jsonb_build_object('audience',audience),'oaca');
  return saved;
end $$;

create function public.oaca_publish_event(payload jsonb) returns public.oaca_events language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.oaca_events;
begin
  select * into saved from public.oaca_events where id=(payload->>'eventId')::uuid for update;
  if not found or not public.oaca_can_manage_outreach(saved.organization_id) then raise exception 'This event is outside your authorized scope' using errcode='42501'; end if;
  if saved.status not in ('draft','scheduled') or saved.starts_at<=now() then raise exception 'Only a future draft or scheduled event can be published' using errcode='23514'; end if;
  update public.oaca_events set status='published',published_at=now(),updated_at=now() where id=saved.id returning * into saved;
  if saved.form_id is not null then update public.oaca_forms set status='published',updated_at=now() where id=saved.form_id; end if;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(saved.organization_id,public.current_profile_user_id(),'oaca_event_published','oaca_event',saved.id,'{}','oaca');
  return saved;
end $$;

create function public.oaca_create_campaign(payload jsonb) returns public.oaca_outreach_campaigns language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_active_organization(); saved public.oaca_outreach_campaigns; audience jsonb:=coalesce(payload->'audience','{}'); content_data jsonb:=coalesce(payload->'content','{}'); form_record public.oaca_forms; file_record public.platform_files; form_payload jsonb:=payload->'embeddedForm';
begin
  if org is null or not public.oaca_can_manage_outreach(org) then raise exception 'Outreach management capability and MFA are required' using errcode='42501'; end if;
  if not public.oaca_audience_is_valid(audience) then raise exception 'Choose a valid campaign audience' using errcode='23514'; end if;
  if length(trim(coalesce(payload->>'subject','')))<1 or length(trim(coalesce(content_data->>'heading','')))<1 or length(trim(coalesce(content_data->>'body','')))<1 then raise exception 'Subject, heading, and message are required' using errcode='23514'; end if;
  if length(content_data->>'body')>12000 then raise exception 'Campaign body is too long' using errcode='22001'; end if;
  if nullif(content_data->>'callToActionUrl','') is not null and content_data->>'callToActionUrl' !~ '^https://' then raise exception 'Campaign links must use HTTPS' using errcode='23514'; end if;
  if nullif(content_data->>'mediaUrl','') is not null and content_data->>'mediaUrl' !~ '^https://' then raise exception 'Rich-media links must use HTTPS' using errcode='23514'; end if;
  if nullif(content_data->>'mediaFileId','') is not null then select * into file_record from public.platform_files where id=(content_data->>'mediaFileId')::uuid and owner_id=public.current_profile_user_id() and experience_key='oaca'; if not found then raise exception 'The media file is outside your scope' using errcode='42501'; end if; end if;
  if form_payload is not null then
    if jsonb_typeof(form_payload->'fields')<>'array' or jsonb_array_length(form_payload->'fields') not between 1 and 30 then raise exception 'A form needs 1 to 30 fields' using errcode='23514'; end if;
    insert into public.oaca_forms(organization_id,title,form_schema,created_by) values(org,left(trim(form_payload->>'title'),240),form_payload->'fields',public.current_profile_user_id()) returning * into form_record;
  end if;
  insert into public.oaca_outreach_campaigns(organization_id,name,subject,preview_text,content,audience_spec,event_id,form_id,media_file_id,track_opens,scheduled_for,status,created_by)
  values(org,left(trim(payload->>'name'),240),left(trim(payload->>'subject'),160),left(coalesce(payload->>'previewText',''),240),content_data,audience,nullif(payload->>'eventId','')::uuid,form_record.id,nullif(content_data->>'mediaFileId','')::uuid,coalesce((payload->>'trackOpens')::boolean,false),nullif(payload->>'scheduledFor','')::timestamptz,'draft',public.current_profile_user_id()) returning * into saved;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_campaign_created','oaca_outreach_campaign',saved.id,jsonb_build_object('audience',audience,'trackOpens',saved.track_opens),'oaca');
  return saved;
end $$;

create function public.oaca_queue_campaign(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare campaign public.oaca_outreach_campaigns; target record; pref public.platform_notification_preferences; recipient public.oaca_campaign_recipients; email text; queued integer:=0; suppressed integer:=0; available timestamptz;
begin
  select * into campaign from public.oaca_outreach_campaigns where id=(payload->>'campaignId')::uuid for update;
  if not found or not public.oaca_can_manage_outreach(campaign.organization_id) then raise exception 'This campaign is outside your authorized scope' using errcode='42501'; end if;
  if campaign.status<>'draft' then raise exception 'Only a draft campaign can be queued' using errcode='23514'; end if;
  if campaign.media_file_id is not null and not exists(select 1 from public.platform_files f where f.id=campaign.media_file_id and f.scan_status='clean' and f.archived_at is null) then raise exception 'Campaign media must pass security scanning before delivery' using errcode='23514'; end if;
  available:=coalesce(campaign.scheduled_for,now());
  for target in select distinct r.user_id from public.experience_role_assignments r where r.experience_key='oaca' and r.organization_id=campaign.organization_id and r.role='student' and r.revoked_at is null and public.oaca_student_matches_audience(r.user_id,campaign.organization_id,campaign.audience_spec) loop
    select i.email into email from public.account_auth_identities i where i.canonical_user_id=target.user_id and i.is_primary and i.verified_at is not null limit 1;
    select * into pref from public.platform_notification_preferences where user_id=target.user_id;
    insert into public.oaca_campaign_recipients(campaign_id,user_id,destination_hash,delivery_status,suppression_reason)
    values(campaign.id,target.user_id,case when email is null then null else encode(digest(lower(email),'sha256'),'hex') end,case when email is null or coalesce(pref.email_enabled,true)=false then 'suppressed' else 'queued' end,case when email is null then 'no_verified_email' when coalesce(pref.email_enabled,true)=false then 'email_disabled' end)
    on conflict(campaign_id,user_id) do update set delivery_status=excluded.delivery_status,suppression_reason=excluded.suppression_reason returning * into recipient;
    if recipient.delivery_status='queued' then
      queued:=queued+1;
      insert into public.oaca_delivery_jobs(job_kind,campaign_recipient_id,channel,idempotency_key,available_at) values('campaign_email',recipient.id,'email','campaign:'||campaign.id||':recipient:'||target.user_id,available) on conflict(idempotency_key) do nothing;
    else suppressed:=suppressed+1; end if;
    insert into public.platform_delivery_attempts(user_id,experience_key,channel,template_key,template_version,destination_hash,status,metadata) values(target.user_id,'oaca','email','oaca_campaign',1,recipient.destination_hash,case when recipient.delivery_status='queued' then 'queued' else 'suppressed' end,jsonb_build_object('campaignId',campaign.id,'reason',recipient.suppression_reason));
  end loop;
  update public.oaca_outreach_campaigns set status=case when scheduled_for is not null and scheduled_for>now() then 'scheduled' else 'queued' end,recipient_count=queued+suppressed,queued_at=now(),updated_at=now() where id=campaign.id;
  if campaign.form_id is not null then update public.oaca_forms set status='published',updated_at=now() where id=campaign.form_id; end if;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(campaign.organization_id,public.current_profile_user_id(),'oaca_campaign_queued','oaca_outreach_campaign',campaign.id,jsonb_build_object('recipientCount',queued+suppressed,'queued',queued,'suppressed',suppressed),'oaca');
  return jsonb_build_object('campaignId',campaign.id,'recipientCount',queued+suppressed,'queued',queued,'suppressed',suppressed);
end $$;

create function public.oaca_send_appointment_nudge(payload jsonb) returns public.oaca_appointment_nudges language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=public.current_profile_user_id(); student uuid:=(payload->>'studentId')::uuid; org uuid:=public.oaca_active_organization(); provider uuid:=nullif(payload->>'providerId','')::uuid; service text:=payload->>'serviceKey'; saved public.oaca_appointment_nudges; prefs public.platform_notification_preferences; channel text; allowed boolean:=false;
begin
  if org is null or not public.staff_mfa_verified() or not exists(select 1 from public.experience_role_assignments where user_id=actor and experience_key='oaca' and organization_id=org and role in ('faculty','staff','administrator') and revoked_at is null) then raise exception 'Staff MFA and OACA membership are required' using errcode='42501'; end if;
  if service not in ('academic_advising','career_advising','peer_tutoring') or not public.oaca_student_matches_audience(student,org,jsonb_build_object('studentIds',jsonb_build_array(student))) then raise exception 'Choose an authorized student and service' using errcode='42501'; end if;
  allowed:=public.oaca_can_manage_outreach(org) or exists(select 1 from public.oaca_providers p join public.oaca_advisor_assignments a on a.provider_id=p.id where p.user_id=actor and p.organization_id=org and a.student_id=student and a.ended_at is null);
  if not allowed then raise exception 'You may nudge only assigned students without outreach management capability' using errcode='42501'; end if;
  if provider is not null and not exists(select 1 from public.oaca_providers p where p.id=provider and p.organization_id=org and p.active) then raise exception 'The selected provider is not eligible' using errcode='23514'; end if;
  if exists(select 1 from public.oaca_appointment_nudges n where n.student_id=student and n.service_key=service and n.sent_by=actor and n.status in ('queued','delivered','opened') and n.created_at>now()-interval '24 hours') then raise exception 'A similar nudge was sent within the last 24 hours' using errcode='23514'; end if;
  insert into public.oaca_appointment_nudges(organization_id,student_id,sent_by,service_key,provider_id,reason_category,channels,due_by)
  values(org,student,actor,service,provider,coalesce(nullif(payload->>'reasonCategory',''),'appointment_recommended'),array(select distinct value from jsonb_array_elements_text(coalesce(payload->'channels','["in_app"]')) value where value in ('in_app','email','sms'))||case when coalesce(payload->'channels','[]') ? 'in_app' then '{}'::text[] else array['in_app']::text[] end,nullif(payload->>'dueBy','')::date) returning * into saved;
  select * into prefs from public.platform_notification_preferences where user_id=student;
  foreach channel in array saved.channels loop
    if channel='email' then
      insert into public.platform_delivery_attempts(user_id,experience_key,channel,template_key,template_version,status,metadata) values(student,'oaca','email','oaca_appointment_nudge',1,case when coalesce(prefs.email_enabled,true) then 'queued' else 'suppressed' end,jsonb_build_object('nudgeId',saved.id));
      if coalesce(prefs.email_enabled,true) then insert into public.oaca_delivery_jobs(job_kind,nudge_id,channel,idempotency_key) values('appointment_nudge_email',saved.id,'email','nudge:'||saved.id||':email'); end if;
    elsif channel='sms' then
      insert into public.platform_delivery_attempts(user_id,experience_key,channel,template_key,template_version,destination_hash,status,metadata) values(student,'oaca','sms','oaca_appointment_nudge',1,case when prefs.verified_phone is null then null else encode(digest(prefs.verified_phone,'sha256'),'hex') end,case when prefs.sms_enabled and prefs.phone_verified_at is not null and prefs.sms_opted_out_at is null then 'queued' else 'suppressed' end,jsonb_build_object('nudgeId',saved.id));
      if prefs.sms_enabled and prefs.phone_verified_at is not null and prefs.sms_opted_out_at is null then insert into public.oaca_delivery_jobs(job_kind,nudge_id,channel,idempotency_key) values('appointment_nudge_sms',saved.id,'sms','nudge:'||saved.id||':sms'); end if;
    end if;
  end loop;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,actor,'oaca_appointment_nudge_sent','oaca_appointment_nudge',saved.id,jsonb_build_object('studentId',student,'serviceKey',service,'channels',saved.channels),'oaca');
  return saved;
end $$;

create function public.oaca_update_nudge(payload jsonb) returns public.oaca_appointment_nudges language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.oaca_appointment_nudges; action text:=payload->>'action';
begin
  select * into saved from public.oaca_appointment_nudges where id=(payload->>'nudgeId')::uuid and student_id=public.current_profile_user_id() for update;
  if not found or action not in ('opened','dismissed') or saved.status not in ('queued','delivered','opened') then raise exception 'This nudge cannot be updated' using errcode='23514'; end if;
  update public.oaca_appointment_nudges set status=action,opened_at=case when action='opened' then coalesce(opened_at,now()) else opened_at end,dismissed_at=case when action='dismissed' then now() else dismissed_at end where id=saved.id returning * into saved;
  return saved;
end $$;

create function public.oaca_register_event(payload jsonb) returns public.oaca_event_registrations language plpgsql security definer set search_path=public,pg_temp as $$
declare event_record public.oaca_events; saved public.oaca_event_registrations; registered_count integer;
begin
  select * into event_record from public.oaca_events where id=(payload->>'eventId')::uuid for update;
  if not found or event_record.status<>'published' or event_record.starts_at<=now() or not public.oaca_student_matches_audience(public.current_profile_user_id(),event_record.organization_id,event_record.audience_spec) then raise exception 'This event is not available to your account' using errcode='42501'; end if;
  select count(*) into registered_count from public.oaca_event_registrations where event_id=event_record.id and status in ('registered','attended');
  insert into public.oaca_event_registrations(event_id,student_id,status) values(event_record.id,public.current_profile_user_id(),case when event_record.capacity is not null and registered_count>=event_record.capacity then 'waitlisted' else 'registered' end) on conflict(event_id,student_id) do update set status=case when event_record.capacity is not null and registered_count>=event_record.capacity then 'waitlisted' else 'registered' end,cancelled_at=null returning * into saved;
  update public.oaca_campaign_recipients r set event_registered_at=coalesce(event_registered_at,now()) from public.oaca_outreach_campaigns c where r.campaign_id=c.id and r.user_id=saved.student_id and c.event_id=event_record.id;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(event_record.organization_id,saved.student_id,'oaca_event_registration','oaca_event',event_record.id,jsonb_build_object('status',saved.status),'oaca');
  return saved;
end $$;

create function public.oaca_submit_form_response(payload jsonb) returns public.oaca_form_responses language plpgsql security definer set search_path=public,pg_temp as $$
declare form_record public.oaca_forms; campaign public.oaca_outreach_campaigns; saved public.oaca_form_responses; answer_data jsonb:=coalesce(payload->'responses','{}'); required_field jsonb;
begin
  select * into form_record from public.oaca_forms where id=(payload->>'formId')::uuid;
  if not found or form_record.status<>'published' or jsonb_typeof(answer_data)<>'object' then raise exception 'This form is not available' using errcode='42501'; end if;
  select * into campaign from public.oaca_outreach_campaigns where id=nullif(payload->>'campaignId','')::uuid and form_id=form_record.id;
  if campaign.id is null or not exists(select 1 from public.oaca_campaign_recipients where campaign_id=campaign.id and user_id=public.current_profile_user_id()) then raise exception 'This form was not assigned to your account' using errcode='42501'; end if;
  for required_field in select value from jsonb_array_elements(form_record.form_schema) where coalesce((value->>'required')::boolean,false) loop if nullif(trim(answer_data->>(required_field->>'id')),'') is null then raise exception 'Complete every required form field' using errcode='23514'; end if; end loop;
  insert into public.oaca_form_responses(form_id,student_id,campaign_id,event_id,responses) values(form_record.id,public.current_profile_user_id(),campaign.id,campaign.event_id,answer_data) on conflict(form_id,student_id) do update set responses=excluded.responses,updated_at=now() returning * into saved;
  update public.oaca_campaign_recipients set form_submitted_at=coalesce(form_submitted_at,now()) where campaign_id=campaign.id and user_id=saved.student_id;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(form_record.organization_id,saved.student_id,'oaca_form_submitted','oaca_form',form_record.id,jsonb_build_object('campaignId',campaign.id,'fieldCount',(select count(*) from jsonb_object_keys(answer_data))),'oaca');
  return saved;
end $$;

create function public.oaca_record_campaign_engagement(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient public.oaca_campaign_recipients; event_kind text:=payload->>'eventType';
begin
  if event_kind not in ('opened','clicked') then raise exception 'Unsupported engagement event' using errcode='23514'; end if;
  select * into recipient from public.oaca_campaign_recipients where campaign_id=(payload->>'campaignId')::uuid and user_id=public.current_profile_user_id();
  if not found then raise exception 'This campaign was not assigned to your account' using errcode='42501'; end if;
  insert into public.oaca_campaign_engagement(campaign_id,recipient_id,user_id,event_type,link_key) values(recipient.campaign_id,recipient.id,recipient.user_id,event_kind,nullif(left(coalesce(payload->>'linkKey',''),100),'')) on conflict do nothing;
  update public.oaca_campaign_recipients set opened_at=case when event_kind='opened' then coalesce(opened_at,now()) else opened_at end,clicked_at=case when event_kind='clicked' then coalesce(clicked_at,now()) else clicked_at end where id=recipient.id;
  return '{"ok":true}'::jsonb;
end $$;

create function public.oaca_campaign_insights(payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_active_organization(); minimum_group integer:=10; result jsonb;
begin
  if org is null or not public.oaca_can_view_outreach_insights(org) then raise exception 'Outreach insights capability and MFA are required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'subject',c.subject,'previewText',c.preview_text,'status',c.status,'audience',c.audience_spec,'scheduledFor',c.scheduled_for,'sentAt',c.sent_at,'content',c.content,'recipientCount',counts.recipients,'deliveredCount',counts.delivered,'openedCount',counts.opened,'clickedCount',counts.clicked,'formSubmittedCount',counts.forms,'eventRegisteredCount',counts.registrations,'appointmentRequestedCount',counts.appointments,'minimumGroupSize',minimum_group) order by c.created_at desc),'[]'::jsonb) into result
  from public.oaca_outreach_campaigns c cross join lateral (select count(*) recipients,count(*) filter(where r.delivered_at is not null) delivered,count(*) filter(where r.opened_at is not null) opened,count(*) filter(where r.clicked_at is not null) clicked,count(*) filter(where r.form_submitted_at is not null) forms,count(*) filter(where r.event_registered_at is not null) registrations,count(*) filter(where r.appointment_requested_at is not null) appointments from public.oaca_campaign_recipients r where r.campaign_id=c.id) counts where c.organization_id=org;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_outreach_insights_viewed','oaca_outreach_insights',jsonb_build_object('minimumGroupSize',minimum_group),'oaca');
  return result;
end $$;

create function public.oaca_convert_nudge_on_appointment() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare service text;
begin
  select key into service from public.oaca_service_lines where id=new.service_line_id;
  update public.oaca_appointment_nudges set status='converted',appointment_id=new.id,converted_at=now() where id=(select id from public.oaca_appointment_nudges where student_id=new.student_id and service_key=service and status in ('queued','delivered','opened') and created_at<=new.created_at order by created_at desc limit 1);
  return new;
end $$;
create trigger oaca_appointment_converts_nudge after insert on public.oaca_appointments for each row execute function public.oaca_convert_nudge_on_appointment();

alter table public.oaca_forms enable row level security;
alter table public.oaca_events enable row level security;
alter table public.oaca_event_registrations enable row level security;
alter table public.oaca_outreach_campaigns enable row level security;
alter table public.oaca_campaign_recipients enable row level security;
alter table public.oaca_campaign_engagement enable row level security;
alter table public.oaca_form_responses enable row level security;
alter table public.oaca_appointment_nudges enable row level security;
alter table public.oaca_delivery_jobs enable row level security;

create policy oaca_forms_scoped on public.oaca_forms for select to authenticated using(public.oaca_can_manage_outreach(organization_id) or (status='published' and exists(select 1 from public.experience_role_assignments r where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.organization_id=oaca_forms.organization_id and r.revoked_at is null)));
create policy oaca_events_scoped on public.oaca_events for select to authenticated using(public.oaca_can_manage_outreach(organization_id) or (status='published' and public.oaca_student_matches_audience(public.current_profile_user_id(),organization_id,audience_spec)));
create policy oaca_event_registrations_scoped on public.oaca_event_registrations for select to authenticated using(student_id=public.current_profile_user_id() or exists(select 1 from public.oaca_events e where e.id=event_id and public.oaca_can_manage_outreach(e.organization_id)));
create policy oaca_campaigns_scoped on public.oaca_outreach_campaigns for select to authenticated using(public.oaca_can_view_campaign(id));
create policy oaca_campaign_recipients_scoped on public.oaca_campaign_recipients for select to authenticated using(user_id=public.current_profile_user_id());
create policy oaca_form_responses_scoped on public.oaca_form_responses for select to authenticated using(student_id=public.current_profile_user_id() or exists(select 1 from public.oaca_forms f where f.id=form_id and public.oaca_can_view_identifiable_form_responses(f.organization_id)));
create policy oaca_nudges_scoped on public.oaca_appointment_nudges for select to authenticated using(student_id=public.current_profile_user_id() or sent_by=public.current_profile_user_id() or public.oaca_can_manage_outreach(organization_id));

revoke all on public.oaca_forms,public.oaca_events,public.oaca_event_registrations,public.oaca_outreach_campaigns,public.oaca_campaign_recipients,public.oaca_campaign_engagement,public.oaca_form_responses,public.oaca_appointment_nudges,public.oaca_delivery_jobs from anon,authenticated;
grant select on public.oaca_forms,public.oaca_events,public.oaca_event_registrations,public.oaca_outreach_campaigns,public.oaca_campaign_recipients,public.oaca_form_responses,public.oaca_appointment_nudges to authenticated;
grant all on public.oaca_forms,public.oaca_events,public.oaca_event_registrations,public.oaca_outreach_campaigns,public.oaca_campaign_recipients,public.oaca_campaign_engagement,public.oaca_form_responses,public.oaca_appointment_nudges,public.oaca_delivery_jobs to service_role;
revoke all on function public.oaca_can_manage_outreach(uuid),public.oaca_can_view_outreach_insights(uuid),public.oaca_can_view_identifiable_form_responses(uuid),public.oaca_audience_is_valid(jsonb),public.oaca_student_matches_audience(uuid,uuid,jsonb),public.oaca_active_organization(),public.oaca_can_view_campaign(uuid),public.oaca_audience_options(jsonb),public.oaca_event_feed(jsonb),public.oaca_create_event(jsonb),public.oaca_publish_event(jsonb),public.oaca_create_campaign(jsonb),public.oaca_queue_campaign(jsonb),public.oaca_send_appointment_nudge(jsonb),public.oaca_update_nudge(jsonb),public.oaca_register_event(jsonb),public.oaca_submit_form_response(jsonb),public.oaca_record_campaign_engagement(jsonb),public.oaca_campaign_insights(jsonb) from public,anon;
grant execute on function public.oaca_can_manage_outreach(uuid),public.oaca_can_view_outreach_insights(uuid),public.oaca_can_view_identifiable_form_responses(uuid),public.oaca_audience_is_valid(jsonb),public.oaca_student_matches_audience(uuid,uuid,jsonb),public.oaca_active_organization(),public.oaca_can_view_campaign(uuid),public.oaca_audience_options(jsonb),public.oaca_event_feed(jsonb),public.oaca_create_event(jsonb),public.oaca_publish_event(jsonb),public.oaca_create_campaign(jsonb),public.oaca_queue_campaign(jsonb),public.oaca_send_appointment_nudge(jsonb),public.oaca_update_nudge(jsonb),public.oaca_register_event(jsonb),public.oaca_submit_form_response(jsonb),public.oaca_record_campaign_engagement(jsonb),public.oaca_campaign_insights(jsonb) to authenticated;

commit;
