begin;

-- Compass is the user-facing parent. Internal experience keys remain unchanged so
-- existing Pathway, OACA, and GENESIS records keep their identifiers and history.
update public.experiences set name='Compass',updated_at=now() where key='oaca';
update public.experiences set name='Impact Workspace',updated_at=now() where key='genesis';

create table if not exists public.platform_workspace_preferences (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  last_workspace_key text not null check(last_workspace_key in ('compass','pathway','impact')),
  last_opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.platform_workspace_preferences enable row level security;
create policy platform_workspace_preferences_self on public.platform_workspace_preferences
for select to authenticated using(user_id=public.current_profile_user_id());

create or replace function public.platform_save_workspace_preference(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_profile_user_id(); requested text:=coalesce(payload->>'lastWorkspaceKey',''); internal_key text;
begin
  internal_key:=case requested when 'compass' then 'oaca' when 'pathway' then 'pathway' when 'impact' then 'genesis' else null end;
  if internal_key is null then raise exception 'Choose a valid workspace' using errcode='22023'; end if;
  if not exists(select 1 from public.experience_role_assignments where user_id=actor and experience_key=internal_key and revoked_at is null)
  then raise exception 'That workspace is not assigned to this account' using errcode='42501'; end if;
  insert into public.platform_workspace_preferences(user_id,last_workspace_key,last_opened_at,updated_at)
  values(actor,requested,now(),now()) on conflict(user_id) do update set last_workspace_key=excluded.last_workspace_key,last_opened_at=now(),updated_at=now();
  return jsonb_build_object('lastWorkspaceKey',requested,'lastOpenedAt',now());
end $$;

alter table public.platform_student_affiliations add column if not exists verification_status text;
alter table public.platform_student_affiliations add column if not exists requested_at timestamptz;
alter table public.platform_student_affiliations add column if not exists request_context text;
alter table public.platform_student_affiliations add column if not exists reviewed_by uuid references public.profiles(user_id);
alter table public.platform_student_affiliations add column if not exists reviewed_at timestamptz;
alter table public.platform_student_affiliations add column if not exists review_note text;

update public.platform_student_affiliations a set
  verification_status=case
    when a.ended_at is not null then 'ended'
    when a.affiliation_type='student_council' then 'approved'
    when exists(select 1 from public.genesis_organization_memberships m where m.organization_id=a.organization_id and m.user_id=a.student_id and m.role='student' and m.status='approved') then 'approved'
    else 'pending' end,
  requested_at=coalesce(a.requested_at,a.created_at),
  reviewed_at=case when a.affiliation_type='student_council' then coalesce(a.reviewed_at,a.created_at) else a.reviewed_at end
where a.verification_status is null or a.requested_at is null;

alter table public.platform_student_affiliations alter column verification_status set default 'pending';
alter table public.platform_student_affiliations alter column verification_status set not null;
alter table public.platform_student_affiliations alter column requested_at set default now();
alter table public.platform_student_affiliations alter column requested_at set not null;
alter table public.platform_student_affiliations drop constraint if exists platform_student_affiliations_verification_status_check;
alter table public.platform_student_affiliations add constraint platform_student_affiliations_verification_status_check check(verification_status in ('pending','approved','declined','ended'));
create index if not exists platform_student_affiliations_review_queue_idx on public.platform_student_affiliations(verification_status,requested_at) where affiliation_type='interest_group' and ended_at is null;

create or replace function public.platform_save_student_affiliations(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_profile_user_id(); organization_ids jsonb:=coalesce(payload->'organizationIds','[]'::jsonb); student_council boolean:=coalesce((payload->>'studentCouncil')::boolean,false); selected_count integer;
begin
  if jsonb_typeof(organization_ids)<>'array' then raise exception 'Organization selections must be a list' using errcode='22023'; end if;
  if not exists(select 1 from public.experience_role_assignments where user_id=actor and experience_key='oaca' and role='student' and revoked_at is null)
  then raise exception 'An active Compass student role is required' using errcode='42501'; end if;
  if exists(select 1 from jsonb_array_elements_text(organization_ids) value where not exists(select 1 from public.genesis_organizations where id=value::uuid and archived_at is null))
  then raise exception 'Choose organizations from the current Roseman directory' using errcode='22023'; end if;

  update public.platform_student_affiliations a set verification_status='ended',ended_at=now(),updated_at=now()
  where a.student_id=actor and a.affiliation_type='interest_group' and a.ended_at is null
    and not exists(select 1 from jsonb_array_elements_text(organization_ids) value where value::uuid=a.organization_id);
  update public.genesis_organization_memberships m set status='ended'
  where m.user_id=actor and m.role='student' and m.status='approved'
    and not exists(select 1 from jsonb_array_elements_text(organization_ids) value where value::uuid=m.organization_id);

  insert into public.platform_student_affiliations(student_id,affiliation_type,organization_id,designation,created_by,verification_status,requested_at,request_context)
  select actor,'interest_group',g.id,'member',actor,'pending',now(),left(coalesce(payload->>'requestContext',''),2000)
  from public.genesis_organizations g where g.archived_at is null and g.id in(select distinct value::uuid from jsonb_array_elements_text(organization_ids) value)
  on conflict(student_id,affiliation_type,organization_id) do update set
    ended_at=null,updated_at=now(),requested_at=case when platform_student_affiliations.verification_status='approved' then platform_student_affiliations.requested_at else now() end,
    verification_status=case when platform_student_affiliations.verification_status='approved' then 'approved' else 'pending' end,
    request_context=case when platform_student_affiliations.verification_status='approved' then platform_student_affiliations.request_context else excluded.request_context end,
    reviewed_by=case when platform_student_affiliations.verification_status='approved' then platform_student_affiliations.reviewed_by else null end,
    reviewed_at=case when platform_student_affiliations.verification_status='approved' then platform_student_affiliations.reviewed_at else null end,
    review_note=case when platform_student_affiliations.verification_status='approved' then platform_student_affiliations.review_note else null end;

  if student_council then
    insert into public.platform_student_affiliations(student_id,affiliation_type,organization_id,designation,created_by,verification_status,requested_at,reviewed_at)
    values(actor,'student_council',null,'student_council',actor,'approved',now(),now())
    on conflict(student_id,affiliation_type,organization_id) do update set ended_at=null,verification_status='approved',updated_at=now();
  else
    update public.platform_student_affiliations set ended_at=now(),verification_status='ended',updated_at=now()
    where student_id=actor and affiliation_type='student_council' and ended_at is null;
  end if;
  select count(*) into selected_count from public.platform_student_affiliations where student_id=actor and affiliation_type='interest_group' and ended_at is null;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata) values(actor,'impact_affiliations_requested','profile',actor::text,jsonb_build_object('interestGroupCount',selected_count,'studentCouncil',student_council));
  return jsonb_build_object('interestGroupCount',selected_count,'studentCouncil',student_council);
end $$;

create or replace function public.genesis_decide_affiliation(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_profile_user_id(); item public.platform_student_affiliations%rowtype; decision text:=coalesce(payload->>'decision',''); actor_org uuid; actor_program uuid;
begin
  perform public.require_experience_membership('genesis');
  if not exists(select 1 from public.experience_role_assignments where user_id=actor and experience_key='genesis' and role in ('administrator','community_liaison','creator') and revoked_at is null)
  then raise exception 'Impact Administrator or Community Liaison role required' using errcode='42501'; end if;
  if decision not in ('approved','declined') then raise exception 'Choose approve or decline' using errcode='22023'; end if;
  select * into item from public.platform_student_affiliations where id=(payload->>'affiliationId')::uuid and affiliation_type='interest_group' for update;
  if not found or item.verification_status<>'pending' or item.ended_at is not null then raise exception 'This request has already been reviewed' using errcode='23514'; end if;
  update public.platform_student_affiliations set verification_status=decision,reviewed_by=actor,reviewed_at=now(),review_note=left(coalesce(payload->>'reviewNote',''),4000),updated_at=now() where id=item.id;
  if decision='approved' then
    insert into public.genesis_organization_memberships(organization_id,user_id,role,status,approved_by,approved_at)
    values(item.organization_id,item.student_id,'student','approved',actor,now()) on conflict(organization_id,user_id,role) do update set status='approved',approved_by=actor,approved_at=now();
    select active_organization_id,active_program_id into actor_org,actor_program from public.profiles where user_id=item.student_id;
    insert into public.experience_role_assignments(user_id,experience_key,role,organization_id,program_id,granted_by,revoked_at)
    values(item.student_id,'genesis','student',actor_org,actor_program,actor,null)
    on conflict(user_id,experience_key,role,organization_id,program_id,cohort_id) do update set revoked_at=null,granted_at=now(),granted_by=actor;
  end if;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata) values(actor,'impact_affiliation_'||decision,'platform_student_affiliation',item.id::text,jsonb_build_object('studentId',item.student_id,'organizationId',item.organization_id));
  return jsonb_build_object('id',item.id,'status',decision,'reviewedAt',now());
end $$;

create or replace function public.genesis_has_approved_affiliation(target_user uuid,target_organization uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.platform_student_affiliations where student_id=target_user and organization_id=target_organization and affiliation_type='interest_group' and verification_status='approved' and ended_at is null)
$$;

create or replace function public.current_experience_memberships()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'experienceKey',grouped.experience_key,'experienceName',e.name,'roles',grouped.roles,'capabilities',grouped.capabilities,
    'status','active','featureEnabled',coalesce(f.enabled,false),'sandboxOnly',coalesce(f.sandbox_only,true),
    'launchState',case when grouped.experience_key='genesis' and grouped.roles ? 'student' and not exists(
      select 1 from public.platform_student_affiliations a where a.student_id=public.current_profile_user_id() and a.affiliation_type='interest_group' and a.verification_status='approved' and a.ended_at is null
    ) then 'read_only' else 'active' end
  ) order by case grouped.experience_key when 'oaca' then 1 when 'pathway' then 2 else 3 end),'[]'::jsonb)
  from (
    select r.experience_key,jsonb_agg(distinct r.role) roles,
      coalesce((select jsonb_agg(distinct c.capability) from public.experience_capability_assignments c where c.user_id=public.current_profile_user_id() and c.experience_key=r.experience_key and c.revoked_at is null),'[]'::jsonb) capabilities
    from public.experience_role_assignments r where r.user_id=public.current_profile_user_id() and r.revoked_at is null group by r.experience_key
  ) grouped join public.experiences e on e.key=grouped.experience_key and e.status='active'
  left join public.experience_feature_flags f on f.experience_key=grouped.experience_key;
