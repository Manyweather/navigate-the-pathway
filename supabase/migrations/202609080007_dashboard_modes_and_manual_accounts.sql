begin;
-- The selected dashboard narrows an already-authorized identity; it never grants a role.
create function public.pathway_survey_audience_allowed(audience text,o uuid,p uuid,c uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role(audience,o,p,c) and (audience='student' or public.staff_mfa_verified())
 and coalesce(nullif(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-navigate-mode',''),
 case when public.has_role('student',o,p,c) then 'student' else 'advisor' end)=audience;
$$;
revoke all on function public.pathway_survey_audience_allowed(text,uuid,uuid,uuid) from public,anon,authenticated;
create or replace function public.my_survey_assignments()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assignment_id, 'audience', audience, 'waveId',wave_id, 'instrumentSlug', instrument_slug, 'instrumentName', instrument_name,
    'itemCount', coalesce((select expected_item_count from evaluation.instrument_definitions where slug = p.instrument_slug), 0),
    'openResponseCount', coalesce((select expected_open_response_count from evaluation.instrument_definitions where slug = p.instrument_slug), 0),
    'waveLabel', wave_label, 'required', false, 'opensAt', opens_at, 'closesAt', closes_at,
    'status', status, 'submittedAt', submitted_at
  ) order by wave_label, instrument_name), '[]'::jsonb)
  from public.survey_completion_projection p where user_id = public.current_profile_user_id() and public.pathway_survey_audience_allowed(case when instrument_slug in ('advisor-coaching-competency-scale','macleod-clark-professional-identity-scale-advisor') then 'advisor' else audience end,organization_id,program_id,cohort_id);
