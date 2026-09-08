begin;

create table if not exists public.account_auth_identities (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  canonical_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  is_primary boolean not null default false,
  added_by uuid references auth.users(id),
  added_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (canonical_user_id, email)
);

create unique index if not exists account_one_primary_identity
  on public.account_auth_identities (canonical_user_id)
  where is_primary;

insert into public.account_auth_identities (auth_user_id, canonical_user_id, email, is_primary, verified_at)
select id, id, lower(email), true, email_confirmed_at
from auth.users
where email is not null
on conflict (auth_user_id) do nothing;

create or replace function public.register_account_auth_identity()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.email is not null then
    insert into public.account_auth_identities (auth_user_id, canonical_user_id, email, is_primary, verified_at)
    values (new.id, new.id, lower(new.email), true, new.email_confirmed_at)
    on conflict (auth_user_id) do update set email = excluded.email, verified_at = excluded.verified_at;
  end if;
  return new;
end;
$$;

drop trigger if exists register_account_auth_identity on auth.users;
create trigger register_account_auth_identity
after insert or update of email, email_confirmed_at on auth.users
for each row execute function public.register_account_auth_identity();

create or replace function public.current_profile_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select canonical_user_id from public.account_auth_identities where auth_user_id = auth.uid()),
    auth.uid()
  );
$$;

revoke all on function public.current_profile_user_id() from public, anon;
grant execute on function public.current_profile_user_id() to authenticated, service_role;

create or replace function public.has_role(requested_role text, requested_organization uuid default null, requested_program uuid default null, requested_cohort uuid default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.role_assignments r
    where r.user_id = public.current_profile_user_id() and r.role = requested_role and r.revoked_at is null
      and (requested_organization is null or r.organization_id = requested_organization)
      and (requested_program is null or r.program_id is null or r.program_id = requested_program)
      and (requested_cohort is null or r.cohort_id is null or r.cohort_id = requested_cohort)
  );
$$;

create or replace function public.has_capability(requested_permission text, requested_organization uuid default null, requested_program uuid default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.permission_assignments p
    where p.user_id = public.current_profile_user_id() and p.permission_key = requested_permission and p.revoked_at is null
      and (requested_organization is null or p.organization_id = requested_organization)
      and (requested_program is null or p.program_id is null or p.program_id = requested_program)
  );
$$;

create or replace function public.is_assigned_advisor(requested_student uuid, requested_program uuid default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.advisor_assignments a
    where a.advisor_id = public.current_profile_user_id() and a.student_id = requested_student
      and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
      and (requested_program is null or a.program_id = requested_program)
  );
$$;

create or replace function public.pilot_authorization_context()
returns jsonb language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
declare
  canonical_id uuid := public.current_profile_user_id();
  profile_record public.profiles;
  result jsonb;
begin
  select * into profile_record from public.profiles where user_id = canonical_id;
  if profile_record.user_id is null then raise exception 'No pilot profile is assigned to this account' using errcode = '42501'; end if;
  select jsonb_build_object(
    'userId', canonical_id,
    'authUserId', auth.uid(),
    'displayName', profile_record.display_name,
    'email', coalesce((select email from public.account_auth_identities where canonical_user_id = canonical_id and is_primary limit 1), (select email from auth.users where id = canonical_id), ''),
    'signInEmail', coalesce((select email from auth.users where id = auth.uid()), ''),
    'secondaryEmails', coalesce((select jsonb_agg(email order by added_at) from public.account_auth_identities where canonical_user_id = canonical_id and not is_primary), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(distinct role order by role) from public.role_assignments where user_id = canonical_id and revoked_at is null), '[]'::jsonb),
    'activeOrganizationId', profile_record.active_organization_id,
    'activeProgramId', profile_record.active_program_id,
    'activeCohortId', profile_record.active_cohort_id,
    'capabilities', coalesce((select jsonb_agg(distinct permission_key order by permission_key) from public.permission_assignments where user_id = canonical_id and revoked_at is null), '[]'::jsonb),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'environment', coalesce(current_setting('app.pilot_environment', true), 'production')
  ) into result;
  return result;
end;
$$;