$$;

alter table public.genesis_events add column if not exists organization_id uuid references public.genesis_organizations(id);
alter table public.genesis_events add column if not exists submitted_at timestamptz;
alter table public.genesis_events add column if not exists mentor_approved_at timestamptz;
alter table public.genesis_events add column if not exists liaison_approved_at timestamptz;
alter table public.genesis_events add column if not exists reviewer_feedback text;
alter table public.genesis_events add column if not exists calendar_generation integer not null default 0;
update public.genesis_events e set organization_id=i.organization_id from public.genesis_initiatives i where e.initiative_id=i.id and e.organization_id is null;
alter table public.genesis_events alter column organization_id set not null;

alter table public.platform_notifications add column if not exists entity_type text;
alter table public.platform_notifications add column if not exists entity_id uuid;
create index if not exists platform_notifications_entity_idx on public.platform_notifications(experience_key,entity_type,entity_id);

create table if not exists public.genesis_event_calendar_jobs (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.genesis_events(id) on delete cascade,
  operation text not null check(operation in ('create','update','cancel')), status text not null default 'queued' check(status in ('queued','processing','completed','failed','cancelled')),
  idempotency_key text not null unique, attempts integer not null default 0, available_at timestamptz not null default now(), created_at timestamptz not null default now(), completed_at timestamptz
);