$$;
create or replace function public.get_my_survey_assignment(assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, evaluation, pg_temp as $$
declare
  canonical_id uuid := public.current_profile_user_id();
  a evaluation.assignments; w evaluation.waves; v evaluation.instrument_versions; d evaluation.instrument_definitions; c evaluation.consent_versions; r evaluation.response_sets; result jsonb;
begin
  if not exists(select 1 from public.survey_completion_projection sp where sp.assignment_id=$1 and sp.user_id=canonical_id and public.pathway_survey_audience_allowed(case when sp.instrument_slug in ('advisor-coaching-competency-scale','macleod-clark-professional-identity-scale-advisor') then 'advisor' else sp.audience end,sp.organization_id,sp.program_id,sp.cohort_id)) then raise exception 'Open this survey in its assigned dashboard; advisor surveys require MFA' using errcode='42501'; end if;
  select * into a from evaluation.assignments where id = assignment_id and user_id = canonical_id and withdrawn_at is null;
  if a.id is null then raise exception 'Survey assignment not found' using errcode = '42501'; end if;
  select * into w from evaluation.waves where id = a.wave_id;
  if w.status not in ('open', 'scheduled') or (w.opens_at is not null and w.opens_at > now()) or (w.closes_at is not null and w.closes_at < now()) then raise exception 'This survey is not currently available' using errcode = '22023'; end if;
  select * into v from evaluation.instrument_versions where id = w.instrument_version_id;
  select * into d from evaluation.instrument_definitions where id = v.instrument_id;
  select * into c from evaluation.consent_versions where id = w.consent_version_id and status = 'approved';
  if v.publish_status <> 'approved' or not v.content_complete or d.permission_status <> 'approved' or c.id is null or (d.requires_pi_confirmation and not v.pi_confirmed) then
    return jsonb_build_object('id', a.id, 'instrumentSlug', d.slug, 'instrumentName', d.name, 'itemCount', d.expected_item_count, 'openResponseCount', d.expected_open_response_count, 'waveLabel', w.label, 'required', w.required, 'opensAt', w.opens_at, 'closesAt', w.closes_at, 'status', 'not_available', 'submittedAt', null, 'consentVersionId', w.consent_version_id, 'consentTitle', 'Release pending', 'consentBody', 'Approved survey content is not available yet.', 'instrumentVersion', v.version_label, 'items', '[]'::jsonb, 'draft', '{}'::jsonb, 'lastSavedAt', null);
  end if;
  select * into r from evaluation.response_sets where assignment_id = a.id and status in ('in_progress', 'submitted') order by revision desc limit 1;
  return jsonb_build_object(
    'id', a.id, 'instrumentSlug', d.slug, 'instrumentName', d.name, 'itemCount', d.expected_item_count, 'openResponseCount', d.expected_open_response_count,
    'waveLabel', w.label, 'required', w.required, 'opensAt', w.opens_at, 'closesAt', w.closes_at,
    'status', case when r.status = 'submitted' then 'submitted' when r.id is not null then 'in_progress' else 'not_started' end,
    'submittedAt', r.submitted_at, 'consentVersionId', c.id, 'consentTitle', c.title, 'consentBody', c.body,
    'instrumentVersion', v.version_label,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'position', i.position, 'prompt', i.prompt, 'responseType', i.response_type, 'required', i.required, 'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'value', o.value, 'position', o.position) order by o.position) from evaluation.response_options o where o.item_id = i.id), '[]'::jsonb)) order by i.position) from evaluation.items i where i.instrument_version_id = v.id), '[]'::jsonb),
    'draft', coalesce((select jsonb_object_agg(ir.item_id::text, ir.response_value) from evaluation.item_responses ir where ir.response_set_id = r.id), '{}'::jsonb),
    'lastSavedAt', r.last_saved_at
  );
end;
$$;
create or replace function public.save_my_survey_draft(assignment_id uuid, consent_version_id uuid, answers jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, evaluation, pg_temp as $$
declare canonical_id uuid := public.current_profile_user_id(); a evaluation.assignments; w evaluation.waves; r evaluation.response_sets; answer record;
begin
  if not exists(select 1 from public.survey_completion_projection sp where sp.assignment_id=$1 and sp.user_id=canonical_id and public.pathway_survey_audience_allowed(case when sp.instrument_slug in ('advisor-coaching-competency-scale','macleod-clark-professional-identity-scale-advisor') then 'advisor' else sp.audience end,sp.organization_id,sp.program_id,sp.cohort_id)) then raise exception 'Open this survey in its assigned dashboard; advisor surveys require MFA' using errcode='42501'; end if;
  select * into a from evaluation.assignments where id = assignment_id and user_id = canonical_id and withdrawn_at is null;
  if a.id is null then raise exception 'Survey assignment not found' using errcode = '42501'; end if;
  select * into w from evaluation.waves where id = a.wave_id and status = 'open' and (opens_at is null or opens_at <= now()) and (closes_at is null or closes_at >= now());
  if w.id is null or w.consent_version_id <> consent_version_id then raise exception 'The survey or consent version is not available' using errcode = '22023'; end if;
  insert into evaluation.consent_records (assignment_id, user_id, consent_version_id) values (a.id, canonical_id, consent_version_id) on conflict do nothing;
  select * into r from evaluation.response_sets where assignment_id = a.id and status = 'in_progress' order by revision desc limit 1;
  if r.id is null then insert into evaluation.response_sets (assignment_id, user_id, instrument_version_id) values (a.id, canonical_id, w.instrument_version_id) returning * into r; end if;
  delete from evaluation.item_responses where response_set_id = r.id;
  for answer in select key, value from jsonb_each_text(coalesce(answers, '{}'::jsonb)) loop
    insert into evaluation.item_responses (response_set_id, item_id, response_value)
    select r.id, i.id, answer.value from evaluation.items i where i.id = answer.key::uuid and i.instrument_version_id = w.instrument_version_id;
  end loop;
  update evaluation.response_sets set last_saved_at = now() where id = r.id;
  update public.survey_completion_projection set status = 'in_progress', started_at = coalesce(started_at, now()), updated_at = now() where assignment_id = a.id and status <> 'submitted';
  insert into public.audit_events (organization_id, actor_id, event_type, subject_type, subject_id, metadata) values (a.organization_id, canonical_id, 'survey_draft_saved', 'survey_assignment', a.id::text, jsonb_build_object('signInIdentity', auth.uid()));
  return jsonb_build_object('ok', true, 'lastSavedAt', now());
end;
$$;
create or replace function public.submit_my_survey_response(assignment_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, evaluation, pg_temp as $$
declare canonical_id uuid := public.current_profile_user_id(); a evaluation.assignments; w evaluation.waves; r evaluation.response_sets; missing_required integer;
begin
  if not exists(select 1 from public.survey_completion_projection sp where sp.assignment_id=$1 and sp.user_id=canonical_id and public.pathway_survey_audience_allowed(case when sp.instrument_slug in ('advisor-coaching-competency-scale','macleod-clark-professional-identity-scale-advisor') then 'advisor' else sp.audience end,sp.organization_id,sp.program_id,sp.cohort_id)) then raise exception 'Open this survey in its assigned dashboard; advisor surveys require MFA' using errcode='42501'; end if;
  select * into a from evaluation.assignments where id = assignment_id and user_id = canonical_id and withdrawn_at is null;
  if a.id is null then raise exception 'Survey assignment not found' using errcode = '42501'; end if;
  select * into w from evaluation.waves where id = a.wave_id and status = 'open' and (opens_at is null or opens_at <= now()) and (closes_at is null or closes_at >= now());
  select * into r from evaluation.response_sets where assignment_id = a.id and status = 'in_progress' order by revision desc limit 1;
  if w.id is null or r.id is null then raise exception 'A saved, open survey is required before submission' using errcode = '22023'; end if;
  select count(*) into missing_required from evaluation.items i where i.instrument_version_id = w.instrument_version_id and i.required and not exists (select 1 from evaluation.item_responses ir where ir.response_set_id = r.id and ir.item_id = i.id and btrim(ir.response_value) <> '');
  if missing_required > 0 then raise exception 'Complete all required items before submission' using errcode = '23514'; end if;
  update evaluation.response_sets set status = 'submitted', submitted_at = now(), last_saved_at = now() where id = r.id;
  update public.survey_completion_projection set status = 'submitted', submitted_at = now(), updated_at = now() where assignment_id = a.id;
  insert into public.audit_events (organization_id, actor_id, event_type, subject_type, subject_id, metadata) values (a.organization_id, canonical_id, 'survey_submitted', 'survey_assignment', a.id::text, jsonb_build_object('signInIdentity', auth.uid()));
  return jsonb_build_object('ok', true, 'submittedAt', now());
end;
$$;

-- Create the program profile and roles atomically after the API creates an unconfirmed identity.
create function public.pathway_create_account_profile(target_id uuid,target_email text,target_name text,target_role text,target_cohort uuid,request_key uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=public.current_profile_user_id(); f public.profiles;
begin
 select * into f from public.profiles where user_id=actor and status in ('active','invited');
 if not public.pathway_principal(f.active_organization_id,f.active_program_id) or not public.has_capability('accounts.manage',f.active_organization_id,f.active_program_id) then raise exception 'Creator or PI account management and MFA are required' using errcode='42501'; end if;
 if length(trim(target_name)) not between 1 and 160 then raise exception 'Enter a full name'; end if;
 if exists(select 1 from public.pathway_account_merges where secondary_user_id=target_id) then raise exception 'This identity was already merged; use its primary account'; end if;
 perform public.admin_assign_invited_user(target_id,lower(target_email),array[target_role],f.active_organization_id,f.active_program_id,target_cohort);
 if target_role='student' then insert into public.enrollments(student_id,organization_id,program_id,cohort_id,status) values(target_id,f.active_organization_id,f.active_program_id,target_cohort,'invited') on conflict(student_id,program_id) do nothing; end if;
 update public.profiles set display_name=trim(target_name),updated_at=now() where user_id=target_id;
 if not exists(select 1 from public.audit_events where actor_id=actor and event_type='account_created_manually' and metadata->>'requestKey'=request_key::text) then
 insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(f.active_organization_id,actor,'account_created_manually','profile',target_id::text,jsonb_build_object('role',target_role,'requestKey',request_key,'invitationSent',false)); end if;
 return jsonb_build_object('ok',true,'userId',target_id,'invitationSent',false);
end $$;
revoke all on function public.pathway_create_account_profile(uuid,text,text,text,uuid,uuid) from public,anon;
grant execute on function public.pathway_create_account_profile(uuid,text,text,text,uuid,uuid) to authenticated;

alter function public.pathway_action(text,jsonb) rename to pathway_action_before_modes;
revoke all on function public.pathway_action_before_modes(text,jsonb) from public,anon,authenticated;
create function public.pathway_action(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare mode text:=nullif(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-navigate-mode',''); u uuid:=public.current_profile_user_id(); f public.profiles; principal boolean; result jsonb;
begin
 select * into f from public.profiles where user_id=u and status in ('active','invited');
 if mode is not null then
   principal:=mode in ('creator','principal_investigator');
   if principal then
     if not public.pathway_principal(f.active_organization_id,f.active_program_id) or not public.has_capability('platform.'||mode,f.active_organization_id,f.active_program_id) then raise exception 'Principal mode is not assigned' using errcode='42501'; end if;
   elsif mode not in ('student','advisor','administrator') or not public.has_role(mode,f.active_organization_id,f.active_program_id,f.active_cohort_id) then raise exception 'Dashboard role is not assigned' using errcode='42501'; end if;
   if mode<>'student' and not public.staff_mfa_verified() then raise exception 'Staff MFA required' using errcode='42501'; end if;
   if action in ('analytics','access','access_update','communication_policy') and not principal then raise exception 'Open Creator or PI mode for this feature' using errcode='42501'; end if;
   if (action like 'roster_%' or action in ('session_save','session_context')) and mode<>'administrator' and not principal then raise exception 'Open an administrative dashboard' using errcode='42501'; end if;
   if action in ('support_review','support_generate') and mode<>'advisor' and not principal then raise exception 'Support reviewer role required' using errcode='42501'; end if;
   if mode='advisor' and action='support_review' and not exists(select 1 from public.pathway_support_sources where id=(payload->>'sourceId')::uuid and public.is_assigned_advisor(student_id,f.active_program_id)) then raise exception 'This student is not assigned to you in Advisor mode' using errcode='42501'; end if;
   if action in ('support_share','support_revoke','support_materials') and mode<>'student' then raise exception 'Open Student mode to share your materials' using errcode='42501'; end if;
 end if;
 result:=public.pathway_action_before_modes(action,payload);
 if mode='student' and action='support' then
   result:=jsonb_set(result,'{sources}',coalesce((select jsonb_agg(s) from jsonb_array_elements(result->'sources') s where s->>'student_id'=u::text),'[]'));
   result:=jsonb_set(result,'{reviews}',coalesce((select jsonb_agg(r) from jsonb_array_elements(result->'reviews') r where r->>'student_id'=u::text and (r->>'shared_with_student')::boolean and r->>'status'<>'draft'),'[]'));
 elsif mode='advisor' and action='support' then
   result:=jsonb_set(result,'{sources}',coalesce((select jsonb_agg(s) from jsonb_array_elements(result->'sources') s where public.is_assigned_advisor((s->>'student_id')::uuid,f.active_program_id)),'[]'));
   result:=jsonb_set(result,'{reviews}',coalesce((select jsonb_agg(r) from jsonb_array_elements(result->'reviews') r where public.is_assigned_advisor((r->>'student_id')::uuid,f.active_program_id)),'[]'));
 elsif mode='administrator' and action='support' then result:=jsonb_build_object('ai',jsonb_build_object('enabled',false,'status','Not configured'),'sources','[]'::jsonb,'reviews','[]'::jsonb);
 end if;
 if mode in ('student','advisor') and action='sessions' then result:=coalesce((select jsonb_agg(s) from jsonb_array_elements(result) s where s->>'status'<>'draft'),'[]'); end if;
 if mode in ('student','administrator','creator','principal_investigator') and action='directory' then result:=coalesce((select jsonb_agg(s) from jsonb_array_elements(result) s where s->'roles' ? 'advisor'),'[]'); end if;
 return result;
end $$;
revoke all on function public.pathway_action(text,jsonb) from public,anon;
grant execute on function public.pathway_action(text,jsonb) to authenticated;
commit;
