-- OACA student booking refinements: academic drop-ins and durable student check-in QR codes.
-- Additive only. Existing one-time QR tokens remain valid until their original expiry.

create or replace function public.oaca_enforce_academic_drop_in()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  service_key text;
  requested_provider uuid;
  assigned_provider uuid;
  block_key text:=trim(coalesce(new.policy_context->>'academicBlockKey',''));
  existing_drop_ins integer:=0;
begin
  select key into service_key from public.oaca_service_lines where id=new.service_line_id;
  if service_key<>'academic_advising'
    or new.request_origin<>'student'
    or not coalesce((new.policy_context->>'academicDropIn')::boolean,false) then
    return new;
  end if;

  if block_key='' then
    raise exception 'Enter the current academic block for a drop-in visit' using errcode='22023';
  end if;
  if coalesce(new.policy_context->>'academicDropInProviderId','') !~* '^[0-9a-f-]{36}$' then
    raise exception 'Choose an academic advisor for the drop-in visit' using errcode='22023';
  end if;
  requested_provider:=(new.policy_context->>'academicDropInProviderId')::uuid;

  select a.provider_id into assigned_provider
  from public.oaca_advisor_assignments a
  where a.student_id=new.student_id and a.ended_at is null
  order by a.assigned_at desc
  limit 1;

  if requested_provider=assigned_provider then
    raise exception 'Use the assigned-advisor option for this advisor' using errcode='23514';
  end if;
  if not exists(
    select 1
    from public.oaca_provider_services ps
    join public.oaca_providers p on p.id=ps.provider_id
    where ps.provider_id=requested_provider
      and ps.service_line_id=new.service_line_id
      and p.organization_id=new.organization_id
      and p.classification in ('faculty','staff')
      and p.active
  ) then
    raise exception 'The selected academic advisor is not available for drop-ins' using errcode='23514';
  end if;

  select count(*) into existing_drop_ins
  from public.oaca_appointments appointment
  where appointment.student_id=new.student_id
    and appointment.service_line_id=new.service_line_id
    and coalesce((appointment.policy_context->>'academicDropIn')::boolean,false)
    and lower(trim(coalesce(appointment.policy_context->>'academicBlockKey','')))=lower(block_key)
    and appointment.status in ('pending_approval','counterproposed','confirmed','completed','no_show');

  if existing_drop_ins>=2 then
    raise exception 'Academic drop-ins are limited to two visits per academic block' using errcode='23514';
  end if;

  new.provider_id:=requested_provider;
  return new;
end $$;

drop trigger if exists oaca_enforce_academic_drop_in_before_insert on public.oaca_appointments;
create trigger oaca_enforce_academic_drop_in_before_insert
before insert on public.oaca_appointments
for each row execute function public.oaca_enforce_academic_drop_in();

alter table public.oaca_student_qr_tokens
  add column if not exists permanent boolean not null default false,
  add column if not exists token_secret text,
  add column if not exists revoked_at timestamptz;

create unique index if not exists oaca_one_active_permanent_student_qr
on public.oaca_student_qr_tokens(student_id)
where permanent and revoked_at is null;

comment on column public.oaca_student_qr_tokens.token_secret is
'Private opaque QR secret returned only through the security-definer student RPC. Direct authenticated table access is revoked.';

create or replace function public.oaca_issue_student_qr(payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  actor uuid:=public.current_profile_user_id();
  raw_token text;
  saved public.oaca_student_qr_tokens;
begin
  perform public.require_experience_membership('oaca');
  if not exists(
    select 1
    from public.experience_role_assignments r
    join public.profiles p on p.user_id=r.user_id
    where r.user_id=actor and r.experience_key='oaca' and r.role='student'
      and r.revoked_at is null and p.status='active'
  ) then
    raise exception 'Active student access is required' using errcode='42501';
  end if;

  select * into saved
  from public.oaca_student_qr_tokens
  where student_id=actor and permanent and revoked_at is null
  order by created_at desc
  limit 1;
  if found then
    return jsonb_build_object('token',saved.token_secret,'permanent',true);
  end if;

  raw_token:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into public.oaca_student_qr_tokens(student_id,token_hash,token_secret,expires_at,permanent)
  values(actor,encode(digest(raw_token,'sha256'),'hex'),raw_token,'infinity'::timestamptz,true)
  returning * into saved;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata)
  values(actor,'oaca_student_qr_issued','oaca_student_qr_token',saved.id,jsonb_build_object('experienceKey','oaca','permanent',true));
  return jsonb_build_object('token',raw_token,'permanent',true);
end $$;

create or replace function public.oaca_scan_student_qr(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  token_record public.oaca_student_qr_tokens;
  target_event uuid:=(payload->>'eventId')::uuid;
  event_record public.oaca_events;
  current public.oaca_event_registrations;
  old_status text:='not_recorded';
  old_version integer:=0;
begin
  if not public.oaca_can_manage_event(target_event) then
    raise exception 'Only assigned event staff can scan student codes' using errcode='42501';
  end if;
  select * into token_record
  from public.oaca_student_qr_tokens
  where token_hash=encode(digest(payload->>'token','sha256'),'hex')
    and revoked_at is null
    and ((permanent and expires_at>now()) or (not permanent and redeemed_at is null and expires_at>now()))
  for update;
  if not found then raise exception 'This student code is unavailable' using errcode='42501'; end if;

  select * into event_record from public.oaca_events where id=target_event;
  if not found or not public.oaca_student_matches_audience(token_record.student_id,event_record.organization_id,event_record.audience_spec) then
    raise exception 'This student cannot check in to this event' using errcode='42501';
  end if;

  select * into current from public.oaca_event_registrations
  where event_id=target_event and student_id=token_record.student_id
  for update;
  if found and current.attendance_status='present' then
    return jsonb_build_object('ok',true,'studentId',token_record.student_id,'status','present','version',current.attendance_version,'deduplicated',true);
  end if;
  if found then old_status:=current.attendance_status; old_version:=current.attendance_version; end if;

  insert into public.oaca_event_registrations(event_id,student_id,status,registration_source,attendance_status,attendance_source,attendance_marked_by,attendance_marked_at,attendance_version)
  values(target_event,token_record.student_id,'attended','walk_in','present','staff_qr',public.current_profile_user_id(),now(),1)
  on conflict(event_id,student_id) do update
    set status='attended',attendance_status='present',attendance_source='staff_qr',attendance_marked_by=public.current_profile_user_id(),attendance_marked_at=now(),attendance_version=oaca_event_registrations.attendance_version+1,updated_at=now()
  returning * into current;

  if not token_record.permanent then
    update public.oaca_student_qr_tokens
    set redeemed_event_id=target_event,redeemed_by=public.current_profile_user_id(),redeemed_at=now()
    where id=token_record.id;
  end if;
  if old_status is distinct from 'present' then
    insert into public.oaca_event_attendance_changes(event_id,student_id,old_status,new_status,old_version,new_version,changed_by,change_source)
    values(target_event,token_record.student_id,old_status,'present',old_version,current.attendance_version,public.current_profile_user_id(),'staff_qr');
  end if;
  return jsonb_build_object('ok',true,'studentId',token_record.student_id,'status','present','version',current.attendance_version,'deduplicated',false);
end $$;

revoke all on function public.oaca_enforce_academic_drop_in(),public.oaca_issue_student_qr(jsonb),public.oaca_scan_student_qr(jsonb) from public,anon;
grant execute on function public.oaca_issue_student_qr(jsonb),public.oaca_scan_student_qr(jsonb) to authenticated;