create or replace function public.genesis_create_event(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_profile_user_id(); initiative public.genesis_initiatives%rowtype; event_row public.genesis_events%rowtype; selected_org uuid;
begin
  perform public.require_experience_membership('genesis');
  selected_org:=(payload->>'organizationId')::uuid;
  if not public.genesis_has_approved_affiliation(actor,selected_org) then raise exception 'A verified affiliation is required to create events for this organization' using errcode='42501'; end if;
  select * into initiative from public.genesis_initiatives where created_by=actor and organization_id=selected_org and archived_at is null order by created_at limit 1;
  if not found then raise exception 'Publish a reviewed initiative snapshot before designing an event' using errcode='23514'; end if;
  if length(trim(coalesce(payload->>'title','')))<3 or length(trim(coalesce(payload->>'objective','')))<3 or length(trim(coalesce(payload->>'audience','')))<2 then raise exception 'Title, objective, and audience are required' using errcode='22023'; end if;
  insert into public.genesis_events(initiative_id,organization_id,created_by,title,objective,audience,community_partner,venue,modality,starts_at,accessibility,capacity,budget,safety_considerations,communications,evaluation_measures,status)
  values(initiative.id,selected_org,actor,left(payload->>'title',300),left(payload->>'objective',4000),left(payload->>'audience',1000),nullif(left(coalesce(payload->>'partner',''),500),''),nullif(left(coalesce(payload->>'venue',''),500),''),coalesce(payload->>'modality','in_person'),nullif(payload->>'startsAt','')::timestamptz,left(coalesce(payload->>'accessibility',''),4000),nullif(payload->>'capacity','')::integer,jsonb_build_object('notes',left(coalesce(payload->>'budget',''),4000)),left(coalesce(payload->>'safety',''),4000),left(coalesce(payload->>'communications',''),4000),jsonb_build_array(left(coalesce(payload->>'measures',''),4000)),'draft') returning * into event_row;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata) values(actor,'impact_event_draft_saved','genesis_event',event_row.id::text,jsonb_build_object('organizationId',selected_org));
  return jsonb_build_object('id',event_row.id,'status',event_row.status);
