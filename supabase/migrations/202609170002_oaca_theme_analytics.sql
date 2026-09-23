begin;
create or replace function public.oaca_aggregate_analytics(payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid; mode text:=coalesce(payload->>'datasetMode','live'); result jsonb;
begin
 select r.organization_id into org from public.experience_role_assignments r join public.profiles p on p.user_id=r.user_id where r.user_id=public.current_profile_user_id() and r.experience_key='oaca' and r.revoked_at is null and r.organization_id is not null order by (r.organization_id=p.active_organization_id) desc limit 1;
 if org is null or not public.oaca_can_view_aggregate_analytics(org) then raise exception 'Aggregate analytics capability and MFA are required' using errcode='42501'; end if;
 if mode not in ('live','demo') then raise exception 'Choose demo or live'; end if;
 with base as (
   select s.*,coalesce(s.student_id::text,s.student_key_hash) student_key,
     coalesce(s.theme_override,array(select distinct m->>'theme' from jsonb_array_elements(s.theme_matches) m)) themes
   from public.oaca_historical_sessions s where s.organization_id=org and s.dataset_mode=mode
     and (nullif(payload->>'from','') is null or s.starts_at>=((payload->>'from')::date::timestamp at time zone 'America/Los_Angeles'))
     and (nullif(payload->>'to','') is null or s.starts_at<(((payload->>'to')::date+1)::timestamp at time zone 'America/Los_Angeles'))
 ), grouped as (
   select 'cohort' kind,coalesce(cohort_label,'Unassigned') label,count(*) sessions,count(distinct student_key) students,sum(duration_minutes)/60 hours from base group by cohort_label
   union all select 'service',service_key,count(*),count(distinct student_key),sum(duration_minutes)/60 from base group by service_key
   union all select 'month',to_char(starts_at at time zone 'America/Los_Angeles','YYYY-MM'),count(*),count(distinct student_key),sum(duration_minutes)/60 from base group by 2
 ), topics as (
   select theme,count(*) sessions,count(distinct student_key) students from base cross join lateral unnest(themes) theme group by theme
 ), monthly_topics as (
   select to_char(starts_at at time zone 'America/Los_Angeles','YYYY-MM') as reporting_month,theme,count(*) sessions,count(distinct student_key) students from base cross join lateral unnest(themes) theme group by 1,2
 ), repeated as (
   select student_key,count(*) visits from base where student_key is not null group by student_key having count(*)>1
 ), repeated_topics as (
   select theme,count(distinct student_key) students,count(*) sessions from base join repeated using(student_key) cross join lateral unnest(themes) theme group by theme
 ), totals as (
   select count(*) sessions,count(distinct student_key) students,sum(duration_minutes)/60 hours,
     count(*) filter(where lower(source_status) in ('completed','attended')) completed,
     count(*) filter(where lower(source_attendance) in ('present','absent')) attendance_recorded,
     count(*) filter(where lower(source_attendance)='absent') absent,
     count(*) filter(where lower(source_status) in ('cancelled','canceled')) cancelled,
     count(*) filter(where lower(source_status)='scheduled') scheduled,
     count(*) filter(where note_state='missing') missing_notes,
     count(*) filter(where note_state='disabled') excluded_notes,
     count(*) filter(where note_state='uncategorized' and theme_override is null or theme_override='{}'::text[]) uncategorized_notes,
     count(*) filter(where note_state in ('categorized','uncategorized')) notes_present,
     count(*) filter(where 'follow_up'=any(themes)) follow_up,
     count(*) filter(where source_created_at<=starts_at) wait_denominator,
     avg(extract(epoch from starts_at-source_created_at)/86400) filter(where source_created_at<=starts_at) wait_days,
     min(starts_at) start_date,max(starts_at) end_date
   from base
 ) select jsonb_build_object(
   'datasetMode',mode,'minimumGroupSize',10,'reportingTimezone','America/Los_Angeles','suppressed',t.students<10,
   'coverageStart',case when t.students>=10 then t.start_date end,'coverageEnd',case when t.students>=10 then t.end_date end,
   'totals',case when t.students<10 then null else jsonb_build_object('sessions',t.sessions,'studentCount',t.students,'hours',round(t.hours,2),'completedSessions',t.completed,'cancelledSessions',t.cancelled,'scheduledSessions',t.scheduled,'completionRate',round(100.0*t.completed/nullif(t.sessions,0),1),'attendanceRecorded',t.attendance_recorded,'absentSessions',t.absent,'absenceRate',round(100.0*t.absent/nullif(t.attendance_recorded,0),1),'averageWaitDays',round(t.wait_days,1),'waitDenominator',t.wait_denominator,'missingNotes',t.missing_notes,'excludedNotes',t.excluded_notes,'uncategorizedNotes',t.uncategorized_notes,'notesPresent',t.notes_present,'followUpDocumented',t.follow_up,'repeatStudents',(select count(*) from repeated)) end,
   'cohorts',coalesce((select jsonb_agg(jsonb_build_object('cohortLabel',label,'studentCount',case when students>=10 then students end,'sessions',case when students>=10 then sessions end,'hours',case when students>=10 then round(hours,2) end,'suppressed',students<10) order by label) from grouped where kind='cohort'),'[]'),
   'services',coalesce((select jsonb_agg(jsonb_build_object('serviceKey',label,'studentCount',case when students>=10 then students end,'sessions',case when students>=10 then sessions end,'hours',case when students>=10 then round(hours,2) end,'suppressed',students<10) order by label) from grouped where kind='service'),'[]'),
   'months',coalesce((select jsonb_agg(jsonb_build_object('month',label,'sessions',case when students>=10 then sessions end,'hours',case when students>=10 then round(hours,2) end,'suppressed',students<10) order by label) from grouped where kind='month'),'[]'),
   'themes',coalesce((select jsonb_agg(jsonb_build_object('theme',theme,'sessions',case when students>=10 then sessions end,'students',case when students>=10 then students end,'suppressed',students<10) order by theme) from topics),'[]'),
   'monthlyThemes',coalesce((select jsonb_agg(jsonb_build_object('month',reporting_month,'theme',theme,'sessions',case when students>=10 then sessions end,'suppressed',students<10) order by reporting_month,theme) from monthly_topics),'[]'),
   'repeatThemes',coalesce((select jsonb_agg(jsonb_build_object('theme',theme,'sessions',case when students>=10 then sessions end,'students',case when students>=10 then students end,'suppressed',students<10) order by theme) from repeated_topics),'[]')
 ) into result from totals t;
 insert into public.audit_events(organization_id,actor_id,event_type,subject_type,metadata,experience_key) values(org,public.current_profile_user_id(),'oaca_aggregate_analytics_viewed','oaca_analytics',jsonb_build_object('datasetMode',mode,'minimumGroupSize',10),'oaca');
 return result;
end $$;
commit;