create or replace function public.my_survey_assignments()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assignment_id, 'instrumentSlug', instrument_slug, 'instrumentName', instrument_name,
    'itemCount', coalesce((select expected_item_count from evaluation.instrument_definitions where slug = p.instrument_slug), 0),
    'openResponseCount', coalesce((select expected_open_response_count from evaluation.instrument_definitions where slug = p.instrument_slug), 0),
    'waveLabel', wave_label, 'required', false, 'opensAt', opens_at, 'closesAt', closes_at,
    'status', status, 'submittedAt', submitted_at
  ) order by wave_label, instrument_name), '[]'::jsonb)
  from public.survey_completion_projection p where user_id = public.current_profile_user_id();
$$;

create or replace function public.get_my_survey_assignment(assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, evaluation, pg_temp as $$
declare
  canonical_id uuid := public.current_profile_user_id();
  a evaluation.assignments; w evaluation.waves; v evaluation.instrument_versions; d evaluation.instrument_definitions; c evaluation.consent_versions; r evaluation.response_sets; result jsonb;
begin
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

create or replace function public.pilot_dashboard(requested_role text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb; canonical_id uuid := public.current_profile_user_id();
begin
  if not public.has_role(requested_role, null, null, null) then raise exception 'Role is not assigned' using errcode = '42501'; end if;
  if requested_role <> 'student' and not public.staff_mfa_verified() then raise exception 'Staff MFA is required' using errcode = '42501'; end if;
  if requested_role = 'student' then
    select jsonb_build_object(
      'nextSession', (select jsonb_build_object('id', s.id, 'title', s.title, 'topic', s.topic, 'startsAt', s.starts_at, 'endsAt', s.ends_at, 'format', s.format, 'attendanceStatus', coalesce(a.status, 'not_recorded'), 'checkInAvailable', now() between s.check_in_opens_at and s.check_in_closes_at) from public.sessions s join public.enrollments e on e.program_id = s.program_id and e.student_id = canonical_id and e.status = 'active' left join public.attendance a on a.session_id = s.id and a.student_id = canonical_id where s.status = 'scheduled' and s.starts_at >= now() order by s.starts_at limit 1),
      'attendanceHistory', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'topic', s.topic, 'startsAt', s.starts_at, 'endsAt', s.ends_at, 'format', s.format, 'attendanceStatus', coalesce(a.status, 'not_recorded'), 'checkInAvailable', false) order by s.starts_at desc) from public.sessions s join public.enrollments e on e.program_id = s.program_id and e.student_id = canonical_id left join public.attendance a on a.session_id = s.id and a.student_id = canonical_id where s.starts_at < now()), '[]'::jsonb),
      'surveyAssignments', public.my_survey_assignments(),
      'portfolio', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'documentType', d.document_type, 'sharedWithAdvisor', exists (select 1 from public.packet_items pi join public.advising_packets p on p.id = pi.packet_id where pi.item_type = 'portfolio_document' and pi.item_id = d.id and p.status = 'active' and p.revoked_at is null and (p.expires_at is null or p.expires_at > now())), 'updatedAt', d.updated_at) order by d.updated_at desc) from public.portfolio_documents d where d.student_id = canonical_id), '[]'::jsonb),
      'advisingPackets', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'status', case when p.revoked_at is not null then 'revoked' when p.expires_at < now() then 'expired' else p.status end, 'expiresAt', p.expires_at) order by p.updated_at desc) from public.advising_packets p where p.student_id = canonical_id), '[]'::jsonb)
    ) into result;
  elsif requested_role = 'advisor' then
    select jsonb_build_object(
      'assignedStudents', coalesce((select jsonb_agg(jsonb_build_object('id', p.user_id, 'displayName', p.display_name, 'cohortName', coalesce(c.name, 'No cohort'), 'attendance', jsonb_build_object('present', (select count(*) from public.attendance a where a.student_id = p.user_id and a.status = 'present'), 'expected', (select count(*) from public.sessions s where s.program_id = aa.program_id and s.starts_at < now())), 'surveyCompletion', coalesce((select jsonb_agg(jsonb_build_object('instrumentName', sc.instrument_name, 'status', sc.status, 'submittedAt', sc.submitted_at)) from public.survey_completion_projection sc where sc.user_id = p.user_id), '[]'::jsonb), 'sharedPacketCount', (select count(*) from public.advising_packets ap where ap.student_id = p.user_id and ap.advisor_id = canonical_id and ap.status = 'active' and ap.revoked_at is null and (ap.expires_at is null or ap.expires_at > now()))) order by p.display_name) from public.advisor_assignments aa join public.profiles p on p.user_id = aa.student_id left join public.cohorts c on c.id = aa.cohort_id where aa.advisor_id = canonical_id and aa.starts_at <= now() and (aa.ends_at is null or aa.ends_at > now())), '[]'::jsonb),
      'mySurveys', public.my_survey_assignments()
    ) into result;
  else
    select jsonb_build_object(
      'counts', jsonb_build_object('invitedUsers', (select count(*) from public.profiles where status = 'invited'), 'activeUsers', (select count(*) from public.profiles where status = 'active'), 'cohorts', (select count(*) from public.cohorts), 'sessions', (select count(*) from public.sessions)),
      'surveyCompletion', coalesce((select jsonb_agg(jsonb_build_object('instrumentName', instrument_name, 'assigned', assigned, 'submitted', submitted) order by instrument_name) from (select instrument_name, count(*) assigned, count(*) filter (where status = 'submitted') submitted from public.survey_completion_projection group by instrument_name) x), '[]'::jsonb),
      'pendingCurriculumReviews', 0,
      'attendanceCorrections', (select count(*) from public.attendance_changes)
    ) into result;
  end if;
  return result;