end $$;

create or replace function public.genesis_submit_event(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_profile_user_id(); item public.genesis_events%rowtype; liaison record;
begin
  perform public.require_experience_membership('genesis');
  select * into item from public.genesis_events where id=(payload->>'eventId')::uuid and created_by=actor for update;
  if not found or item.status not in ('draft','changes_requested') then raise exception 'Only your draft or revised event can be submitted' using errcode='23514'; end if;
  if not public.genesis_has_approved_affiliation(actor,item.organization_id) then raise exception 'A verified affiliation is required' using errcode='42501'; end if;
  delete from public.genesis_event_approvals where event_id=item.id;
  update public.genesis_events set status='submitted',submitted_at=now(),mentor_approved_at=null,liaison_approved_at=null,reviewer_feedback=null,updated_at=now() where id=item.id returning * into item;
  for liaison in select distinct user_id from public.experience_role_assignments where experience_key='genesis' and role in ('community_liaison','administrator') and revoked_at is null loop
    insert into public.platform_notifications(experience_key,user_id,category,title,body,deep_link,template_key,idempotency_key,entity_type,entity_id)
    values('genesis',liaison.user_id,'impact_event_submitted','Impact event submitted',item.title||' needs mentor and Community Liaison review.','/app/compass/impact','impact_event_submitted','impact:event:submitted:'||item.id||':'||liaison.user_id,'genesis_event',item.id)
    on conflict(idempotency_key) do nothing;
  end loop;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata) values(actor,'impact_event_submitted','genesis_event',item.id::text,'{}');
  return jsonb_build_object('id',item.id,'status',item.status,'submittedAt',item.submitted_at);
end $$;

