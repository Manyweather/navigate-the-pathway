begin;

-- Additive Compass advisor workspace records. Existing appointments, encounters,
-- Penji imports, and audit history remain authoritative and are not rewritten.
create table if not exists public.oaca_appointment_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_line_id uuid not null references public.oaca_service_lines(id),
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  provider_id uuid not null references public.oaca_providers(id),
  recurrence text not null check(recurrence in ('weekly','monthly')),
  occurrence_count integer not null check(occurrence_count between 2 and 24),
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.oaca_appointments add column if not exists series_id uuid references public.oaca_appointment_series(id);
alter table public.oaca_appointments add column if not exists series_sequence integer;
alter table public.oaca_appointments add column if not exists confirmation_mode text not null default 'advisor_confirmation' check(confirmation_mode in ('advisor_confirmation','student_confirmation'));
alter table public.oaca_appointments add column if not exists cancellation_category text;
alter table public.oaca_appointments add column if not exists cancellation_note text;
alter table public.oaca_appointments add column if not exists rescheduled_by uuid references public.profiles(user_id);
alter table public.oaca_appointments add column if not exists scheduling_override boolean not null default false;
alter table public.oaca_appointments add column if not exists conflict_acknowledged_at timestamptz;
drop index if exists public.oaca_provider_confirmed_time_unique;
create unique index if not exists oaca_provider_confirmed_time_unique on public.oaca_appointments(provider_id,starts_at)
where status='confirmed' and provider_id is not null and conflict_acknowledged_at is null;

create table if not exists public.oaca_requirement_steps (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.oaca_advising_obligations(id) on delete cascade,
  step_key text not null,
  label text not null,
  responsible_role text not null check(responsible_role in ('academic_advisor','career_advisor','director')),
  assigned_user_id uuid references public.profiles(user_id),
  completed_by uuid references public.profiles(user_id),
  completed_at timestamptz,
  reopened_by uuid references public.profiles(user_id),
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  unique(obligation_id,step_key)
);