end;
$$;

create or replace function public.portfolio_object_is_owned(object_name text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((storage.foldername(object_name))[1] = public.current_profile_user_id()::text, false);
$$;

create or replace function public.portfolio_object_is_shared(object_name text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.portfolio_documents document
    join public.packet_items item on item.item_type = 'portfolio_document' and item.item_id = document.id
    join public.advising_packets packet on packet.id = item.packet_id
    where document.storage_path = object_name
      and packet.advisor_id = public.current_profile_user_id()
      and packet.status = 'active' and packet.revoked_at is null
      and (packet.expires_at is null or packet.expires_at > now())
      and public.staff_mfa_verified()
      and public.is_assigned_advisor(document.student_id, document.program_id)
  );
$$;

alter table public.account_auth_identities enable row level security;
create policy account_identities_self on public.account_auth_identities for select to authenticated using (canonical_user_id = public.current_profile_user_id());
create policy account_identities_admin on public.account_auth_identities for all to authenticated
  using (public.staff_mfa_verified() and public.has_capability('accounts.manage', null, null))
  with check (public.staff_mfa_verified() and public.has_capability('accounts.manage', null, null));

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select to authenticated using (user_id = public.current_profile_user_id());
drop policy if exists role_assignments_self on public.role_assignments;
create policy role_assignments_self on public.role_assignments for select to authenticated using (user_id = public.current_profile_user_id());
drop policy if exists permission_assignments_self on public.permission_assignments;
create policy permission_assignments_self on public.permission_assignments for select to authenticated using (user_id = public.current_profile_user_id());
drop policy if exists advisor_assignments_participant on public.advisor_assignments;
create policy advisor_assignments_participant on public.advisor_assignments for select to authenticated using (advisor_id = public.current_profile_user_id() or student_id = public.current_profile_user_id() or (public.staff_mfa_verified() and public.has_role('administrator', organization_id, program_id, cohort_id)));
drop policy if exists sessions_enrolled on public.sessions;
create policy sessions_enrolled on public.sessions for select to authenticated using (exists (select 1 from public.enrollments e where e.student_id = public.current_profile_user_id() and e.program_id = sessions.program_id and e.status = 'active') or (public.staff_mfa_verified() and (public.has_role('advisor', organization_id, program_id, cohort_id) or public.has_role('administrator', organization_id, program_id, cohort_id))));
drop policy if exists enrollments_self on public.enrollments;
create policy enrollments_self on public.enrollments for select to authenticated using (student_id = public.current_profile_user_id());
drop policy if exists attendance_student on public.attendance;
create policy attendance_student on public.attendance for select to authenticated using (student_id = public.current_profile_user_id());
drop policy if exists attendance_changes_student on public.attendance_changes;
create policy attendance_changes_student on public.attendance_changes for select to authenticated using (exists (select 1 from public.attendance a where a.id = attendance_id and a.student_id = public.current_profile_user_id()));
drop policy if exists artifacts_owner on public.artifacts;
create policy artifacts_owner on public.artifacts for all to authenticated using (student_id = public.current_profile_user_id()) with check (student_id = public.current_profile_user_id());
drop policy if exists portfolio_owner on public.portfolio_documents;
create policy portfolio_owner on public.portfolio_documents for all to authenticated using (student_id = public.current_profile_user_id()) with check (student_id = public.current_profile_user_id());
drop policy if exists portfolio_revision_owner on public.portfolio_document_revisions;
create policy portfolio_revision_owner on public.portfolio_document_revisions for all to authenticated using (exists (select 1 from public.portfolio_documents d where d.id = document_id and d.student_id = public.current_profile_user_id())) with check (exists (select 1 from public.portfolio_documents d where d.id = document_id and d.student_id = public.current_profile_user_id()));
drop policy if exists packet_owner_or_assigned_advisor on public.advising_packets;
create policy packet_owner_or_assigned_advisor on public.advising_packets for select to authenticated using (student_id = public.current_profile_user_id() or (advisor_id = public.current_profile_user_id() and public.staff_mfa_verified() and status = 'active' and revoked_at is null and (expires_at is null or expires_at > now())));
drop policy if exists packet_owner_write on public.advising_packets;
create policy packet_owner_write on public.advising_packets for all to authenticated using (student_id = public.current_profile_user_id()) with check (student_id = public.current_profile_user_id() and public.is_assigned_advisor(student_id, program_id));
drop policy if exists packet_items_visible on public.packet_items;
create policy packet_items_visible on public.packet_items for select to authenticated using (exists (select 1 from public.advising_packets p where p.id = packet_id and (p.student_id = public.current_profile_user_id() or (p.advisor_id = public.current_profile_user_id() and public.staff_mfa_verified() and p.status = 'active' and p.revoked_at is null and (p.expires_at is null or p.expires_at > now())))));
drop policy if exists packet_items_owner_write on public.packet_items;
create policy packet_items_owner_write on public.packet_items for all to authenticated using (exists (select 1 from public.advising_packets p where p.id = packet_id and p.student_id = public.current_profile_user_id())) with check (exists (select 1 from public.advising_packets p where p.id = packet_id and p.student_id = public.current_profile_user_id()));
drop policy if exists comments_packet_participant on public.comments;
create policy comments_packet_participant on public.comments for select to authenticated using (exists (select 1 from public.advising_packets p where p.id = packet_id and (p.student_id = public.current_profile_user_id() or (p.advisor_id = public.current_profile_user_id() and public.staff_mfa_verified() and p.status = 'active' and p.revoked_at is null and (p.expires_at is null or p.expires_at > now())))));
drop policy if exists comments_author on public.comments;
create policy comments_author on public.comments for insert to authenticated with check (author_id = public.current_profile_user_id() and exists (select 1 from public.advising_packets p where p.id = packet_id and (p.student_id = public.current_profile_user_id() or (p.advisor_id = public.current_profile_user_id() and public.staff_mfa_verified()))));
drop policy if exists survey_projection_self on public.survey_completion_projection;
create policy survey_projection_self on public.survey_completion_projection for select to authenticated using (user_id = public.current_profile_user_id());
drop policy if exists principal_assignments_self on public.principal_assignments;
create policy principal_assignments_self on public.principal_assignments for select to authenticated using (user_id = public.current_profile_user_id());
drop policy if exists grant_checkpoint_student on public.grant_outcome_checkpoints;
create policy grant_checkpoint_student on public.grant_outcome_checkpoints for select to authenticated using (student_id = public.current_profile_user_id());
drop policy if exists analysis_attributes_self on public.profile_analysis_attributes;
create policy analysis_attributes_self on public.profile_analysis_attributes for select to authenticated using (user_id = public.current_profile_user_id());

create or replace function public.merge_pilot_auth_identities(primary_user_id uuid, secondary_user_id uuid, actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, evaluation, auth, pg_temp
as $$
declare primary_email text; secondary_email text; transferred jsonb;
begin
  if primary_user_id = secondary_user_id then raise exception 'Choose two different authentication identities'; end if;
  select lower(email) into primary_email from auth.users where id = primary_user_id;
  select lower(email) into secondary_email from auth.users where id = secondary_user_id;
  if primary_email is null or secondary_email is null then raise exception 'Both authentication identities must exist'; end if;

  if exists (
    select 1 from evaluation.assignments source_assignment
    join evaluation.assignments target_assignment on target_assignment.wave_id = source_assignment.wave_id and target_assignment.user_id = primary_user_id
    where source_assignment.user_id = secondary_user_id
      and exists (select 1 from evaluation.response_sets where assignment_id = source_assignment.id)
      and exists (select 1 from evaluation.response_sets where assignment_id = target_assignment.id)
  ) then raise exception 'Both identities contain responses for the same survey wave; evaluation review is required before merging'; end if;

  insert into public.account_auth_identities (auth_user_id, canonical_user_id, email, is_primary, added_by, verified_at)
  select id, primary_user_id, lower(email), id = primary_user_id, actor_user_id, email_confirmed_at from auth.users where id in (primary_user_id, secondary_user_id)
  on conflict (auth_user_id) do update set canonical_user_id = excluded.canonical_user_id, email = excluded.email, is_primary = excluded.is_primary, added_by = excluded.added_by, verified_at = excluded.verified_at;
  update public.account_auth_identities set is_primary = auth_user_id = primary_user_id where canonical_user_id = primary_user_id;

  insert into public.profiles (user_id, display_name, preferred_name, active_organization_id, active_program_id, active_cohort_id, status, created_at, updated_at)
  select primary_user_id, display_name, preferred_name, active_organization_id, active_program_id, active_cohort_id, status, created_at, now() from public.profiles where user_id = secondary_user_id
  on conflict (user_id) do update set
    preferred_name = coalesce(public.profiles.preferred_name, excluded.preferred_name),
    active_organization_id = coalesce(public.profiles.active_organization_id, excluded.active_organization_id),
    active_program_id = coalesce(public.profiles.active_program_id, excluded.active_program_id),
    active_cohort_id = coalesce(public.profiles.active_cohort_id, excluded.active_cohort_id),
    status = case when public.profiles.status = 'active' or excluded.status = 'active' then 'active' else public.profiles.status end,
    updated_at = now();

  insert into public.role_assignments (user_id, role, organization_id, program_id, cohort_id, granted_by, granted_at, revoked_at)
  select primary_user_id, role, organization_id, program_id, cohort_id, coalesce(granted_by, actor_user_id), granted_at, revoked_at from public.role_assignments where user_id = secondary_user_id
  on conflict do nothing;
  delete from public.role_assignments where user_id = secondary_user_id;

  insert into public.permission_assignments (user_id, permission_key, organization_id, program_id, granted_by, granted_at, revoked_at)
  select primary_user_id, permission_key, organization_id, program_id, coalesce(granted_by, actor_user_id), granted_at, revoked_at from public.permission_assignments where user_id = secondary_user_id
  on conflict do nothing;
  delete from public.permission_assignments where user_id = secondary_user_id;

  insert into public.advisor_assignments (advisor_id, student_id, organization_id, program_id, cohort_id, starts_at, ends_at, created_by)
  select case when advisor_id = secondary_user_id then primary_user_id else advisor_id end, case when student_id = secondary_user_id then primary_user_id else student_id end, organization_id, program_id, cohort_id, starts_at, ends_at, created_by
  from public.advisor_assignments where advisor_id = secondary_user_id or student_id = secondary_user_id on conflict do nothing;
  delete from public.advisor_assignments where advisor_id = secondary_user_id or student_id = secondary_user_id;

  insert into public.enrollments (student_id, organization_id, program_id, cohort_id, status, enrolled_at)
  select primary_user_id, organization_id, program_id, cohort_id, status, enrolled_at from public.enrollments where student_id = secondary_user_id on conflict do nothing;
  delete from public.enrollments where student_id = secondary_user_id;
  insert into public.attendance (session_id, student_id, status, recorded_at, source, created_by)
  select session_id, primary_user_id, status, recorded_at, source, created_by from public.attendance where student_id = secondary_user_id on conflict do nothing;
  delete from public.attendance where student_id = secondary_user_id;

  update public.artifacts set student_id = primary_user_id where student_id = secondary_user_id;
  update public.portfolio_documents set student_id = primary_user_id where student_id = secondary_user_id;
  update public.advising_packets set student_id = primary_user_id where student_id = secondary_user_id;
  update public.advising_packets set advisor_id = primary_user_id where advisor_id = secondary_user_id;

  delete from public.survey_completion_projection where assignment_id in (
    select source_assignment.id from evaluation.assignments source_assignment
    join evaluation.assignments target_assignment on target_assignment.wave_id = source_assignment.wave_id and target_assignment.user_id = primary_user_id
    where source_assignment.user_id = secondary_user_id and not exists (select 1 from evaluation.response_sets where assignment_id = source_assignment.id)
  );
  delete from evaluation.assignments source_assignment using evaluation.assignments target_assignment
  where source_assignment.user_id = secondary_user_id and target_assignment.user_id = primary_user_id and target_assignment.wave_id = source_assignment.wave_id
    and not exists (select 1 from evaluation.response_sets where assignment_id = source_assignment.id);
  delete from public.survey_completion_projection where assignment_id in (
    select target_assignment.id from evaluation.assignments source_assignment
    join evaluation.assignments target_assignment on target_assignment.wave_id = source_assignment.wave_id and target_assignment.user_id = primary_user_id
    where source_assignment.user_id = secondary_user_id and exists (select 1 from evaluation.response_sets where assignment_id = source_assignment.id)
      and not exists (select 1 from evaluation.response_sets where assignment_id = target_assignment.id)
  );
  delete from evaluation.assignments target_assignment using evaluation.assignments source_assignment
  where target_assignment.user_id = primary_user_id and source_assignment.user_id = secondary_user_id and target_assignment.wave_id = source_assignment.wave_id
    and exists (select 1 from evaluation.response_sets where assignment_id = source_assignment.id)
    and not exists (select 1 from evaluation.response_sets where assignment_id = target_assignment.id);
  update evaluation.assignments set user_id = primary_user_id where user_id = secondary_user_id;
  update evaluation.consent_records set user_id = primary_user_id where user_id = secondary_user_id;
  update evaluation.withdrawals set user_id = primary_user_id where user_id = secondary_user_id;
  update evaluation.response_sets set user_id = primary_user_id where user_id = secondary_user_id;
  update public.survey_completion_projection set user_id = primary_user_id where user_id = secondary_user_id;

  insert into public.account_lifecycle (user_id, organization_id, program_id, status, deactivated_by, deactivated_at, purge_eligible_at, restored_by, restored_at, retention_note, updated_at)
  select primary_user_id, organization_id, program_id, status, deactivated_by, deactivated_at, purge_eligible_at, restored_by, restored_at, retention_note, now() from public.account_lifecycle where user_id = secondary_user_id on conflict do nothing;
  delete from public.account_lifecycle where user_id = secondary_user_id;
  insert into public.profile_analysis_attributes (user_id, organization_id, program_id, institution, class_year, first_generation, socioeconomic_indicator, gender, race_ethnicity, approved_for_analysis, consented_at, updated_at)
  select primary_user_id, organization_id, program_id, institution, class_year, first_generation, socioeconomic_indicator, gender, race_ethnicity, approved_for_analysis, consented_at, now() from public.profile_analysis_attributes where user_id = secondary_user_id on conflict do nothing;
  delete from public.profile_analysis_attributes where user_id = secondary_user_id;
  update public.grant_outcome_checkpoints set student_id = primary_user_id where student_id = secondary_user_id;

  insert into public.principal_assignments (user_id, principal_type, organization_id, program_id, designated_by, designated_at, acknowledged_at, revoked_at)
  select primary_user_id, principal_type, organization_id, program_id, designated_by, designated_at, acknowledged_at, revoked_at from public.principal_assignments where user_id = secondary_user_id on conflict do nothing;
  delete from public.principal_assignments where user_id = secondary_user_id;
  delete from public.profiles where user_id = secondary_user_id;

  insert into public.audit_events (actor_id, event_type, subject_type, subject_id, metadata)
  values (actor_user_id, 'account_identities_merged', 'profile', primary_user_id::text, jsonb_build_object('primaryEmail', primary_email, 'secondaryEmail', secondary_email, 'secondaryAuthUserId', secondary_user_id));
  transferred := jsonb_build_object('canonicalUserId', primary_user_id, 'primaryEmail', primary_email, 'secondaryEmail', secondary_email);
  return transferred;
end;
$$;

revoke all on function public.merge_pilot_auth_identities(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_pilot_auth_identities(uuid, uuid, uuid) to service_role;

commit;