create or replace function public.genesis_decide_event(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_profile_user_id(); item public.genesis_events%rowtype; reviewer_type text:=coalesce(payload->>'reviewerType',''); decision text:=coalesce(payload->>'decision',''); published boolean:=false;
begin
  perform public.require_experience_membership('genesis');
  if reviewer_type not in ('mentor','liaison') or decision not in ('approve','changes_requested') then raise exception 'Choose a valid review decision' using errcode='22023'; end if;
  if reviewer_type='mentor' and not exists(select 1 from public.experience_role_assignments where user_id=actor and experience_key='genesis' and role in ('mentor','administrator','creator') and revoked_at is null) then raise exception 'Mentor review role required' using errcode='42501'; end if;
  if reviewer_type='liaison' and not exists(select 1 from public.experience_role_assignments where user_id=actor and experience_key='genesis' and role in ('community_liaison','administrator','creator') and revoked_at is null) then raise exception 'Community Liaison role required' using errcode='42501'; end if;
  select * into item from public.genesis_events where id=(payload->>'eventId')::uuid for update;
  if not found then raise exception 'Event not found' using errcode='22023'; end if;
  if decision='changes_requested' then
    if item.status not in ('submitted','mentor_approved') then raise exception 'This decision is no longer pending' using errcode='23514'; end if;
    insert into public.genesis_event_approvals(event_id,approval_type,decision,reviewer_id,notes) values(item.id,case reviewer_type when 'liaison' then 'community_liaison' else 'mentor' end,'changes_requested',actor,left(coalesce(payload->>'feedback',''),4000)) on conflict(event_id,approval_type) do update set decision='changes_requested',reviewer_id=actor,notes=excluded.notes,decided_at=now();
    update public.genesis_events set status='changes_requested',reviewer_feedback=left(coalesce(payload->>'feedback',''),4000),updated_at=now() where id=item.id returning * into item;
  elsif reviewer_type='mentor' then
    if item.status<>'submitted' then raise exception 'This mentor decision is no longer pending' using errcode='23514'; end if;
    insert into public.genesis_event_approvals(event_id,approval_type,decision,reviewer_id,notes) values(item.id,'mentor','approved',actor,left(coalesce(payload->>'feedback',''),4000)) on conflict(event_id,approval_type) do update set decision='approved',reviewer_id=actor,notes=excluded.notes,decided_at=now();
    update public.genesis_events set status='mentor_approved',mentor_approved_at=now(),updated_at=now() where id=item.id returning * into item;
  else
    if item.status<>'mentor_approved' or item.liaison_approved_at is not null then raise exception 'This Liaison decision is no longer pending' using errcode='23514'; end if;
    insert into public.genesis_event_approvals(event_id,approval_type,decision,reviewer_id,notes) values(item.id,'community_liaison','approved',actor,left(coalesce(payload->>'feedback',''),4000)) on conflict(event_id,approval_type) do update set decision='approved',reviewer_id=actor,notes=excluded.notes,decided_at=now();
    update public.genesis_events set status='published',liaison_approved_at=now(),updated_at=now() where id=item.id returning * into item;
    insert into public.genesis_event_calendar_jobs(event_id,operation,idempotency_key) values(item.id,'create','impact:event:calendar:create:'||item.id) on conflict(idempotency_key) do nothing;
    published:=true;
  end if;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata) values(actor,'impact_event_'||reviewer_type||'_'||decision,'genesis_event',item.id::text,jsonb_build_object('published',published));
  return jsonb_build_object('id',item.id,'status',item.status,'published',published);
end $$;

