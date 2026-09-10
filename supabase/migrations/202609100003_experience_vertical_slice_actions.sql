begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('platform-files','platform-files',false,26214400,array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg','image/png'
])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists platform_files_storage_insert on storage.objects;
create policy platform_files_storage_insert on storage.objects for insert to authenticated
with check (bucket_id='platform-files' and (storage.foldername(name))[1]=public.current_profile_user_id()::text and (storage.foldername(name))[2] in ('pathway','oaca','genesis'));
drop policy if exists platform_files_storage_owner_read on storage.objects;
create policy platform_files_storage_owner_read on storage.objects for select to authenticated
using (bucket_id='platform-files' and (storage.foldername(name))[1]=public.current_profile_user_id()::text);

create or replace function public.oaca_create_appointment(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  service public.oaca_service_lines%rowtype;
  chosen_provider uuid;
  requested_start timestamptz;
  requested_end timestamptz;
  requested_modality text := coalesce(payload->>'modality','');
  requested_format text := coalesce(payload->>'format','individual');
  result public.oaca_appointments%rowtype;
  sandbox_required boolean;
begin
  perform public.require_experience_membership('oaca');
  if not exists (select 1 from public.experience_role_assignments where user_id=public.current_profile_user_id() and experience_key='oaca' and role='student' and revoked_at is null)
  then raise exception 'OACA student role required' using errcode='42501'; end if;
  if coalesce(payload->>'serviceLineId','') !~* '^[0-9a-f-]{36}$' then raise exception 'Choose a valid service' using errcode='22023'; end if;
  select * into service from public.oaca_service_lines where id=(payload->>'serviceLineId')::uuid;
  if not found then raise exception 'Service not found' using errcode='22023'; end if;
  if not exists (select 1 from public.experience_role_assignments where user_id=public.current_profile_user_id() and experience_key='oaca' and organization_id=service.organization_id and revoked_at is null)
  then raise exception 'Service is outside your assignment' using errcode='42501'; end if;
  if requested_modality <> all(service.modalities) then raise exception 'Modality is not enabled for this service' using errcode='22023'; end if;
  if requested_format not in ('individual','small_group','drop_in') then raise exception 'Choose a valid format' using errcode='22023'; end if;
  begin requested_start := (payload->>'startsAt')::timestamptz; exception when others then raise exception 'Choose a valid appointment time' using errcode='22023'; end;
  if requested_start < now() then raise exception 'Choose a future appointment time' using errcode='22023'; end if;
  requested_end := requested_start + make_interval(mins=>coalesce(service.duration_minutes,30));
  if service.provider_rule='assigned' then
    select a.provider_id into chosen_provider from public.oaca_advisor_assignments a join public.oaca_providers p on p.id=a.provider_id
    where a.student_id=public.current_profile_user_id() and a.ended_at is null and p.active and p.organization_id=service.organization_id order by a.assigned_at desc limit 1;
    if chosen_provider is null then raise exception 'Your permanent academic advisor assignment is pending' using errcode='23514'; end if;
  elsif nullif(payload->>'providerId','') is not null then
    chosen_provider := (payload->>'providerId')::uuid;
    if not exists (select 1 from public.oaca_provider_services ps join public.oaca_providers p on p.id=ps.provider_id where ps.provider_id=chosen_provider and ps.service_line_id=service.id and p.active)
    then raise exception 'Provider is not eligible for this service' using errcode='23514'; end if;
  end if;
  sandbox_required := service.policy_status <> 'live_approved' or coalesce((select sandbox_only from public.experience_feature_flags where experience_key='oaca'),true);
  insert into public.oaca_appointments (organization_id,student_id,provider_id,service_line_id,subject,format,modality,starts_at,ends_at,preparation_note,status,sandbox)
  values (service.organization_id,public.current_profile_user_id(),chosen_provider,service.id,nullif(left(coalesce(payload->>'topic',''),240),''),requested_format,requested_modality,requested_start,requested_end,left(coalesce(payload->>'preparationNote',''),3000),'pending_approval',sandbox_required)
  returning * into result;
  insert into public.audit_events (organization_id,actor_id,event_type,subject_type,subject_id,metadata)
  values (service.organization_id,public.current_profile_user_id(),'oaca_appointment_requested','oaca_appointment',result.id,jsonb_build_object('experienceKey','oaca','sandbox',sandbox_required,'serviceLineId',service.id));
  return jsonb_build_object('id',result.id,'status',result.status,'sandbox',result.sandbox,'startsAt',result.starts_at,'endsAt',result.ends_at);
end $$;

create or replace function public.genesis_save_reflection(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  selected_org public.genesis_organizations%rowtype;
  portfolio public.genesis_portfolios%rowtype;
  version_row public.genesis_portfolio_versions%rowtype;
  step_key text := coalesce(payload->>'stepKey','');
  source jsonb := payload->'source';
begin
  perform public.require_experience_membership('genesis');
  if not exists (select 1 from public.experience_role_assignments where user_id=public.current_profile_user_id() and experience_key='genesis' and role='student' and revoked_at is null)
  then raise exception 'GENESIS student role required' using errcode='42501'; end if;
  if step_key not in ('point_of_view','problem_of_practice','community_context','theory_of_change','sustainability') then raise exception 'Choose a valid journey step' using errcode='22023'; end if;
  if coalesce(payload->>'organizationId','') !~* '^[0-9a-f-]{36}$' then raise exception 'Choose an available organization' using errcode='22023'; end if;
  select * into selected_org from public.genesis_organizations where id=(payload->>'organizationId')::uuid and archived_at is null and pilot_available;
  if not found then raise exception 'This organization is not yet available in the pilot' using errcode='42501'; end if;
  select * into portfolio from public.genesis_portfolios where owner_id=public.current_profile_user_id() and organization_id=selected_org.id and archived_at is null;
  if not found then
    insert into public.genesis_portfolios(owner_id,organization_id,title) values(public.current_profile_user_id(),selected_org.id,selected_org.name||' community initiative') returning * into portfolio;
  end if;
  select * into version_row from public.genesis_portfolio_versions where portfolio_id=portfolio.id and version=portfolio.current_version;
  if not found or version_row.status <> 'draft' then
    update public.genesis_portfolios set current_version=current_version+1,updated_at=now() where id=portfolio.id returning * into portfolio;
    insert into public.genesis_portfolio_versions(portfolio_id,version,content,status)
    values(portfolio.id,portfolio.current_version,coalesce(version_row.content,'{}'::jsonb)||jsonb_build_object(step_key,left(coalesce(payload->>'response',''),20000)),'draft') returning * into version_row;
  else
    update public.genesis_portfolio_versions set content=content||jsonb_build_object(step_key,left(coalesce(payload->>'response',''),20000)) where id=version_row.id returning * into version_row;
  end if;
  if source is not null and step_key='problem_of_practice' and nullif(source->>'title','') is not null then
    insert into public.genesis_sources(portfolio_version_id,title,url,publication_date,geography,population,limitations,claim)
    values(version_row.id,left(source->>'title',500),nullif(left(source->>'url',2000),''),nullif(source->>'date','')::date,left(coalesce(source->>'geography',''),240),left(coalesce(source->>'population',''),500),left(coalesce(source->>'limitations',''),4000),left(coalesce(source->>'claim',''),4000));
  end if;
  update public.genesis_portfolios set updated_at=now() where id=portfolio.id;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata)
  values(public.current_profile_user_id(),'genesis_reflection_saved','genesis_portfolio',portfolio.id,jsonb_build_object('experienceKey','genesis','stepKey',step_key,'version',portfolio.current_version));
  return jsonb_build_object('portfolioId',portfolio.id,'version',portfolio.current_version,'status','draft');
end $$;

create or replace function public.genesis_submit_review(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare portfolio public.genesis_portfolios%rowtype; result public.genesis_portfolio_versions%rowtype;
begin
  perform public.require_experience_membership('genesis');
  select * into portfolio from public.genesis_portfolios where id=(payload->>'portfolioId')::uuid and owner_id=public.current_profile_user_id() and archived_at is null;
  if not found then raise exception 'Portfolio not found' using errcode='42501'; end if;
  update public.genesis_portfolio_versions set status='submitted',submitted_at=now() where portfolio_id=portfolio.id and version=portfolio.current_version and status='draft' returning * into result;
  if not found then raise exception 'Only a draft version can be submitted' using errcode='23514'; end if;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata) values(public.current_profile_user_id(),'genesis_version_submitted','genesis_portfolio_version',result.id,jsonb_build_object('experienceKey','genesis','version',result.version));
  return jsonb_build_object('portfolioId',portfolio.id,'version',result.version,'status',result.status);
end $$;

create or replace function public.genesis_publish_snapshot(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare portfolio public.genesis_portfolios%rowtype; version_row public.genesis_portfolio_versions%rowtype; initiative public.genesis_initiatives%rowtype; snapshot public.genesis_snapshots%rowtype; author_name text;
begin
  perform public.require_experience_membership('genesis');
  select * into portfolio from public.genesis_portfolios where id=(payload->>'portfolioId')::uuid and owner_id=public.current_profile_user_id() and archived_at is null;
  if not found then raise exception 'Portfolio not found' using errcode='42501'; end if;
  if not exists(select 1 from public.genesis_organization_memberships where organization_id=portfolio.organization_id and user_id=public.current_profile_user_id() and role='student' and status='approved')
  then raise exception 'Approved organization membership is required to publish' using errcode='42501'; end if;
  select * into version_row from public.genesis_portfolio_versions where portfolio_id=portfolio.id and version=portfolio.current_version and status='reviewed';
  if not found then raise exception 'Mentor review is required before publication' using errcode='23514'; end if;
  select * into initiative from public.genesis_initiatives where organization_id=portfolio.organization_id and created_by=public.current_profile_user_id() and archived_at is null order by created_at limit 1;
  if not found then insert into public.genesis_initiatives(organization_id,created_by,title,summary,status) values(portfolio.organization_id,public.current_profile_user_id(),left(coalesce(nullif(payload->>'title',''),portfolio.title),300),'','active') returning * into initiative; end if;
  select display_name into author_name from public.profiles where user_id=public.current_profile_user_id();
  insert into public.genesis_snapshots(initiative_id,portfolio_version_id,published_by,attribution,content)
  values(initiative.id,version_row.id,public.current_profile_user_id(),jsonb_build_object('authorId',public.current_profile_user_id(),'authorName',author_name,'portfolioVersion',version_row.version),version_row.content||jsonb_build_object('title',left(coalesce(nullif(payload->>'title',''),portfolio.title),300))) returning * into snapshot;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata) values(public.current_profile_user_id(),'genesis_snapshot_published','genesis_snapshot',snapshot.id,jsonb_build_object('experienceKey','genesis','initiativeId',initiative.id));
  return jsonb_build_object('id',snapshot.id,'initiativeId',initiative.id,'publishedAt',snapshot.published_at);
end $$;

create or replace function public.genesis_create_handoff(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare snapshot public.genesis_snapshots%rowtype; handoff public.genesis_handoffs%rowtype;
begin
  perform public.require_experience_membership('genesis');
  select s.* into snapshot from public.genesis_snapshots s join public.genesis_initiatives i on i.id=s.initiative_id where s.id=(payload->>'snapshotId')::uuid and i.created_by=public.current_profile_user_id();
  if not found then raise exception 'Published snapshot not found' using errcode='42501'; end if;
  if coalesce(payload->>'nextStewardEmail','') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid next steward email' using errcode='22023'; end if;
  insert into public.genesis_handoffs(initiative_id,snapshot_id,from_user_id,next_steward_email,open_decisions,recommended_actions,status)
  values(snapshot.initiative_id,snapshot.id,public.current_profile_user_id(),lower(payload->>'nextStewardEmail'),coalesce(payload->'openDecisions','[]'::jsonb),coalesce(payload->'recommendedActions','[]'::jsonb),'offered') returning * into handoff;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata) values(public.current_profile_user_id(),'genesis_handoff_offered','genesis_handoff',handoff.id,jsonb_build_object('experienceKey','genesis','snapshotId',snapshot.id));
  return jsonb_build_object('id',handoff.id,'status',handoff.status);
end $$;

create or replace function public.genesis_create_event(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare initiative public.genesis_initiatives%rowtype; event_row public.genesis_events%rowtype;
begin
  perform public.require_experience_membership('genesis');
  select * into initiative from public.genesis_initiatives where created_by=public.current_profile_user_id() and archived_at is null order by created_at limit 1;
  if not found then raise exception 'Publish a reviewed initiative snapshot before designing an event' using errcode='23514'; end if;
  if length(trim(coalesce(payload->>'title','')))<3 or length(trim(coalesce(payload->>'objective','')))<3 or length(trim(coalesce(payload->>'audience','')))<2 then raise exception 'Title, objective, and audience are required' using errcode='22023'; end if;
  insert into public.genesis_events(initiative_id,created_by,title,objective,audience,community_partner,venue,modality,starts_at,accessibility,capacity,budget,safety_considerations,communications,evaluation_measures,status)
  values(initiative.id,public.current_profile_user_id(),left(payload->>'title',300),left(payload->>'objective',4000),left(payload->>'audience',1000),nullif(left(coalesce(payload->>'partner',''),500),''),nullif(left(coalesce(payload->>'venue',''),500),''),coalesce(payload->>'modality','in_person'),nullif(payload->>'startsAt','')::timestamptz,left(coalesce(payload->>'accessibility',''),4000),nullif(payload->>'capacity','')::integer,jsonb_build_object('notes',left(coalesce(payload->>'budget',''),4000)),left(coalesce(payload->>'safety',''),4000),left(coalesce(payload->>'communications',''),4000),jsonb_build_array(left(coalesce(payload->>'measures',''),4000)),'draft') returning * into event_row;
  return jsonb_build_object('id',event_row.id,'status',event_row.status);
end $$;

create or replace function public.oaca_change_appointment(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  appointment public.oaca_appointments%rowtype;
  provider_user uuid;
  decision text := coalesce(payload->>'decision','');
  replacement_start timestamptz;
  replacement_end timestamptz;
  duration interval;
begin
  perform public.require_experience_membership('oaca');
  select a.* into appointment from public.oaca_appointments a where a.id=(payload->>'appointmentId')::uuid;
  if not found then raise exception 'This appointment is outside your assignment' using errcode='42501'; end if;
  select p.user_id into provider_user from public.oaca_providers p where p.id=appointment.provider_id;
  if provider_user is distinct from public.current_profile_user_id() then raise exception 'This appointment is outside your assignment' using errcode='42501'; end if;
  if decision='confirm' then
    if appointment.status not in ('pending_approval','counterproposed') then raise exception 'This appointment cannot be confirmed from its current state' using errcode='23514'; end if;
    if exists(select 1 from public.oaca_appointments where provider_id=appointment.provider_id and id<>appointment.id and status='confirmed' and tstzrange(starts_at,ends_at,'[)') && tstzrange(appointment.starts_at,appointment.ends_at,'[)'))
    then raise exception 'This time is no longer available' using errcode='23505'; end if;
    update public.oaca_appointments set status='confirmed',updated_at=now() where id=appointment.id returning * into appointment;
  elsif decision='counterpropose' then
    if appointment.status not in ('pending_approval','confirmed') then raise exception 'This appointment cannot be counterproposed from its current state' using errcode='23514'; end if;
    begin replacement_start:=(payload->>'startsAt')::timestamptz; exception when others then raise exception 'Choose a valid replacement time' using errcode='22023'; end;
    if replacement_start<now() then raise exception 'Choose a future replacement time' using errcode='22023'; end if;
    duration:=appointment.ends_at-appointment.starts_at; replacement_end:=replacement_start+duration;
    update public.oaca_appointments set prior_confirmed_starts_at=case when status='confirmed' then starts_at else prior_confirmed_starts_at end,prior_confirmed_ends_at=case when status='confirmed' then ends_at else prior_confirmed_ends_at end,starts_at=replacement_start,ends_at=replacement_end,status='counterproposed',updated_at=now() where id=appointment.id returning * into appointment;
  elsif decision in ('decline','complete','no_show') then
    if decision='decline' and appointment.status not in ('pending_approval','counterproposed') then raise exception 'This appointment cannot be declined' using errcode='23514'; end if;
    if decision in ('complete','no_show') and appointment.status<>'confirmed' then raise exception 'Only confirmed appointments can be closed' using errcode='23514'; end if;
    update public.oaca_appointments set status=case decision when 'complete' then 'completed' else decision end,updated_at=now() where id=appointment.id returning * into appointment;
  else raise exception 'Choose a valid appointment decision' using errcode='22023';
  end if;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(appointment.organization_id,public.current_profile_user_id(),'oaca_appointment_'||decision,'oaca_appointment',appointment.id,jsonb_build_object('experienceKey','oaca','status',appointment.status));
  return jsonb_build_object('id',appointment.id,'status',appointment.status,'startsAt',appointment.starts_at,'priorConfirmedStartsAt',appointment.prior_confirmed_starts_at);
end $$;

create or replace function public.oaca_save_encounter(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare appointment public.oaca_appointments%rowtype; provider_user uuid; next_version integer; publish boolean:=coalesce((payload->>'publishRecap')::boolean,false);
begin
  perform public.require_experience_membership('oaca');
  select a.* into appointment from public.oaca_appointments a where a.id=(payload->>'appointmentId')::uuid;
  if not found then raise exception 'This encounter is outside your assignment' using errcode='42501'; end if;
  select p.user_id into provider_user from public.oaca_providers p where p.id=appointment.provider_id;
  if provider_user is distinct from public.current_profile_user_id() then raise exception 'This encounter is outside your assignment' using errcode='42501'; end if;
  if appointment.status not in ('confirmed','completed','no_show') then raise exception 'A confirmed appointment is required for encounter notes' using errcode='23514'; end if;
  select coalesce(max(version),0)+1 into next_version from public.oaca_record_revisions where appointment_id=appointment.id;
  insert into public.oaca_record_revisions(appointment_id,version,layer,content,created_by) values
    (appointment.id,next_version,'working_notes',jsonb_build_object('text',left(coalesce(payload->>'workingNotes',''),20000)),public.current_profile_user_id()),
    (appointment.id,next_version,'structured',coalesce(payload->'structuredData','{}'::jsonb),public.current_profile_user_id()),
    (appointment.id,next_version,'student_recap',jsonb_build_object('text',left(coalesce(payload->>'studentRecap',''),10000)),public.current_profile_user_id());
  insert into public.oaca_encounter_records(appointment_id,staff_working_notes,structured_data,student_recap,recap_published_at,recap_published_by,version,updated_at)
  values(appointment.id,left(coalesce(payload->>'workingNotes',''),20000),coalesce(payload->'structuredData','{}'::jsonb),left(coalesce(payload->>'studentRecap',''),10000),case when publish then now() end,case when publish then public.current_profile_user_id() end,next_version,now())
  on conflict(appointment_id) do update set staff_working_notes=excluded.staff_working_notes,structured_data=excluded.structured_data,student_recap=excluded.student_recap,recap_published_at=case when publish then now() else oaca_encounter_records.recap_published_at end,recap_published_by=case when publish then public.current_profile_user_id() else oaca_encounter_records.recap_published_by end,version=next_version,updated_at=now();
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(appointment.organization_id,public.current_profile_user_id(),case when publish then 'oaca_recap_published' else 'oaca_encounter_saved' end,'oaca_appointment',appointment.id,jsonb_build_object('experienceKey','oaca','version',next_version));
  return jsonb_build_object('appointmentId',appointment.id,'version',next_version,'recapPublished',publish);
end $$;

create or replace function public.genesis_review_decide(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare version_row public.genesis_portfolio_versions%rowtype; portfolio public.genesis_portfolios%rowtype; decision text:=coalesce(payload->>'decision','');
begin
  perform public.require_experience_membership('genesis');
  select * into portfolio from public.genesis_portfolios where id=(payload->>'portfolioId')::uuid and archived_at is null;
  if not found or not exists(select 1 from public.genesis_organization_memberships where organization_id=portfolio.organization_id and user_id=public.current_profile_user_id() and role in ('mentor','administrator') and status='approved')
  then raise exception 'This portfolio is outside your mentor assignment' using errcode='42501'; end if;
  if decision not in ('approve','changes_requested') then raise exception 'Choose a valid review decision' using errcode='22023'; end if;
  update public.genesis_portfolio_versions set status=case when decision='approve' then 'reviewed' else 'draft' end,reviewed_by=public.current_profile_user_id(),reviewed_at=now(),mentor_feedback=left(coalesce(payload->>'feedback',''),10000)
  where portfolio_id=portfolio.id and version=portfolio.current_version and status='submitted' returning * into version_row;
  if not found then raise exception 'The submitted version is no longer available for review' using errcode='23514'; end if;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata) values(public.current_profile_user_id(),'genesis_review_'||decision,'genesis_portfolio_version',version_row.id,jsonb_build_object('experienceKey','genesis','version',version_row.version));
  return jsonb_build_object('portfolioId',portfolio.id,'version',version_row.version,'status',version_row.status);
end $$;

revoke all on function public.oaca_create_appointment(jsonb), public.oaca_change_appointment(jsonb), public.oaca_save_encounter(jsonb), public.genesis_save_reflection(jsonb), public.genesis_submit_review(jsonb), public.genesis_publish_snapshot(jsonb), public.genesis_create_handoff(jsonb), public.genesis_create_event(jsonb), public.genesis_review_decide(jsonb) from public, anon;
grant execute on function public.oaca_create_appointment(jsonb), public.oaca_change_appointment(jsonb), public.oaca_save_encounter(jsonb), public.genesis_save_reflection(jsonb), public.genesis_submit_review(jsonb), public.genesis_publish_snapshot(jsonb), public.genesis_create_handoff(jsonb), public.genesis_create_event(jsonb), public.genesis_review_decide(jsonb) to authenticated;

commit;
