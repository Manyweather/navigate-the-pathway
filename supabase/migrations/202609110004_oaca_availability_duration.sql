begin;

create or replace function public.oaca_advisor_get_availability(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  workspace text:=coalesce(payload->>'workspace','academic');
  org uuid:=public.oaca_advisor_org(workspace);
  provider uuid;
  saved_settings jsonb;
begin
  select p.id into provider
  from public.oaca_providers p
  join public.oaca_provider_services ps on ps.provider_id=p.id
  join public.oaca_service_lines s on s.id=ps.service_line_id
  where p.user_id=public.current_profile_user_id()
    and p.organization_id=org
    and p.active
    and s.key=workspace||'_advising'
  limit 1;
  if provider is null then
    raise exception 'Provider record required' using errcode='42501';
  end if;
  select settings into saved_settings
  from public.oaca_advisor_availability_preferences
  where provider_id=provider;
  return coalesce(saved_settings,jsonb_build_object('defaultDurationMinutes',30,'blocks','[]'::jsonb));
end $$;

create or replace function public.oaca_advisor_save_availability(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  workspace text:=coalesce(payload->>'workspace','academic');
  org uuid:=public.oaca_advisor_org(workspace);
  provider uuid;
  duration integer:=coalesce((payload->>'defaultDurationMinutes')::integer,30);
  settings jsonb;
begin
  select p.id into provider
  from public.oaca_providers p
  join public.oaca_provider_services ps on ps.provider_id=p.id
  join public.oaca_service_lines s on s.id=ps.service_line_id
  where p.user_id=public.current_profile_user_id()
    and p.organization_id=org
    and p.active
    and s.key=workspace||'_advising'
  limit 1;
  if provider is null then
    raise exception 'Provider record required' using errcode='42501';
  end if;
  if duration<15 or duration>180 then
    raise exception 'Default appointment length must be between 15 and 180 minutes' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(payload->'blocks','null'::jsonb))<>'array' then
    raise exception 'Availability blocks must be an array' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements(payload->'blocks') block
    where jsonb_typeof(block->'weekdays')<>'array'
      or jsonb_array_length(block->'weekdays')=0
      or coalesce(block->>'startsAt','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(block->>'endsAt','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or block->>'startsAt'>=block->>'endsAt'
      or coalesce((block->>'durationMinutes')::integer,duration)<15
      or coalesce((block->>'durationMinutes')::integer,duration)>180
      or coalesce((block->>'bufferMinutes')::integer,0)<0
      or coalesce((block->>'bufferMinutes')::integer,0)>60
      or jsonb_typeof(block->'modalities')<>'array'
      or jsonb_array_length(block->'modalities')=0
  ) then
    raise exception 'Each availability block needs valid days, times, length, buffer, and formats' using errcode='22023';
  end if;
  settings:=jsonb_build_object(
    'defaultDurationMinutes',duration,
    'blocks',payload->'blocks'
  );
  insert into public.oaca_advisor_availability_preferences(provider_id,settings,updated_by)
  values(provider,settings,public.current_profile_user_id())
  on conflict(provider_id) do update
    set settings=excluded.settings,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata)
  values(org,public.current_profile_user_id(),'oaca_advisor_availability_updated','oaca_provider',provider,jsonb_build_object('experienceKey','oaca','workspace',workspace,'blockCount',jsonb_array_length(payload->'blocks'),'defaultDurationMinutes',duration));
  return settings||jsonb_build_object('providerId',provider,'status','saved');
end $$;