create table if not exists public.oaca_action_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  appointment_id uuid references public.oaca_appointments(id) on delete set null,
  title text not null check(char_length(title) between 1 and 500),
  assigned_to_type text not null check(assigned_to_type in ('student','advisor','staff')),
  assigned_to_user_id uuid references public.profiles(user_id),
  due_at date,
  status text not null default 'open' check(status in ('open','completed')),
  created_by uuid not null references public.profiles(user_id),
  completed_by uuid references public.profiles(user_id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oaca_note_addenda (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.oaca_appointments(id) on delete cascade,
  author_id uuid not null references public.profiles(user_id),
  body text not null check(char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);

create table if not exists public.oaca_advisor_handoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  outgoing_provider_id uuid not null references public.oaca_providers(id),
  incoming_provider_id uuid references public.oaca_providers(id),
  status text not null default 'requested' check(status in ('requested','preparation_authorized','prepared','acknowledged','activated','declined','cancelled')),
  request_context text,
  handoff_summary text,
  requested_by uuid not null references public.profiles(user_id),
  authorized_by uuid references public.profiles(user_id),
  acknowledged_by uuid references public.profiles(user_id),
  activated_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oaca_advisor_handoff_history (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.oaca_advisor_handoffs(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid not null references public.profiles(user_id),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.oaca_advisor_attention_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  advisor_id uuid not null references public.profiles(user_id) on delete cascade,
  label text not null check(char_length(label) between 1 and 240),
  note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.oaca_academic_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null,
  current_version integer not null default 0,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.oaca_academic_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.oaca_academic_plans(id) on delete cascade,
  version integer not null,
  content text not null,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  unique(plan_id,version)
);

create table if not exists public.oaca_advisor_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  kind text not null check(kind in ('form','note','study_plan')),
  current_version integer not null default 0,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(organization_id,name,kind)
);

create table if not exists public.oaca_advisor_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.oaca_advisor_templates(id) on delete cascade,
  version integer not null,
  content text not null,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  unique(template_id,version)
);

create table if not exists public.oaca_career_roadmap_completions (
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  item_key text not null,
  completed_by uuid not null references public.profiles(user_id),
  completed_at timestamptz not null default now(),
  primary key(student_id,item_key)
);

create table if not exists public.oaca_saved_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  workspace text not null check(workspace in ('academic','career')),
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oaca_report_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references public.profiles(user_id),
  workspace text not null check(workspace in ('academic','career')),
  format text not null check(format in ('csv','xlsx')),
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check(status in ('queued','completed','failed','expired')),
  minimum_group_size integer not null default 10,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.oaca_advisor_availability_preferences (
  provider_id uuid primary key references public.oaca_providers(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid not null references public.profiles(user_id),
  updated_at timestamptz not null default now()
);

alter table public.oaca_threads add column if not exists student_id uuid references public.profiles(user_id);
alter table public.oaca_threads add column if not exists assigned_to_user_id uuid references public.profiles(user_id);
create unique index if not exists oaca_continuous_student_thread on public.oaca_threads(organization_id,student_id) where kind='service_inbox' and student_id is not null;

-- Map existing provider/service assignments into the new capability layer.
insert into public.experience_capability_assignments(user_id,experience_key,capability,organization_id,granted_at)
select distinct p.user_id,'oaca',case s.key when 'academic_advising' then 'oaca.advisor.academic' when 'career_advising' then 'oaca.advisor.career' end,p.organization_id,now()
from public.oaca_providers p join public.oaca_provider_services ps on ps.provider_id=p.id join public.oaca_service_lines s on s.id=ps.service_line_id
where p.active and s.key in ('academic_advising','career_advising')
on conflict do nothing;

create or replace function public.oaca_is_active_advisor(org uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.staff_mfa_verified() and (
    exists(select 1 from public.experience_role_assignments r where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.organization_id=org and r.role in ('administrator','creator') and r.revoked_at is null)
    or exists(select 1 from public.oaca_providers p join public.oaca_provider_services ps on ps.provider_id=p.id join public.oaca_service_lines s on s.id=ps.service_line_id where p.user_id=public.current_profile_user_id() and p.organization_id=org and p.active and s.key in ('academic_advising','career_advising'))
  );
$$;

create or replace function public.oaca_advisor_org(workspace text)
returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare org uuid;
begin
  if workspace not in ('academic','career') then raise exception 'Choose an Academic or Career Advisor workspace' using errcode='22023'; end if;
  select p.organization_id into org from public.oaca_providers p join public.oaca_provider_services ps on ps.provider_id=p.id join public.oaca_service_lines s on s.id=ps.service_line_id where p.user_id=public.current_profile_user_id() and p.active and s.key=workspace||'_advising' limit 1;
  if org is null then select r.organization_id into org from public.experience_role_assignments r where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.role in ('administrator','creator') and r.revoked_at is null and r.organization_id is not null limit 1; end if;
  if org is null or not public.oaca_is_active_advisor(org) then raise exception 'Active Compass advisor access with MFA is required' using errcode='42501'; end if;
  return org;
end $$;

alter table public.oaca_appointment_series enable row level security;
alter table public.oaca_requirement_steps enable row level security;
alter table public.oaca_action_items enable row level security;
alter table public.oaca_note_addenda enable row level security;
alter table public.oaca_advisor_handoffs enable row level security;
alter table public.oaca_advisor_handoff_history enable row level security;
alter table public.oaca_advisor_attention_flags enable row level security;
alter table public.oaca_academic_plans enable row level security;
alter table public.oaca_academic_plan_versions enable row level security;
alter table public.oaca_advisor_templates enable row level security;
alter table public.oaca_advisor_template_versions enable row level security;
alter table public.oaca_career_roadmap_completions enable row level security;
alter table public.oaca_saved_reports enable row level security;
alter table public.oaca_report_exports enable row level security;
alter table public.oaca_advisor_availability_preferences enable row level security;

drop policy if exists oaca_records_staff_only on public.oaca_encounter_records;
create policy oaca_records_advisors on public.oaca_encounter_records for select to authenticated using(exists(select 1 from public.oaca_appointments a where a.id=appointment_id and public.oaca_is_active_advisor(a.organization_id)));
create policy oaca_record_revisions_advisors on public.oaca_record_revisions for select to authenticated using(exists(select 1 from public.oaca_appointments a where a.id=appointment_id and public.oaca_is_active_advisor(a.organization_id)));
create policy oaca_appointments_advisors on public.oaca_appointments for select to authenticated using(public.oaca_is_active_advisor(organization_id));
create policy oaca_series_advisors on public.oaca_appointment_series for select to authenticated using(public.oaca_is_active_advisor(organization_id));
create policy oaca_requirement_steps_advisors on public.oaca_requirement_steps for select to authenticated using(exists(select 1 from public.oaca_advising_obligations o where o.id=obligation_id and public.oaca_is_active_advisor(o.organization_id)));
create policy oaca_action_items_parties on public.oaca_action_items for select to authenticated using(student_id=public.current_profile_user_id() or public.oaca_is_active_advisor(organization_id));
create policy oaca_note_addenda_advisors on public.oaca_note_addenda for select to authenticated using(exists(select 1 from public.oaca_appointments a where a.id=appointment_id and public.oaca_is_active_advisor(a.organization_id)));
create policy oaca_handoffs_advisors on public.oaca_advisor_handoffs for select to authenticated using(public.oaca_is_active_advisor(organization_id));
create policy oaca_handoff_history_advisors on public.oaca_advisor_handoff_history for select to authenticated using(exists(select 1 from public.oaca_advisor_handoffs h where h.id=handoff_id and public.oaca_is_active_advisor(h.organization_id)));
create policy oaca_attention_flags_private on public.oaca_advisor_attention_flags for select to authenticated using(advisor_id=public.current_profile_user_id());
create policy oaca_academic_plans_advisors on public.oaca_academic_plans for select to authenticated using(public.oaca_is_active_advisor(organization_id));
create policy oaca_plan_versions_advisors on public.oaca_academic_plan_versions for select to authenticated using(exists(select 1 from public.oaca_academic_plans p where p.id=plan_id and public.oaca_is_active_advisor(p.organization_id)));
create policy oaca_templates_advisors on public.oaca_advisor_templates for select to authenticated using(public.oaca_is_active_advisor(organization_id));
create policy oaca_template_versions_advisors on public.oaca_advisor_template_versions for select to authenticated using(exists(select 1 from public.oaca_advisor_templates t where t.id=template_id and public.oaca_is_active_advisor(t.organization_id)));
create policy oaca_roadmap_advisors on public.oaca_career_roadmap_completions for select to authenticated using(exists(select 1 from public.experience_role_assignments r where r.user_id=student_id and r.experience_key='oaca' and r.organization_id=public.oaca_advisor_org('career') and r.revoked_at is null));
create policy oaca_saved_reports_owner on public.oaca_saved_reports for select to authenticated using(owner_id=public.current_profile_user_id());
create policy oaca_report_exports_owner on public.oaca_report_exports for select to authenticated using(requested_by=public.current_profile_user_id());
create policy oaca_availability_owner on public.oaca_advisor_availability_preferences for select to authenticated using(exists(select 1 from public.oaca_providers p where p.id=provider_id and p.user_id=public.current_profile_user_id()));

create or replace function public.oaca_advisor_workspace(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_variable
declare workspace text:=coalesce(payload->>'workspace','academic'); org uuid; actor uuid:=public.current_profile_user_id(); provider public.oaca_providers%rowtype; allowed jsonb; result jsonb;
begin
  perform public.require_experience_membership('oaca'); org:=public.oaca_advisor_org(workspace);
  select p.* into provider from public.oaca_providers p join public.oaca_provider_services ps on ps.provider_id=p.id join public.oaca_service_lines s on s.id=ps.service_line_id where p.user_id=actor and p.organization_id=org and p.active and s.key=workspace||'_advising' limit 1;
  select coalesce(jsonb_agg(x.workspace order by x.workspace),'[]'::jsonb) into allowed from (
    select distinct case s.key when 'academic_advising' then 'academic' else 'career' end workspace from public.oaca_providers p join public.oaca_provider_services ps on ps.provider_id=p.id join public.oaca_service_lines s on s.id=ps.service_line_id where p.user_id=actor and p.organization_id=org and p.active and s.key in ('academic_advising','career_advising')
    union select 'academic' where exists(select 1 from public.experience_role_assignments r where r.user_id=actor and r.experience_key='oaca' and r.organization_id=org and r.role in ('administrator','creator') and r.revoked_at is null)
    union select 'career' where exists(select 1 from public.experience_role_assignments r where r.user_id=actor and r.experience_key='oaca' and r.organization_id=org and r.role in ('administrator','creator') and r.revoked_at is null)
  ) x;
  select jsonb_build_object(
    'allowedWorkspaces',allowed,'activeWorkspace',workspace,'currentAdvisorName',coalesce((select display_name from public.profiles where user_id=actor),'Compass advisor'),'minimumGroupSize',10,
    'students',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'displayName',p.display_name,'cohortLabel',coalesce(d.cohort_label,'RUCOM'),'phase',coalesce(d.current_phase,'Current phase'),'year',coalesce(d.current_year,'Current year'),'campus',coalesce(d.campus,'Campus on file'),'assignedAdvisorName',(select ap.display_name from public.oaca_advisor_assignments aa join public.oaca_providers prv on prv.id=aa.provider_id join public.profiles ap on ap.user_id=prv.user_id where aa.student_id=p.user_id and aa.ended_at is null order by aa.assigned_at desc limit 1),'relationship',case when workspace='career' then 'career_service' when exists(select 1 from public.oaca_advisor_assignments aa where aa.student_id=p.user_id and aa.provider_id=provider.id and aa.ended_at is null) then 'assigned' when exists(select 1 from public.oaca_appointments a join public.oaca_service_lines s on s.id=a.service_line_id where a.student_id=p.user_id and a.provider_id=provider.id and s.key='academic_advising' and a.created_at>now()-interval '90 days') then 'drop_in' else 'outside_caseload' end,'lastVisitAt',(select max(a.starts_at) from public.oaca_appointments a where a.student_id=p.user_id and a.status='completed'),'nextVisitAt',(select min(a.starts_at) from public.oaca_appointments a where a.student_id=p.user_id and a.status='confirmed' and a.starts_at>=now()),'openMilestones',(select count(*) from public.oaca_advising_obligations o where o.student_id=p.user_id and o.status in ('open','scheduled')),'openTasks',(select count(*) from public.oaca_action_items t where t.student_id=p.user_id and t.status='open'),'noShows',(select count(*) from public.oaca_appointments a where a.student_id=p.user_id and a.status='no_show')) order by p.display_name) from public.profiles p join public.experience_role_assignments r on r.user_id=p.user_id and r.experience_key='oaca' and r.organization_id=org and r.role='student' and r.revoked_at is null left join lateral(select * from public.oaca_student_dimensions x where x.student_id=p.user_id and x.organization_id=org and x.effective_to is null order by x.effective_from desc limit 1)d on true where p.status='active'),'[]'::jsonb),
    'appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'studentId',a.student_id,'studentName',sp.display_name,'serviceName',s.name,'providerName',ap.display_name,'subject',a.subject,'startsAt',a.starts_at,'endsAt',a.ends_at,'modality',a.modality,'status',a.status,'requestOrigin',a.request_origin,'studentRecap',er.student_recap) order by a.starts_at) from public.oaca_appointments a join public.oaca_service_lines s on s.id=a.service_line_id join public.profiles sp on sp.user_id=a.student_id left join public.oaca_providers prv on prv.id=a.provider_id left join public.profiles ap on ap.user_id=prv.user_id left join public.oaca_encounter_records er on er.appointment_id=a.id where a.organization_id=org and s.key=workspace||'_advising'),'[]'::jsonb),
    'encounterRecords',coalesce((select jsonb_agg(jsonb_build_object('appointmentId',er.appointment_id,'workingNotes',er.staff_working_notes,'studentRecap',er.student_recap,'structuredData',er.structured_data,'revision',er.version,'updatedAt',er.updated_at,'publishedAt',er.recap_published_at)) from public.oaca_encounter_records er join public.oaca_appointments a on a.id=er.appointment_id where a.organization_id=org),'[]'::jsonb),
    'obligations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'studentId',o.student_id,'studentName',p.display_name,'title',r.summary,'serviceKey',r.service_key,'dueAt',o.due_at,'status',o.status)) from public.oaca_advising_obligations o join public.oaca_policy_rules r on r.id=o.policy_rule_id join public.profiles p on p.user_id=o.student_id where o.organization_id=org),'[]'::jsonb),
    'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'studentId',t.student_id,'studentName',p.display_name,'title',t.title,'assignedTo',t.assigned_to_type,'dueAt',t.due_at,'status',t.status,'appointmentId',t.appointment_id) order by t.due_at nulls last) from public.oaca_action_items t join public.profiles p on p.user_id=t.student_id where t.organization_id=org),'[]'::jsonb),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'studentId',coalesce(t.student_id,a.student_id),'studentName',student.display_name,'senderName',sender.display_name,'body',m.body,'createdAt',m.created_at,'assignedToName',assigned.display_name,'unread',false) order by m.created_at) from public.oaca_messages m join public.oaca_threads t on t.id=m.thread_id left join public.oaca_appointments a on a.id=t.appointment_id left join public.profiles student on student.user_id=coalesce(t.student_id,a.student_id) join public.profiles sender on sender.user_id=m.sender_id left join public.profiles assigned on assigned.user_id=t.assigned_to_user_id where t.organization_id=org),'[]'::jsonb),
    'addenda',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'appointmentId',n.appointment_id,'authorName',p.display_name,'body',n.body,'createdAt',n.created_at) order by n.created_at) from public.oaca_note_addenda n join public.profiles p on p.user_id=n.author_id join public.oaca_appointments a on a.id=n.appointment_id where a.organization_id=org),'[]'::jsonb),
    'roadmapCompletions',coalesce((select jsonb_agg(jsonb_build_object('studentId',c.student_id,'itemKey',c.item_key,'completedAt',c.completed_at,'completedByName',p.display_name)) from public.oaca_career_roadmap_completions c join public.profiles p on p.user_id=c.completed_by join public.experience_role_assignments r on r.user_id=c.student_id and r.experience_key='oaca' and r.organization_id=org and r.revoked_at is null),'[]'::jsonb),
    'templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'kind',t.kind,'version',t.current_version,'authorName',p.display_name)) from public.oaca_advisor_templates t join public.profiles p on p.user_id=t.created_by where t.organization_id=org and t.archived_at is null),'[]'::jsonb),
    'savedReports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'workspace',r.workspace,'createdAt',r.created_at)) from public.oaca_saved_reports r where r.owner_id=actor and r.workspace=workspace),'[]'::jsonb),
    'attentionFlags',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'studentId',f.student_id,'label',f.label,'createdAt',f.created_at)) from public.oaca_advisor_attention_flags f where f.advisor_id=actor and f.resolved_at is null),'[]'::jsonb),
    'attention',jsonb_build_array(
      jsonb_build_object('key','pending_request','label','Appointment requests awaiting a decision','count',(select count(*) from public.oaca_appointments a join public.oaca_service_lines s on s.id=a.service_line_id where a.organization_id=org and s.key=workspace||'_advising' and a.status in ('pending_approval','counterproposed'))),
      jsonb_build_object('key','task_due','label','Open actions due today or overdue','count',(select count(*) from public.oaca_action_items t where t.organization_id=org and t.status='open' and t.due_at<=current_date)),
      jsonb_build_object('key','no_show','label','No-shows awaiting a follow-up choice','count',(select count(*) from public.oaca_appointments a join public.oaca_service_lines s on s.id=a.service_line_id where a.organization_id=org and s.key=workspace||'_advising' and a.status='no_show')))
  ) into result;
  return result;