create or replace function public.genesis_change_event(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_profile_user_id(); item public.genesis_events%rowtype; recipient record; was_published boolean;
begin
  perform public.require_experience_membership('genesis');
  select * into item from public.genesis_events where id=(payload->>'eventId')::uuid for update;
  if not found or (item.created_by<>actor and not exists(select 1 from public.experience_role_assignments where user_id=actor and experience_key='genesis' and role in ('mentor','community_liaison','administrator','creator') and revoked_at is null))
  then raise exception 'This event is outside your assignment' using errcode='42501'; end if;
  if item.status in ('completed','cancelled','archived') then raise exception 'This event can no longer be changed' using errcode='23514'; end if;
  was_published:=item.status='published';
  update public.genesis_events set title=coalesce(nullif(left(payload->>'title',300),''),title),starts_at=coalesce(nullif(payload->>'startsAt','')::timestamptz,starts_at),venue=coalesce(nullif(left(payload->>'venue',500),''),venue),calendar_generation=calendar_generation+1,updated_at=now() where id=item.id returning * into item;
  if was_published then
    insert into public.genesis_event_calendar_jobs(event_id,operation,idempotency_key) values(item.id,'update','impact:event:calendar:update:'||item.id||':'||item.calendar_generation) on conflict(idempotency_key) do nothing;
    for recipient in select distinct user_id from public.experience_role_assignments where experience_key='genesis' and role in ('community_liaison','administrator') and revoked_at is null loop
      insert into public.platform_notifications(experience_key,user_id,category,title,body,deep_link,template_key,idempotency_key,entity_type,entity_id)
      values('genesis',recipient.user_id,'impact_event_changed','Published Impact event changed',item.title||' has updated details.','/app/compass/impact','impact_event_changed','impact:event:changed:'||item.id||':'||item.calendar_generation||':'||recipient.user_id,'genesis_event',item.id) on conflict(idempotency_key) do nothing;
    end loop;
  end if;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata) values(actor,'impact_event_changed','genesis_event',item.id::text,jsonb_build_object('calendarGeneration',item.calendar_generation));
  return jsonb_build_object('id',item.id,'status',item.status,'calendarGeneration',item.calendar_generation);
end $$;

