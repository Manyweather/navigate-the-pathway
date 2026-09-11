begin;

alter table public.oaca_outreach_campaigns
  add column if not exists delivery_channel text not null default 'email'
  check (delivery_channel in ('email','sms'));

alter table public.oaca_delivery_jobs drop constraint if exists oaca_delivery_jobs_job_kind_check;
alter table public.oaca_delivery_jobs add constraint oaca_delivery_jobs_job_kind_check
  check (job_kind in ('campaign_email','campaign_sms','appointment_nudge_email','appointment_nudge_sms'));

create or replace function public.oaca_create_campaign(payload jsonb) returns public.oaca_outreach_campaigns language plpgsql security definer set search_path=public,pg_temp as $$
declare
  org uuid:=public.oaca_active_organization();
  saved public.oaca_outreach_campaigns;
  audience jsonb:=coalesce(payload->'audience','{}');
  content_data jsonb:=coalesce(payload->'content','{}');
  form_record public.oaca_forms;
  file_record public.platform_files;
  form_payload jsonb:=payload->'embeddedForm';
  delivery text:=coalesce(nullif(payload->>'deliveryChannel',''),'email');
begin
  if org is null or not public.oaca_can_manage_outreach(org) then raise exception 'Outreach management capability and MFA are required' using errcode='42501'; end if;
  if delivery not in ('email','sms') then raise exception 'Choose email or SMS delivery' using errcode='23514'; end if;
  if not public.oaca_audience_is_valid(audience) then raise exception 'Choose a valid campaign audience' using errcode='23514'; end if;
  if length(trim(coalesce(payload->>'subject','')))<1 or length(trim(coalesce(content_data->>'heading','')))<1 or length(trim(coalesce(content_data->>'body','')))<1 then raise exception 'Campaign name and message are required' using errcode='23514'; end if;
  if delivery='email' and length(content_data->>'body')>12000 then raise exception 'Campaign body is too long' using errcode='22001'; end if;
  if delivery='sms' and length(content_data->>'body')>480 then raise exception 'SMS messages must be 480 characters or fewer' using errcode='22001'; end if;
  if nullif(content_data->>'callToActionUrl','') is not null and content_data->>'callToActionUrl' !~ '^https://' then raise exception 'Campaign links must use HTTPS' using errcode='23514'; end if;
  if nullif(content_data->>'mediaUrl','') is not null and content_data->>'mediaUrl' !~ '^https://' then raise exception 'Rich-media links must use HTTPS' using errcode='23514'; end if;
  if delivery='sms' and (nullif(content_data->>'mediaFileId','') is not null or nullif(content_data->>'mediaUrl','') is not null or form_payload is not null) then raise exception 'SMS campaigns use text and secure links only' using errcode='23514'; end if;
  if nullif(content_data->>'mediaFileId','') is not null then
    select * into file_record from public.platform_files where id=(content_data->>'mediaFileId')::uuid and owner_id=public.current_profile_user_id() and experience_key='oaca';
    if not found then raise exception 'The media file is outside your scope' using errcode='42501'; end if;
  end if;
  if form_payload is not null then
    if jsonb_typeof(form_payload->'fields')<>'array' or jsonb_array_length(form_payload->'fields') not between 1 and 30 then raise exception 'A form needs 1 to 30 fields' using errcode='23514'; end if;
    insert into public.oaca_forms(organization_id,title,form_schema,created_by) values(org,left(trim(form_payload->>'title'),240),form_payload->'fields',public.current_profile_user_id()) returning * into form_record;
  end if;
  insert into public.oaca_outreach_campaigns(organization_id,name,subject,preview_text,content,audience_spec,event_id,form_id,media_file_id,track_opens,scheduled_for,status,created_by,delivery_channel)
  values(org,left(trim(payload->>'name'),240),left(trim(payload->>'subject'),160),left(coalesce(payload->>'previewText',''),240),content_data,audience,nullif(payload->>'eventId','')::uuid,form_record.id,nullif(content_data->>'mediaFileId','')::uuid,case when delivery='email' then coalesce((payload->>'trackOpens')::boolean,false) else false end,nullif(payload->>'scheduledFor','')::timestamptz,'draft',public.current_profile_user_id(),delivery) returning * into saved;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_campaign_created','oaca_outreach_campaign',saved.id,jsonb_build_object('audience',audience,'deliveryChannel',delivery,'trackOpens',saved.track_opens),'oaca');
  return saved;
end $$;

