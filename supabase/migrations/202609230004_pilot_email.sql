begin;
alter table public.platform_notifications add column appointment_kind text;
alter table public.platform_notifications add column appointment_id uuid;
alter table public.platform_notification_deliveries add column lease_token uuid;
alter table public.platform_notification_deliveries add column lease_until timestamptz;
alter table public.platform_notification_deliveries add column operation_id uuid not null default gen_random_uuid();
alter table public.platform_notification_deliveries add column delivery_expires_at timestamptz;

create function public.pilot_appointment_notifications() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient uuid; recipients uuid[]; kind text; category text; notice uuid; generation text; at_time timestamptz; lead integer; confirmed boolean; who uuid;
begin
 kind:=case when tg_table_name='oaca_appointments' then 'compass' else 'pathway' end;
 if kind='compass' then
  -- Browser demos never touch this database. Synthetic DB fixtures stay silent too.
  if new.sandbox then return new;end if;
  select user_id into who from public.oaca_providers where id=new.provider_id;
  recipients:=array[new.student_id,who];confirmed:=new.status='confirmed';
 else recipients:=array[new.requester_id,new.recipient_id];confirmed:=new.status='accepted';end if;
 if tg_op='UPDATE' and new.status=old.status and new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at then return new;end if;
 generation:=gen_random_uuid()::text;
 update public.platform_notification_deliveries d set status='cancelled',lease_token=null,lease_until=null,updated_at=now() from public.platform_notifications n where n.id=d.notification_id and n.appointment_kind=kind and n.appointment_id=new.id and d.status='queued';
 category:=case when new.status='cancelled' then 'cancellation' when new.status='declined' then 'declined' when confirmed then case when tg_op='UPDATE' and old.status in ('confirmed','accepted') then 'event_change' else 'appointment_confirmation' end else 'request_received' end;
 foreach recipient in array recipients loop
  if recipient is null then continue;end if;
  insert into public.platform_notifications(experience_key,user_id,category,title,body,deep_link,template_key,idempotency_key,appointment_kind,appointment_id)
  values(case when kind='compass' then 'oaca' else 'pathway' end,recipient,category,case category when 'request_received' then 'Appointment request received' when 'appointment_confirmation' then 'Appointment confirmed' when 'event_change' then 'Appointment changed' when 'declined' then 'Appointment request declined' else 'Appointment cancelled' end,'Sign in to review the latest appointment details.','/app/'||kind,'pilot_logistics','appointment:'||generation||':'||recipient,kind,new.id) returning id into notice;
  insert into public.platform_notification_deliveries(notification_id,channel,status,idempotency_key) values(notice,'email','queued','appointment:'||generation||':'||recipient);
  if confirmed then foreach lead in array array[1440,60] loop
   at_time:=new.starts_at-make_interval(mins=>lead);if at_time<=now() then continue;end if;
   insert into public.platform_notifications(experience_key,user_id,category,title,body,deep_link,template_key,idempotency_key,appointment_kind,appointment_id)
   values(case when kind='compass' then 'oaca' else 'pathway' end,recipient,'reminder','Appointment reminder','Sign in to review your upcoming appointment.','/app/'||kind,'pilot_logistics','reminder:'||generation||':'||recipient||':'||lead,kind,new.id) returning id into notice;
   insert into public.platform_notification_deliveries(notification_id,channel,status,available_at,delivery_expires_at,idempotency_key) values(notice,'email','queued',at_time,new.starts_at,'reminder:'||generation||':'||recipient||':'||lead);
  end loop;end if;
 end loop;
 return new;
end $$;
create trigger pilot_oaca_email after insert or update on public.oaca_appointments for each row execute function public.pilot_appointment_notifications();
create trigger pilot_pathway_email after insert or update on public.pathway_appointments for each row execute function public.pilot_appointment_notifications();
revoke all on function public.pilot_appointment_notifications() from public,anon,authenticated;

create function public.pilot_claim_email() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.platform_notification_deliveries; n public.platform_notifications; recipient text;
begin
 update public.platform_notification_deliveries set status='cancelled',updated_at=now() where channel='email' and status='queued' and delivery_expires_at<=now();
 select * into d from public.platform_notification_deliveries where channel='email' and status='queued' and available_at<=now() and attempts<5 and (lease_until is null or lease_until<now()) order by available_at for update skip locked limit 1;
 if not found then return 'null';end if;
 select * into n from public.platform_notifications where id=d.notification_id;
 -- Historical event imports must never replay invitations or reminders.
 if n.event_id is not null and exists(select 1 from public.oaca_events e where e.id=n.event_id and (e.starts_at<now() and n.category in ('reminder','publication','registration_confirmation') or e.source_system is not null)) then
  update public.platform_notification_deliveries set status='suppressed',suppression_reason='historical_event',updated_at=now() where id=d.id;return 'null';
 end if;
 select lower(a.email) into recipient from auth.users a join public.profiles p on p.user_id=a.id where a.id=n.user_id and p.status='active' and a.email_confirmed_at is not null;
 if recipient is null or exists(select 1 from public.platform_notification_preferences where user_id=n.user_id and not email_enabled) then
  update public.platform_notification_deliveries set status='suppressed',suppression_reason='recipient_unavailable_or_disabled',updated_at=now() where id=d.id;return 'null';
 end if;
 update public.platform_notification_deliveries set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() where id=d.id returning * into d;
 return jsonb_build_object('id',d.id,'leaseToken',d.lease_token,'operationId',d.operation_id,'recipient',recipient,'category',n.category,'deepLink',n.deep_link,'attempts',d.attempts);
end $$;
create function public.pilot_finish_email(payload jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.platform_notification_deliveries set status=case when payload->>'status'='sent' then 'sent' when payload->>'status'='suppressed' then 'suppressed' when attempts>=5 then 'failed' else 'queued' end,
 provider_message_id=case when payload->>'status'='sent' then operation_id::text else provider_message_id end,
 last_error_code=left(payload->>'code',100),suppression_reason=case when payload->>'status'='suppressed' then left(payload->>'code',100) else suppression_reason end,
 available_at=now()+make_interval(secs=>least(3600,60*power(2,attempts)::integer)),lease_token=null,lease_until=null,updated_at=now()
 where id=(payload->>'id')::uuid and lease_token=(payload->>'leaseToken')::uuid and status='queued';
end $$;
revoke all on function public.pilot_claim_email(),public.pilot_finish_email(jsonb) from public,anon,authenticated;
grant execute on function public.pilot_claim_email(),public.pilot_finish_email(jsonb) to service_role;
commit;