create or replace function public.genesis_cancel_event(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_profile_user_id(); item public.genesis_events%rowtype; recipient record; was_published boolean;
begin
  perform public.require_experience_membership('genesis');
  select * into item from public.genesis_events where id=(payload->>'eventId')::uuid for update;
  if not found or (item.created_by<>actor and not exists(select 1 from public.experience_role_assignments where user_id=actor and experience_key='genesis' and role in ('mentor','community_liaison','administrator','creator') and revoked_at is null))
  then raise exception 'This event is outside your assignment' using errcode='42501'; end if;
  if item.status in ('completed','cancelled','archived') then raise exception 'This event is already closed' using errcode='23514'; end if;
  was_published:=item.status='published';
  update public.genesis_events set status='cancelled',calendar_generation=calendar_generation+1,updated_at=now() where id=item.id returning * into item;
  if was_published then insert into public.genesis_event_calendar_jobs(event_id,operation,idempotency_key) values(item.id,'cancel','impact:event:calendar:cancel:'||item.id||':'||item.calendar_generation) on conflict(idempotency_key) do nothing; end if;
  for recipient in select distinct user_id from public.experience_role_assignments where experience_key='genesis' and role in ('community_liaison','administrator') and revoked_at is null loop
    insert into public.platform_notifications(experience_key,user_id,category,title,body,deep_link,template_key,idempotency_key,entity_type,entity_id)
    values('genesis',recipient.user_id,'impact_event_cancelled','Impact event cancelled',item.title||' was cancelled.','/app/compass/impact','impact_event_cancelled','impact:event:cancelled:'||item.id||':'||recipient.user_id,'genesis_event',item.id) on conflict(idempotency_key) do nothing;
  end loop;
  insert into public.audit_events(actor_id,event_type,subject_type,subject_id,metadata) values(actor,'impact_event_cancelled','genesis_event',item.id::text,jsonb_build_object('calendarGeneration',item.calendar_generation));
  return jsonb_build_object('id',item.id,'status',item.status,'calendarGeneration',item.calendar_generation);
end $$;

-- A student whose final approved affiliation ends keeps every version and may
-- read it, but cannot mutate the canonical Impact record until access resumes.
-- This protects both RPC-driven writes and future direct table paths.
create or replace function public.enforce_genesis_student_write_affiliation()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=public.current_profile_user_id();
  record_owner uuid;
  record_organization uuid;
begin
  if actor is null or not exists(
    select 1 from public.experience_role_assignments
    where user_id=actor and experience_key='genesis' and role='student' and revoked_at is null
  ) then return new; end if;

  case tg_table_name
    when 'genesis_portfolios' then
      record_owner:=new.owner_id; record_organization:=new.organization_id;
    when 'genesis_portfolio_versions' then
      select p.owner_id,p.organization_id into record_owner,record_organization
      from public.genesis_portfolios p where p.id=new.portfolio_id;
    when 'genesis_sources' then
      select p.owner_id,p.organization_id into record_owner,record_organization
      from public.genesis_portfolio_versions v join public.genesis_portfolios p on p.id=v.portfolio_id
      where v.id=new.portfolio_version_id;
    when 'genesis_initiatives' then
      record_owner:=new.created_by; record_organization:=new.organization_id;
    when 'genesis_snapshots' then
      select new.published_by,i.organization_id into record_owner,record_organization
      from public.genesis_initiatives i where i.id=new.initiative_id;
    when 'genesis_handoffs' then
      select new.from_user_id,i.organization_id into record_owner,record_organization
      from public.genesis_initiatives i where i.id=new.initiative_id;
    when 'genesis_events' then
      record_owner:=new.created_by; record_organization:=new.organization_id;
    else return new;
  end case;

  if record_owner=actor and not public.genesis_has_approved_affiliation(actor,record_organization)
  then raise exception 'Impact editing is read-only until an interest-group affiliation is approved' using errcode='42501'; end if;
  return new;
end $$;

drop trigger if exists genesis_portfolios_affiliation_write on public.genesis_portfolios;
create trigger genesis_portfolios_affiliation_write before insert or update on public.genesis_portfolios for each row execute function public.enforce_genesis_student_write_affiliation();
drop trigger if exists genesis_portfolio_versions_affiliation_write on public.genesis_portfolio_versions;
create trigger genesis_portfolio_versions_affiliation_write before insert or update on public.genesis_portfolio_versions for each row execute function public.enforce_genesis_student_write_affiliation();
drop trigger if exists genesis_sources_affiliation_write on public.genesis_sources;
create trigger genesis_sources_affiliation_write before insert or update on public.genesis_sources for each row execute function public.enforce_genesis_student_write_affiliation();
drop trigger if exists genesis_initiatives_affiliation_write on public.genesis_initiatives;
create trigger genesis_initiatives_affiliation_write before insert or update on public.genesis_initiatives for each row execute function public.enforce_genesis_student_write_affiliation();
drop trigger if exists genesis_snapshots_affiliation_write on public.genesis_snapshots;
create trigger genesis_snapshots_affiliation_write before insert or update on public.genesis_snapshots for each row execute function public.enforce_genesis_student_write_affiliation();
drop trigger if exists genesis_handoffs_affiliation_write on public.genesis_handoffs;
create trigger genesis_handoffs_affiliation_write before insert or update on public.genesis_handoffs for each row execute function public.enforce_genesis_student_write_affiliation();
drop trigger if exists genesis_events_affiliation_write on public.genesis_events;
create trigger genesis_events_affiliation_write before insert or update on public.genesis_events for each row execute function public.enforce_genesis_student_write_affiliation();

grant select on public.platform_workspace_preferences to authenticated;
grant execute on function public.platform_save_workspace_preference(jsonb),public.genesis_decide_affiliation(jsonb),public.genesis_has_approved_affiliation(uuid,uuid),public.genesis_submit_event(jsonb),public.genesis_decide_event(jsonb),public.genesis_change_event(jsonb),public.genesis_cancel_event(jsonb) to authenticated;
revoke all on function public.platform_save_workspace_preference(jsonb),public.genesis_decide_affiliation(jsonb),public.genesis_submit_event(jsonb),public.genesis_decide_event(jsonb),public.genesis_change_event(jsonb),public.genesis_cancel_event(jsonb) from public,anon;

commit;