create or replace function public.oaca_advisor_schedule(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare workspace text:=coalesce(payload->>'workspace','academic'); org uuid; actor uuid:=public.current_profile_user_id(); provider public.oaca_providers%rowtype; service public.oaca_service_lines%rowtype; student uuid; start_time timestamptz; end_time timestamptz; recurrence text:=coalesce(payload->>'recurrence','none'); occurrences integer:=case when recurrence='none' then 1 else least(24,greatest(2,coalesce((payload->>'recurrenceCount')::integer,2))) end; series uuid; idx integer; saved public.oaca_appointments%rowtype; conflicts boolean; allow_conflict boolean:=coalesce((payload->>'allowConflict')::boolean,false); confirmation text:=coalesce(payload->>'confirmationMode','confirmed'); block_key text; dropin_count integer; duration_minutes integer:=coalesce((payload->>'durationMinutes')::integer,30);
begin
  perform public.require_experience_membership('oaca'); org:=public.oaca_advisor_org(workspace);
  begin student:=(payload->>'studentId')::uuid; start_time:=(payload->>'startsAt')::timestamptz; exception when others then raise exception 'Choose a valid student and appointment time' using errcode='22023'; end;
  if duration_minutes<15 or duration_minutes>180 then raise exception 'Appointment length must be between 15 and 180 minutes' using errcode='22023'; end if;
  select p.* into provider from public.oaca_providers p join public.oaca_provider_services ps on ps.provider_id=p.id join public.oaca_service_lines s on s.id=ps.service_line_id where p.user_id=actor and p.organization_id=org and p.active and s.key=workspace||'_advising' limit 1;
  if not found then raise exception 'An active provider record is required to schedule' using errcode='42501'; end if;
  select * into service from public.oaca_service_lines where organization_id=org and key=workspace||'_advising';
  if not exists(select 1 from public.experience_role_assignments r where r.user_id=student and r.experience_key='oaca' and r.organization_id=org and r.role='student' and r.revoked_at is null) then raise exception 'Student is outside this Compass organization' using errcode='42501'; end if;
  if recurrence not in ('none','weekly','monthly') then raise exception 'Choose a valid recurrence' using errcode='22023'; end if;
  if workspace='academic' and not exists(select 1 from public.oaca_advisor_assignments a where a.student_id=student and a.provider_id=provider.id and a.ended_at is null) then
    select coalesce(exam_block_key,to_char(start_time,'YYYY-MM')) into block_key from public.oaca_student_program_contexts where student_id=student;
    select count(*) into dropin_count from public.oaca_appointments a join public.oaca_service_lines s on s.id=a.service_line_id where a.student_id=student and s.key='academic_advising' and not exists(select 1 from public.oaca_advisor_assignments permanent where permanent.student_id=student and permanent.provider_id=a.provider_id and permanent.ended_at is null) and coalesce(a.policy_context->>'dropInBlockKey',to_char(a.starts_at,'YYYY-MM'))=block_key and a.status in ('pending_approval','counterproposed','confirmed','completed');
    if dropin_count+occurrences>2 and not coalesce((payload->>'overrideLimit')::boolean,false) then raise exception 'This student has reached the two academic drop-ins allowed for the block. Confirm an advisor override to continue.' using errcode='23514'; end if;
  end if;
  if recurrence<>'none' then insert into public.oaca_appointment_series(organization_id,service_line_id,student_id,provider_id,recurrence,occurrence_count,created_by) values(org,service.id,student,provider.id,recurrence,occurrences,actor) returning id into series; end if;
  for idx in 1..occurrences loop
    end_time:=start_time+make_interval(mins=>duration_minutes);
    select exists(select 1 from public.oaca_appointments a where a.provider_id=provider.id and a.status='confirmed' and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(start_time,end_time,'[)')) into conflicts;
    if conflicts and not allow_conflict then raise exception 'Scheduling conflict detected. Review it, then explicitly confirm the override to double-book.' using errcode='23505'; end if;
    insert into public.oaca_appointments(organization_id,student_id,provider_id,service_line_id,subject,format,modality,starts_at,ends_at,status,sandbox,created_by,request_origin,policy_context,series_id,series_sequence,confirmation_mode,scheduling_override,conflict_acknowledged_at)
    values(org,student,provider.id,service.id,nullif(left(coalesce(payload->>'topic',''),240),''),'individual',coalesce(payload->>'modality','teams'),start_time,end_time,case when confirmation='student_confirmation' then 'pending_approval' else 'confirmed' end,true,actor,'advisor',jsonb_build_object('dropInBlockKey',block_key,'durationMinutes',duration_minutes),series,idx,case when confirmation='student_confirmation' then 'student_confirmation' else 'advisor_confirmation' end,coalesce((payload->>'overrideLimit')::boolean,false),case when conflicts and allow_conflict then now() end) returning * into saved;
    insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(org,actor,'oaca_advisor_appointment_created','oaca_appointment',saved.id,jsonb_build_object('experienceKey','oaca','workspace',workspace,'studentId',student,'seriesId',series,'durationMinutes',duration_minutes,'conflictOverride',conflicts and allow_conflict));
    start_time:=case recurrence when 'weekly' then start_time+interval '7 days' when 'monthly' then start_time+interval '1 month' else start_time end;
  end loop;
  return jsonb_build_object('id',saved.id,'status',saved.status,'seriesId',series,'occurrenceCount',occurrences,'durationMinutes',duration_minutes);
end $$;

create or replace function public.oaca_advisor_reschedule(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.oaca_appointments%rowtype; next_start timestamptz; next_end timestamptz; conflict boolean; actor uuid:=public.current_profile_user_id(); duration_minutes integer;
begin
  select a.* into saved from public.oaca_appointments a where a.id=(payload->>'appointmentId')::uuid and public.oaca_is_active_advisor(a.organization_id); if not found then raise exception 'Appointment not found' using errcode='42501'; end if;
  duration_minutes:=coalesce((payload->>'durationMinutes')::integer,greatest(15,round(extract(epoch from (saved.ends_at-saved.starts_at))/60)::integer),30);
  if duration_minutes<15 or duration_minutes>180 then raise exception 'Appointment length must be between 15 and 180 minutes' using errcode='22023'; end if;
  next_start:=(payload->>'startsAt')::timestamptz; next_end:=next_start+make_interval(mins=>duration_minutes);
  select exists(select 1 from public.oaca_appointments a where a.provider_id=saved.provider_id and a.id<>saved.id and a.status='confirmed' and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(next_start,next_end,'[)')) into conflict;
  if conflict and not coalesce((payload->>'allowConflict')::boolean,false) then raise exception 'Scheduling conflict detected. Explicitly confirm the override to continue.' using errcode='23505'; end if;
  update public.oaca_appointments set prior_confirmed_starts_at=starts_at,prior_confirmed_ends_at=ends_at,starts_at=next_start,ends_at=next_end,status='confirmed',rescheduled_by=actor,conflict_acknowledged_at=case when conflict then now() end,updated_at=now() where id=saved.id returning * into saved;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(saved.organization_id,actor,'oaca_appointment_rescheduled_by_advisor','oaca_appointment',saved.id,jsonb_build_object('experienceKey','oaca','durationMinutes',duration_minutes,'conflictOverride',conflict));
  return jsonb_build_object('id',saved.id,'status',saved.status,'startsAt',saved.starts_at,'endsAt',saved.ends_at,'durationMinutes',duration_minutes);
end $$;

revoke all on function public.oaca_advisor_get_availability(jsonb) from public,anon;
grant execute on function public.oaca_advisor_get_availability(jsonb) to authenticated;

commit;
