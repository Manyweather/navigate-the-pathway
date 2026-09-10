begin;

-- Existing rows are classified as Pathway by default. The calendar connection
-- itself remains user-scoped so one encrypted consent can serve multiple
-- eligible experiences; event links and jobs carry the experience boundary.
alter table public.audit_events add column if not exists experience_key text references public.experiences(key) default 'pathway';
alter table public.pathway_notifications add column if not exists experience_key text references public.experiences(key) default 'pathway';
alter table public.pathway_conversations add column if not exists experience_key text references public.experiences(key) default 'pathway';
alter table public.pathway_messages add column if not exists experience_key text references public.experiences(key) default 'pathway';
alter table public.pathway_email_jobs add column if not exists experience_key text references public.experiences(key) default 'pathway';
alter table public.pathway_calendar_oauth_states add column if not exists requested_experience_key text references public.experiences(key);
alter table public.pathway_calendar_events add column if not exists experience_key text references public.experiences(key) default 'pathway';
alter table public.pathway_background_jobs add column if not exists experience_key text references public.experiences(key) default 'pathway';

update public.audit_events set experience_key='pathway' where experience_key is null;
update public.pathway_notifications set experience_key='pathway' where experience_key is null;
update public.pathway_conversations set experience_key='pathway' where experience_key is null;
update public.pathway_messages set experience_key='pathway' where experience_key is null;
update public.pathway_email_jobs set experience_key='pathway' where experience_key is null;
update public.pathway_calendar_events set experience_key='pathway' where experience_key is null;
update public.pathway_background_jobs set experience_key='pathway' where experience_key is null;

alter table public.audit_events alter column experience_key set not null;
alter table public.pathway_notifications alter column experience_key set not null;
alter table public.pathway_conversations alter column experience_key set not null;
alter table public.pathway_messages alter column experience_key set not null;
alter table public.pathway_email_jobs alter column experience_key set not null;
alter table public.pathway_calendar_events alter column experience_key set not null;
alter table public.pathway_background_jobs alter column experience_key set not null;

create index if not exists audit_events_experience_created_idx on public.audit_events(experience_key,created_at desc);
create index if not exists notifications_experience_user_idx on public.pathway_notifications(experience_key,user_id,created_at desc);
create index if not exists conversations_experience_idx on public.pathway_conversations(experience_key,created_at desc);
create index if not exists calendar_events_experience_idx on public.pathway_calendar_events(experience_key,last_synced_at desc);
create index if not exists background_jobs_experience_status_idx on public.pathway_background_jobs(experience_key,status,run_after);

commit;