end $$;

create or replace function public.oaca_advisor_schedule(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare workspace text:=coalesce(payload->>'workspace','academic'); org uuid; actor uuid:=public.current_profile_user_id(); provider public.oaca_providers%rowtype; service public.oaca_service_lines%rowtype; student uuid; start_time timestamptz; end_time timestamptz; recurrence text:=coalesce(payload->>'recurrence','none'); occurrences integer:=case when recurrence='none' then 1 else least(24,greatest(2,coalesce((payload->>'recurrenceCount')::integer,2))) end; series uuid; idx integer; saved public.oaca_appointments%rowtype; conflicts boolean; allow_conflict boolean:=coalesce((payload->>'allowConflict')::boolean,false); confirmation text:=coalesce(payload->>'confirmationMode','confirmed'); block_key text; dropin_count integer;
begin
  perform public.require_experience_membership('oaca'); org:=public.oaca_advisor_org(workspace);
  begin student:=(payload->>'studentId')::uuid; start_time:=(payload->>'startsAt')::timestamptz; exception when others then raise exception 'Choose a valid student and appointment time' using errcode='22023'; end;
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
    end_time:=start_time+make_interval(mins=>coalesce(service.duration_minutes,30));
    select exists(select 1 from public.oaca_appointments a where a.provider_id=provider.id and a.status='confirmed' and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(start_time,end_time,'[)')) into conflicts;
    if conflicts and not allow_conflict then raise exception 'Scheduling conflict detected. Review it, then explicitly confirm the override to double-book.' using errcode='23505'; end if;
    insert into public.oaca_appointments(organization_id,student_id,provider_id,service_line_id,subject,format,modality,starts_at,ends_at,status,sandbox,created_by,request_origin,policy_context,series_id,series_sequence,confirmation_mode,scheduling_override,conflict_acknowledged_at)
    values(org,student,provider.id,service.id,nullif(left(coalesce(payload->>'topic',''),240),''),'individual',coalesce(payload->>'modality','teams'),start_time,end_time,case when confirmation='student_confirmation' then 'pending_approval' else 'confirmed' end,true,actor,'advisor',jsonb_build_object('dropInBlockKey',block_key),series,idx,case when confirmation='student_confirmation' then 'student_confirmation' else 'advisor_confirmation' end,coalesce((payload->>'overrideLimit')::boolean,false),case when conflicts and allow_conflict then now() end) returning * into saved;
    insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(org,actor,'oaca_advisor_appointment_created','oaca_appointment',saved.id,jsonb_build_object('experienceKey','oaca','workspace',workspace,'studentId',student,'seriesId',series,'conflictOverride',conflicts and allow_conflict));
    start_time:=case recurrence when 'weekly' then start_time+interval '7 days' when 'monthly' then start_time+interval '1 month' else start_time end;
  end loop;
  return jsonb_build_object('id',saved.id,'status',saved.status,'seriesId',series,'occurrenceCount',occurrences);
end $$;

create or replace function public.oaca_advisor_save_attention_flag(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_advisor_org(coalesce(payload->>'workspace','academic')); saved public.oaca_advisor_attention_flags%rowtype;
begin
  if not exists(select 1 from public.experience_role_assignments r where r.user_id=(payload->>'studentId')::uuid and r.experience_key='oaca' and r.organization_id=org and r.role='student' and r.revoked_at is null) then raise exception 'Student not found' using errcode='42501'; end if;
  insert into public.oaca_advisor_attention_flags(organization_id,student_id,advisor_id,label) values(org,(payload->>'studentId')::uuid,public.current_profile_user_id(),left(trim(payload->>'label'),240)) returning * into saved;
  return jsonb_build_object('id',saved.id,'studentId',saved.student_id,'label',saved.label,'createdAt',saved.created_at);
end $$;

create or replace function public.oaca_advisor_open_student(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare workspace text:=coalesce(payload->>'workspace','academic'); org uuid:=public.oaca_advisor_org(workspace); student uuid:=(payload->>'studentId')::uuid; actor uuid:=public.current_profile_user_id(); outside_caseload boolean;
begin
  if not exists(select 1 from public.experience_role_assignments r where r.user_id=student and r.experience_key='oaca' and r.organization_id=org and r.role='student' and r.revoked_at is null) then raise exception 'Student not found' using errcode='42501'; end if;
  outside_caseload:=workspace='academic' and not exists(select 1 from public.oaca_advisor_assignments a join public.oaca_providers p on p.id=a.provider_id where a.student_id=student and a.ended_at is null and p.user_id=actor);
  if outside_caseload then insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(org,actor,'oaca_outside_caseload_record_opened','profile',student,jsonb_build_object('experienceKey','oaca','workspace',workspace)); end if;
  return jsonb_build_object('studentId',student,'audited',outside_caseload,'recordsScoped',true);
end $$;

create or replace function public.oaca_advisor_quick_encounter(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare workspace text:=coalesce(payload->>'workspace','academic'); org uuid; actor uuid:=public.current_profile_user_id(); service public.oaca_service_lines%rowtype; provider public.oaca_providers%rowtype; student uuid; saved public.oaca_appointments%rowtype;
begin
  org:=public.oaca_advisor_org(workspace); student:=(payload->>'studentId')::uuid;
  select * into service from public.oaca_service_lines where organization_id=org and key=workspace||'_advising'; select * into provider from public.oaca_providers where user_id=actor and organization_id=org and active limit 1;
  insert into public.oaca_appointments(organization_id,student_id,provider_id,service_line_id,subject,format,modality,starts_at,ends_at,status,sandbox,created_by,request_origin,confirmation_mode)
  values(org,student,provider.id,service.id,left(coalesce(payload->>'topic','Quick encounter'),240),'drop_in',coalesce(payload->>'modality','in_person'),coalesce(nullif(payload->>'occurredAt','')::timestamptz,now()),coalesce(nullif(payload->>'occurredAt','')::timestamptz,now()),'completed',true,actor,'advisor','advisor_confirmation') returning * into saved;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(org,actor,'oaca_quick_encounter_recorded','oaca_appointment',saved.id,jsonb_build_object('experienceKey','oaca','studentId',student));
  return jsonb_build_object('id',saved.id,'status',saved.status);
end $$;

create or replace function public.oaca_advisor_reschedule(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.oaca_appointments%rowtype; next_start timestamptz; next_end timestamptz; conflict boolean; actor uuid:=public.current_profile_user_id();
begin
  select a.* into saved from public.oaca_appointments a where a.id=(payload->>'appointmentId')::uuid and public.oaca_is_active_advisor(a.organization_id); if not found then raise exception 'Appointment not found' using errcode='42501'; end if;
  next_start:=(payload->>'startsAt')::timestamptz; next_end:=next_start+(saved.ends_at-saved.starts_at);
  select exists(select 1 from public.oaca_appointments a where a.provider_id=saved.provider_id and a.id<>saved.id and a.status='confirmed' and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(next_start,next_end,'[)')) into conflict;
  if conflict and not coalesce((payload->>'allowConflict')::boolean,false) then raise exception 'Scheduling conflict detected. Explicitly confirm the override to continue.' using errcode='23505'; end if;
  update public.oaca_appointments set prior_confirmed_starts_at=starts_at,prior_confirmed_ends_at=ends_at,starts_at=next_start,ends_at=next_end,status='confirmed',rescheduled_by=actor,conflict_acknowledged_at=case when conflict then now() end,updated_at=now() where id=saved.id returning * into saved;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(saved.organization_id,actor,'oaca_appointment_rescheduled_by_advisor','oaca_appointment',saved.id,jsonb_build_object('experienceKey','oaca','conflictOverride',conflict));
  return jsonb_build_object('id',saved.id,'status',saved.status,'startsAt',saved.starts_at);
end $$;

create or replace function public.oaca_advisor_cancel(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.oaca_appointments%rowtype; actor uuid:=public.current_profile_user_id();
begin
  update public.oaca_appointments a set status='cancelled',cancelled_at=now(),cancellation_category=nullif(left(coalesce(payload->>'category',''),100),''),cancellation_note=nullif(left(coalesce(payload->>'note',''),2000),''),updated_at=now() where a.id=(payload->>'appointmentId')::uuid and public.oaca_is_active_advisor(a.organization_id) returning * into saved;
  if not found then raise exception 'Appointment not found' using errcode='42501'; end if;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(saved.organization_id,actor,'oaca_appointment_cancelled_by_advisor','oaca_appointment',saved.id,jsonb_build_object('experienceKey','oaca','category',saved.cancellation_category));
  return jsonb_build_object('id',saved.id,'status',saved.status);
end $$;

create or replace function public.oaca_advisor_add_addendum(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.oaca_note_addenda%rowtype; appt public.oaca_appointments%rowtype;
begin
  select * into appt from public.oaca_appointments where id=(payload->>'appointmentId')::uuid and public.oaca_is_active_advisor(organization_id); if not found then raise exception 'Encounter not found' using errcode='42501'; end if;
  insert into public.oaca_note_addenda(appointment_id,author_id,body) values(appt.id,public.current_profile_user_id(),left(trim(payload->>'body'),10000)) returning * into saved;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(appt.organization_id,public.current_profile_user_id(),'oaca_note_addendum_added','oaca_appointment',appt.id,jsonb_build_object('experienceKey','oaca','addendumId',saved.id));
  return jsonb_build_object('id',saved.id,'appointmentId',saved.appointment_id,'createdAt',saved.created_at);
end $$;

create or replace function public.oaca_advisor_save_task(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_advisor_org(coalesce(payload->>'workspace','academic')); saved public.oaca_action_items%rowtype; student uuid:=(payload->>'studentId')::uuid; assigned uuid;
begin
  assigned:=case when payload->>'assignedTo'='student' then student else public.current_profile_user_id() end;
  insert into public.oaca_action_items(organization_id,student_id,appointment_id,title,assigned_to_type,assigned_to_user_id,due_at,created_by) values(org,student,nullif(payload->>'appointmentId','')::uuid,left(trim(payload->>'title'),500),coalesce(payload->>'assignedTo','student'),assigned,nullif(payload->>'dueAt','')::date,public.current_profile_user_id()) returning * into saved;
  return jsonb_build_object('id',saved.id,'status',saved.status);
end $$;

create or replace function public.oaca_advisor_update_task(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.oaca_action_items%rowtype; actor uuid:=public.current_profile_user_id();
begin
  update public.oaca_action_items t set status=case when payload->>'action'='reopen' then 'open' else 'completed' end,completed_by=case when payload->>'action'='reopen' then null else actor end,completed_at=case when payload->>'action'='reopen' then null else now() end,updated_at=now() where t.id=(payload->>'taskId')::uuid and (t.student_id=actor or public.oaca_is_active_advisor(t.organization_id)) returning * into saved;
  if not found then raise exception 'Task not found' using errcode='42501'; end if; return jsonb_build_object('id',saved.id,'status',saved.status);
end $$;

create or replace function public.oaca_advisor_send_message(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_advisor_org(coalesce(payload->>'workspace','academic')); student uuid:=(payload->>'studentId')::uuid; thread public.oaca_threads%rowtype; saved public.oaca_messages%rowtype; assigned uuid;
begin
  select prv.user_id into assigned from public.oaca_advisor_assignments a join public.oaca_providers prv on prv.id=a.provider_id where a.student_id=student and a.ended_at is null order by a.assigned_at desc limit 1;
  insert into public.oaca_threads(organization_id,kind,student_id,assigned_to_user_id) values(org,'service_inbox',student,assigned) on conflict(organization_id,student_id) where kind='service_inbox' and student_id is not null do update set assigned_to_user_id=coalesce(oaca_threads.assigned_to_user_id,excluded.assigned_to_user_id) returning * into thread;
  insert into public.oaca_thread_participants(thread_id,user_id,participant_role) values(thread.id,student,'student'),(thread.id,public.current_profile_user_id(),'advisor') on conflict do nothing;
  insert into public.oaca_messages(thread_id,sender_id,body) values(thread.id,public.current_profile_user_id(),left(trim(payload->>'body'),5000)) returning * into saved;
  return jsonb_build_object('id',saved.id,'threadId',thread.id,'createdAt',saved.created_at);
end $$;

create or replace function public.oaca_advisor_complete_requirement_step(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare obligation public.oaca_advising_obligations%rowtype; saved public.oaca_requirement_steps%rowtype; actor uuid:=public.current_profile_user_id();
begin
  select * into obligation from public.oaca_advising_obligations where id=(payload->>'obligationId')::uuid and public.oaca_is_active_advisor(organization_id); if not found then raise exception 'Requirement not found' using errcode='42501'; end if;
  insert into public.oaca_requirement_steps(obligation_id,step_key,label,responsible_role,assigned_user_id,completed_by,completed_at) values(obligation.id,coalesce(payload->>'stepKey','academic_advisor'),coalesce(payload->>'label','Advisor step'),'academic_advisor',actor,actor,now()) on conflict(obligation_id,step_key) do update set completed_by=actor,completed_at=now(),reopened_by=null,reopened_at=null returning * into saved;
  if not exists(select 1 from public.oaca_requirement_steps s where s.obligation_id=obligation.id and s.completed_at is null) then update public.oaca_advising_obligations set status='completed' where id=obligation.id; end if;
  return jsonb_build_object('id',saved.id,'status','completed');
end $$;

create or replace function public.oaca_advisor_save_plan(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_advisor_org('academic'); plan public.oaca_academic_plans%rowtype; next_version integer;
begin
  select * into plan from public.oaca_academic_plans where organization_id=org and student_id=(payload->>'studentId')::uuid and lower(title)=lower(trim(payload->>'title')) and archived_at is null limit 1;
  if not found then insert into public.oaca_academic_plans(organization_id,student_id,title,created_by) values(org,(payload->>'studentId')::uuid,left(trim(payload->>'title'),240),public.current_profile_user_id()) returning * into plan; end if;
  next_version:=plan.current_version+1; insert into public.oaca_academic_plan_versions(plan_id,version,content,created_by) values(plan.id,next_version,left(payload->>'content',30000),public.current_profile_user_id()); update public.oaca_academic_plans set current_version=next_version where id=plan.id;
  return jsonb_build_object('id',plan.id,'version',next_version);
end $$;

create or replace function public.oaca_advisor_update_career_roadmap(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare student uuid:=(payload->>'studentId')::uuid; item text:=left(payload->>'itemKey',120); completed boolean:=coalesce((payload->>'completed')::boolean,true);
begin
  perform public.oaca_advisor_org('career'); delete from public.oaca_career_roadmap_completions where student_id=student and item_key=item;
  if completed then insert into public.oaca_career_roadmap_completions(student_id,item_key,completed_by) values(student,item,public.current_profile_user_id()); end if;
  return jsonb_build_object('studentId',student,'itemKey',item,'completed',completed);
end $$;

create or replace function public.oaca_advisor_save_template(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_advisor_org(coalesce(payload->>'workspace','academic')); template public.oaca_advisor_templates%rowtype; next_version integer; kind_key text:=coalesce(payload->>'kind','study_plan');
begin
  insert into public.oaca_advisor_templates(organization_id,name,kind,created_by) values(org,left(trim(payload->>'name'),240),kind_key,public.current_profile_user_id()) on conflict(organization_id,name,kind) do update set archived_at=null returning * into template;
  next_version:=template.current_version+1; insert into public.oaca_advisor_template_versions(template_id,version,content,created_by) values(template.id,next_version,left(coalesce(payload->>'content',''),30000),public.current_profile_user_id()); update public.oaca_advisor_templates set current_version=next_version where id=template.id;
  return jsonb_build_object('id',template.id,'version',next_version);
end $$;

create or replace function public.oaca_advisor_save_report(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_variable
declare workspace text:=coalesce(payload->>'workspace','academic'); org uuid:=public.oaca_advisor_org(workspace); saved public.oaca_saved_reports%rowtype;
begin
  insert into public.oaca_saved_reports(organization_id,owner_id,workspace,name,filters,columns) values(org,public.current_profile_user_id(),workspace,left(trim(payload->>'name'),240),coalesce(payload->'filters','{}'),coalesce(payload->'columns','[]')) returning * into saved; return jsonb_build_object('id',saved.id,'createdAt',saved.created_at);
end $$;

create or replace function public.oaca_advisor_prepare_export(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_variable
declare workspace text:=coalesce(payload->>'workspace','academic'); org uuid:=public.oaca_advisor_org(workspace); saved public.oaca_report_exports%rowtype;
begin
  insert into public.oaca_report_exports(organization_id,requested_by,workspace,format,filters) values(org,public.current_profile_user_id(),workspace,coalesce(payload->>'format','csv'),coalesce(payload->'filters','{}')) returning * into saved;
  insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(org,public.current_profile_user_id(),'oaca_report_export_requested','oaca_report_export',saved.id,jsonb_build_object('experienceKey','oaca','format',saved.format,'minimumGroupSize',10));
  return jsonb_build_object('id',saved.id,'status',saved.status,'format',saved.format,'minimumGroupSize',10);
end $$;

create or replace function public.oaca_advisor_save_availability(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_advisor_org(coalesce(payload->>'workspace','academic')); provider uuid;
begin
  select id into provider from public.oaca_providers where user_id=public.current_profile_user_id() and organization_id=org and active limit 1; if provider is null then raise exception 'Provider record required' using errcode='42501'; end if;
  insert into public.oaca_advisor_availability_preferences(provider_id,settings,updated_by) values(provider,payload,public.current_profile_user_id()) on conflict(provider_id) do update set settings=excluded.settings,updated_by=excluded.updated_by,updated_at=now(); return jsonb_build_object('providerId',provider,'status','saved');
end $$;

create or replace function public.oaca_advisor_update_handoff(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.oaca_advisor_org('academic'); actor uuid:=public.current_profile_user_id(); saved public.oaca_advisor_handoffs%rowtype; action text:=coalesce(payload->>'action','request'); old_status text; admin boolean;
begin
  admin:=exists(select 1 from public.experience_role_assignments r where r.user_id=actor and r.experience_key='oaca' and r.organization_id=org and r.role in ('administrator','creator') and r.revoked_at is null);
  if action='request' then
    insert into public.oaca_advisor_handoffs(organization_id,student_id,outgoing_provider_id,incoming_provider_id,request_context,requested_by) values(org,(payload->>'studentId')::uuid,(payload->>'outgoingProviderId')::uuid,nullif(payload->>'incomingProviderId','')::uuid,left(coalesce(payload->>'note',''),4000),actor) returning * into saved;
  else
    select * into saved from public.oaca_advisor_handoffs where id=(payload->>'handoffId')::uuid and organization_id=org; if not found then raise exception 'Handoff not found' using errcode='42501'; end if; old_status:=saved.status;
    if action='authorize' and admin and saved.status='requested' then update public.oaca_advisor_handoffs set status='preparation_authorized',authorized_by=actor,updated_at=now() where id=saved.id returning * into saved;
    elsif action='prepare' and saved.status='preparation_authorized' then update public.oaca_advisor_handoffs set status='prepared',handoff_summary=left(coalesce(payload->>'note',''),10000),updated_at=now() where id=saved.id returning * into saved;
    elsif action='acknowledge' and saved.status='prepared' then update public.oaca_advisor_handoffs set status='acknowledged',acknowledged_by=actor,updated_at=now() where id=saved.id returning * into saved;
    elsif action='activate' and admin and saved.status='acknowledged' then
      if saved.incoming_provider_id is null then raise exception 'Choose the incoming advisor before activation' using errcode='23514'; end if;
      update public.oaca_advisor_assignments set ended_at=now() where student_id=saved.student_id and provider_id=saved.outgoing_provider_id and ended_at is null;
      insert into public.oaca_advisor_assignments(student_id,provider_id,assigned_at) values(saved.student_id,saved.incoming_provider_id,now());
      update public.oaca_advisor_handoffs set status='activated',activated_by=actor,updated_at=now() where id=saved.id returning * into saved;
    else raise exception 'That handoff step is out of sequence or requires an administrator' using errcode='23514'; end if;
  end if;
  insert into public.oaca_advisor_handoff_history(handoff_id,from_status,to_status,actor_id,note) values(saved.id,old_status,saved.status,actor,left(coalesce(payload->>'note',''),4000)); return jsonb_build_object('id',saved.id,'status',saved.status);
end $$;

revoke all on function public.oaca_is_active_advisor(uuid),public.oaca_advisor_org(text),public.oaca_advisor_workspace(jsonb),public.oaca_advisor_schedule(jsonb),public.oaca_advisor_save_attention_flag(jsonb),public.oaca_advisor_open_student(jsonb),public.oaca_advisor_quick_encounter(jsonb),public.oaca_advisor_reschedule(jsonb),public.oaca_advisor_cancel(jsonb),public.oaca_advisor_add_addendum(jsonb),public.oaca_advisor_save_task(jsonb),public.oaca_advisor_update_task(jsonb),public.oaca_advisor_send_message(jsonb),public.oaca_advisor_complete_requirement_step(jsonb),public.oaca_advisor_save_plan(jsonb),public.oaca_advisor_update_career_roadmap(jsonb),public.oaca_advisor_save_template(jsonb),public.oaca_advisor_save_report(jsonb),public.oaca_advisor_prepare_export(jsonb),public.oaca_advisor_save_availability(jsonb),public.oaca_advisor_update_handoff(jsonb) from public,anon;
grant execute on function public.oaca_is_active_advisor(uuid),public.oaca_advisor_org(text),public.oaca_advisor_workspace(jsonb),public.oaca_advisor_schedule(jsonb),public.oaca_advisor_save_attention_flag(jsonb),public.oaca_advisor_open_student(jsonb),public.oaca_advisor_quick_encounter(jsonb),public.oaca_advisor_reschedule(jsonb),public.oaca_advisor_cancel(jsonb),public.oaca_advisor_add_addendum(jsonb),public.oaca_advisor_save_task(jsonb),public.oaca_advisor_update_task(jsonb),public.oaca_advisor_send_message(jsonb),public.oaca_advisor_complete_requirement_step(jsonb),public.oaca_advisor_save_plan(jsonb),public.oaca_advisor_update_career_roadmap(jsonb),public.oaca_advisor_save_template(jsonb),public.oaca_advisor_save_report(jsonb),public.oaca_advisor_prepare_export(jsonb),public.oaca_advisor_save_availability(jsonb),public.oaca_advisor_update_handoff(jsonb) to authenticated;

grant select on public.oaca_appointment_series,public.oaca_requirement_steps,public.oaca_action_items,public.oaca_note_addenda,public.oaca_advisor_handoffs,public.oaca_advisor_handoff_history,public.oaca_advisor_attention_flags,public.oaca_academic_plans,public.oaca_academic_plan_versions,public.oaca_advisor_templates,public.oaca_advisor_template_versions,public.oaca_career_roadmap_completions,public.oaca_saved_reports,public.oaca_report_exports,public.oaca_advisor_availability_preferences to authenticated;

commit;