create or replace function public.oaca_queue_campaign(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  campaign public.oaca_outreach_campaigns;
  target record;
  pref public.platform_notification_preferences;
  recipient public.oaca_campaign_recipients;
  destination text;
  eligible boolean;
  queued integer:=0;
  suppressed integer:=0;
  available timestamptz;
begin
  select * into campaign from public.oaca_outreach_campaigns where id=(payload->>'campaignId')::uuid for update;
  if not found or not public.oaca_can_manage_outreach(campaign.organization_id) then raise exception 'This campaign is outside your authorized scope' using errcode='42501'; end if;
  if campaign.status<>'draft' then raise exception 'Only a draft campaign can be queued' using errcode='23514'; end if;
  if campaign.media_file_id is not null and not exists(select 1 from public.platform_files f where f.id=campaign.media_file_id and f.scan_status='clean' and f.archived_at is null) then raise exception 'Campaign media must pass security scanning before delivery' using errcode='23514'; end if;
  for target in select distinct r.user_id from public.experience_role_assignments r where r.experience_key='oaca' and r.organization_id=campaign.organization_id and r.role='student' and r.revoked_at is null and public.oaca_student_matches_audience(r.user_id,campaign.organization_id,campaign.audience_spec) loop
    insert into public.platform_notifications(experience_key,user_id,event_id,category,title,body,deep_link,template_key,template_version,idempotency_key)
    values('oaca',target.user_id,campaign.event_id,'outreach_'||campaign.delivery_channel,left(campaign.subject,240),left(campaign.content->>'body',1000),case when campaign.event_id is null then '/app/compass' else '/app/compass?event='||campaign.event_id end,'oaca_campaign_'||campaign.delivery_channel,1,'campaign:'||campaign.id||':user:'||target.user_id||':in_app')
    on conflict(idempotency_key) do nothing;
    select * into pref from public.platform_notification_preferences where user_id=target.user_id;
    if campaign.delivery_channel='sms' then
      destination:=pref.verified_phone;
      eligible:=coalesce(pref.sms_enabled,false) and pref.phone_verified_at is not null and pref.sms_opted_out_at is null;
    else
      select i.email into destination from public.account_auth_identities i where i.canonical_user_id=target.user_id and i.is_primary and i.verified_at is not null limit 1;
      eligible:=destination is not null and coalesce(pref.email_enabled,true);
    end if;
    available:=greatest(coalesce(campaign.scheduled_for,now()),public.platform_quiet_hours_release(target.user_id));
    insert into public.oaca_campaign_recipients(campaign_id,user_id,destination_hash,delivery_status,suppression_reason)
    values(campaign.id,target.user_id,case when destination is null then null else encode(digest(case when campaign.delivery_channel='sms' then regexp_replace(destination,'[^0-9+]','','g') else lower(destination) end,'sha256'),'hex') end,case when eligible then 'queued' else 'suppressed' end,case when campaign.delivery_channel='sms' and pref.phone_verified_at is null then 'missing_verified_destination' when campaign.delivery_channel='sms' and pref.sms_opted_out_at is not null then 'opted_out' when campaign.delivery_channel='sms' and not coalesce(pref.sms_enabled,false) then 'preference_disabled' when campaign.delivery_channel='email' and destination is null then 'no_verified_email' when campaign.delivery_channel='email' and not coalesce(pref.email_enabled,true) then 'email_disabled' end)
    on conflict(campaign_id,user_id) do update set destination_hash=excluded.destination_hash,delivery_status=excluded.delivery_status,suppression_reason=excluded.suppression_reason returning * into recipient;
    if recipient.delivery_status='queued' then
      queued:=queued+1;
      insert into public.oaca_delivery_jobs(job_kind,campaign_recipient_id,channel,idempotency_key,available_at) values('campaign_'||campaign.delivery_channel,recipient.id,campaign.delivery_channel,'campaign:'||campaign.id||':recipient:'||target.user_id||':'||campaign.delivery_channel,available) on conflict(idempotency_key) do nothing;
    else suppressed:=suppressed+1; end if;
    insert into public.platform_delivery_attempts(user_id,experience_key,channel,template_key,template_version,destination_hash,status,metadata) values(target.user_id,'oaca',campaign.delivery_channel,'oaca_campaign_'||campaign.delivery_channel,1,recipient.destination_hash,case when recipient.delivery_status='queued' then 'queued' else 'suppressed' end,jsonb_build_object('campaignId',campaign.id,'reason',recipient.suppression_reason));
  end loop;
  update public.oaca_outreach_campaigns set status=case when scheduled_for is not null and scheduled_for>now() then 'scheduled' else 'queued' end,recipient_count=queued+suppressed,queued_at=now(),updated_at=now() where id=campaign.id;
  if campaign.form_id is not null then update public.oaca_forms set status='published',updated_at=now() where id=campaign.form_id; end if;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata,experience_key) values(campaign.organization_id,public.current_profile_user_id(),'oaca_campaign_queued','oaca_outreach_campaign',campaign.id,jsonb_build_object('deliveryChannel',campaign.delivery_channel,'recipientCount',queued+suppressed,'queued',queued,'suppressed',suppressed),'oaca');
  return jsonb_build_object('campaignId',campaign.id,'deliveryChannel',campaign.delivery_channel,'recipientCount',queued+suppressed,'queued',queued,'suppressed',suppressed);
end $$;

create or replace function public.oaca_campaign_insights(payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_active_organization(); minimum_group integer:=10; result jsonb;
begin
  if org is null or not public.oaca_can_view_outreach_insights(org) then raise exception 'Outreach insights capability and MFA are required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'subject',c.subject,'previewText',c.preview_text,'status',c.status,'deliveryChannel',c.delivery_channel,'audience',c.audience_spec,'scheduledFor',c.scheduled_for,'sentAt',c.sent_at,'content',c.content,'recipientCount',counts.recipients,'deliveredCount',counts.delivered,'openedCount',counts.opened,'clickedCount',counts.clicked,'formSubmittedCount',counts.forms,'eventRegisteredCount',counts.registrations,'appointmentRequestedCount',counts.appointments,'minimumGroupSize',minimum_group) order by c.created_at desc),'[]'::jsonb) into result
  from public.oaca_outreach_campaigns c cross join lateral (select count(*) recipients,count(*) filter(where r.delivered_at is not null) delivered,count(*) filter(where r.opened_at is not null) opened,count(*) filter(where r.clicked_at is not null) clicked,count(*) filter(where r.form_submitted_at is not null) forms,count(*) filter(where r.event_registered_at is not null) registrations,count(*) filter(where r.appointment_requested_at is not null) appointments from public.oaca_campaign_recipients r where r.campaign_id=c.id) counts where c.organization_id=org;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_outreach_insights_viewed','oaca_outreach_insights',jsonb_build_object('minimumGroupSize',minimum_group),'oaca');
  return result;
end $$;

commit;
