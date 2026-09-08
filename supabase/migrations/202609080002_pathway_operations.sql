begin;

create function public.pathway_admin_action(action text,payload jsonb,u uuid,o uuid,p uuid,staff boolean,principal boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare out jsonb; target uuid; cohort uuid; r text; cap text; obj uuid; row_data jsonb; source_program uuid;
begin
  if action='sessions' then
    return coalesce((select jsonb_agg(to_jsonb(s) order by s.starts_at desc) from (select * from public.sessions where program_id=p and organization_id=o and (status<>'draft' or public.has_role('administrator',o,p,cohort_id)) and (cohort_id is null or exists(select 1 from public.role_assignments where user_id=u and organization_id=o and (program_id is null or program_id=p) and (cohort_id is null or cohort_id=sessions.cohort_id) and revoked_at is null)) order by starts_at desc limit 200) s),'[]');
  elsif action='session_context' then
    if not staff or not public.has_role('administrator',o,p) or not public.has_capability('program.configure',o,p) then raise exception 'Session management access denied' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.cohorts c where c.program_id=p and exists(select 1 from public.role_assignments r where r.user_id=u and r.role='administrator' and r.organization_id=o and (r.program_id is null or r.program_id=p) and (r.cohort_id is null or r.cohort_id=c.id) and r.revoked_at is null)),'[]');
  elsif action='session_save' then
    if not staff or not public.has_role('administrator',o,p) or not public.has_capability('program.configure',o,p) then raise exception 'Session management access denied' using errcode='42501'; end if;
    cohort:=(payload->>'cohortId')::uuid;
    if cohort is not null and not exists(select 1 from public.cohorts where id=cohort and program_id=p and organization_id=o) then raise exception 'Invalid cohort'; end if;
    if not exists(select 1 from public.role_assignments where user_id=u and role='administrator' and organization_id=o and (program_id is null or program_id=p) and (cohort_id is null or cohort_id=cohort) and revoked_at is null) then raise exception 'Cohort access denied' using errcode='42501'; end if;
    if (payload->>'endsAt')::timestamptz<=(payload->>'startsAt')::timestamptz or length(payload->>'title') not between 1 and 160 then raise exception 'Invalid session dates or title'; end if;
    if not exists(select 1 from pg_timezone_names where name=coalesce(payload->>'zone','UTC')) then raise exception 'Invalid time zone'; end if;
    obj:=coalesce((payload->>'id')::uuid,gen_random_uuid());
    if exists(select 1 from public.sessions s where id=obj and (organization_id<>o or program_id<>p or not exists(select 1 from public.role_assignments r where r.user_id=u and r.role='administrator' and r.organization_id=o and (r.program_id is null or r.program_id=p) and (r.cohort_id is null or r.cohort_id=s.cohort_id) and r.revoked_at is null))) then raise exception 'Session access denied' using errcode='42501'; end if;
    insert into public.sessions(id,organization_id,program_id,cohort_id,title,topic,starts_at,ends_at,format,status,created_by,timezone)
      values(obj,o,p,cohort,trim(payload->>'title'),coalesce(payload->>'topic',''),(payload->>'startsAt')::timestamptz,(payload->>'endsAt')::timestamptz,payload->>'format',payload->>'status',u,coalesce(payload->>'zone','UTC'))
      on conflict(id) do update set cohort_id=excluded.cohort_id,title=excluded.title,topic=excluded.topic,starts_at=excluded.starts_at,ends_at=excluded.ends_at,format=excluded.format,status=excluded.status,timezone=excluded.timezone;
    insert into public.pathway_background_jobs(kind,dedupe_key,payload) values('calendar_sync','session:'||obj||':'||gen_random_uuid(),jsonb_build_object('sessionId',obj));
    insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id) values(o,u,'session_saved','session',obj::text); return jsonb_build_object('id',obj);
  elsif action='calendar_connections' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',id,'provider',provider,'status',status,'availabilityCalendarIds',availability_calendar_ids,'destinationCalendarId',destination_calendar_id,'lastSyncedAt',last_synced_at)) from public.pathway_calendar_connections where user_id=u and status<>'disconnected'),'[]');
  elsif action='calendar_disconnect' then
    update public.pathway_calendar_connections set status='disconnected',credential_ciphertext='',sync_cursor=null,subscription_secret=null where user_id=u and id=(payload->>'id')::uuid;
    return '{"ok":true}';
  end if;

  if action in ('roster_context','roster_preview','roster_status','roster_commit') then
    if not staff or not public.has_role('administrator',o,p) or not public.has_capability('accounts.manage',o,p) then raise exception 'Roster management access denied' using errcode='42501'; end if;
    if action='roster_context' then
      return jsonb_build_object('programs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'slug',slug)) from public.programs where id=p and organization_id=o),'[]'),
        'cohorts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.cohorts where program_id=p and exists(select 1 from public.role_assignments r where r.user_id=u and r.role='administrator' and r.organization_id=o and (r.program_id is null or r.program_id=p) and (r.cohort_id is null or r.cohort_id=cohorts.id) and r.revoked_at is null)),'[]'));
    elsif action='roster_preview' then
      if jsonb_typeof(payload->'rows')<>'array' or jsonb_array_length(payload->'rows') not between 1 and 1000 then raise exception 'Invalid roster size'; end if;
      insert into public.pathway_roster_imports(actor_id,organization_id,program_id,request_key,rows) values(u,o,p,(payload->>'requestKey')::uuid,payload->'rows') on conflict(actor_id,request_key) do nothing returning id into obj;
      if obj is null then select id into obj from public.pathway_roster_imports where actor_id=u and request_key=(payload->>'requestKey')::uuid; end if;
      for row_data in select value from jsonb_array_elements(payload->'rows') loop
       begin
        r:=row_data->'values'->>'role'; cohort:=null;
        if r not in ('student','advisor') or length(row_data->'values'->>'name') not between 1 and 160 or (row_data->'values'->>'primary_email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid roster row'; end if;
        if not exists(select 1 from public.programs where id=p and lower(row_data->'values'->>'program') in (lower(name),lower(slug),id::text)) then raise exception 'Roster program must match the selected program'; end if;
        if coalesce(row_data->'values'->>'cohort','')<>'' then
          select id into cohort from public.cohorts where program_id=p and lower(row_data->'values'->>'cohort') in (lower(name),id::text);
          if cohort is null then raise exception 'Unknown cohort'; end if;
        end if;
        if not exists(select 1 from public.role_assignments where user_id=u and role='administrator' and organization_id=o and (program_id is null or program_id=p) and (cohort_id is null or cohort_id=cohort) and revoked_at is null) then raise exception 'Roster cohort exceeds your access' using errcode='42501'; end if;
        target:=null; select canonical_user_id into target from public.account_auth_identities where email=lower(row_data->'values'->>'primary_email');
        if target is not null and not exists(select 1 from public.role_assignments where user_id=target and organization_id=o and (program_id is null or program_id=p) and revoked_at is null) then raise exception 'Existing account is outside this program; contact Creator'; end if;
        if coalesce(row_data->'values'->>'secondary_email','')<>'' and exists(select 1 from public.account_auth_identities where email=lower(row_data->'values'->>'secondary_email') and (target is null or canonical_user_id<>target)) then raise exception 'Secondary email belongs to another account; explicit merge required'; end if;
        insert into public.pathway_roster_rows(import_id,row_number,values,user_id) values(obj,(row_data->>'row')::integer,row_data->'values'||jsonb_build_object('cohort_id',cohort),target) on conflict do nothing;
       exception when others then
         insert into public.pathway_roster_rows(import_id,row_number,values,status,error) values(obj,(row_data->>'row')::integer,row_data->'values','invalid',sqlerrm) on conflict do nothing;
       end;
      end loop;
      return jsonb_build_object('id',obj,'rows',(select jsonb_agg(to_jsonb(x) order by row_number) from public.pathway_roster_rows x where import_id=obj));
    else
      obj:=(payload->>'id')::uuid;
      if not exists(select 1 from public.pathway_roster_imports where id=obj and actor_id=u and organization_id=o and program_id=p) then raise exception 'Import access denied' using errcode='42501'; end if;
      return jsonb_build_object('id',obj,'status',(select status from public.pathway_roster_imports where id=obj),'rows',(select jsonb_agg(to_jsonb(x) order by row_number) from public.pathway_roster_rows x where import_id=obj));
    end if;
  end if;
  if not principal then raise exception 'Creator or PI access required' using errcode='42501'; end if;
  if action='analytics' then
    return jsonb_build_object('pages',coalesce((select jsonb_agg(to_jsonb(x)) from (select page,count(*) as views,count(distinct user_id) as students from public.pathway_page_views where organization_id=o and program_id=p and viewed_at>=coalesce((payload->>'from')::timestamptz,now()-interval '30 days') and viewed_at<coalesce((payload->>'to')::timestamptz,now()) group by page order by count(*) desc) x),'[]'),
      'visits',coalesce((select jsonb_agg(to_jsonb(x)) from (select v.id,v.user_id,f.display_name,v.page,v.viewed_at,case when v.viewed_at>now()-interval '30 days' then host(v.ip_address) else null end as ip_address from public.pathway_page_views v join public.profiles f on f.user_id=v.user_id where v.organization_id=o and v.program_id=p and (payload->>'studentId' is null or v.user_id=(payload->>'studentId')::uuid) and v.viewed_at>=coalesce((payload->>'from')::timestamptz,now()-interval '30 days') and v.viewed_at<coalesce((payload->>'to')::timestamptz,now()) order by v.viewed_at desc limit 500) x),'[]'));
  elsif action='access' then
    return jsonb_build_object('people',coalesce((select jsonb_agg(jsonb_build_object('id',f.user_id,'name',f.display_name,'roles',(select jsonb_agg(to_jsonb(r)) from public.role_assignments r where r.user_id=f.user_id and r.organization_id=o and (r.program_id is null or r.program_id=p) and r.revoked_at is null),'capabilities',(select jsonb_agg(permission_key) from public.permission_assignments where user_id=f.user_id and organization_id=o and (program_id is null or program_id=p) and revoked_at is null))) from public.profiles f where exists(select 1 from public.role_assignments where user_id=f.user_id and organization_id=o and (program_id is null or program_id=p) and revoked_at is null)),'[]'),
      'permissions',coalesce((select jsonb_agg(to_jsonb(x)) from public.permissions x where key not in ('platform.creator','platform.principal_investigator','pilot.reset_records','accounts.purge')),'[]'),
      'cohorts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.cohorts where program_id=p),'[]'),
      'policy',coalesce((select to_jsonb(x) from public.pathway_communication_policy x where program_id=p),'{"student_advisor":true,"administrator_advisor":true}'::jsonb));
  elsif action='access_update' then
    target:=(payload->>'userId')::uuid; cohort:=(payload->>'cohortId')::uuid; r:=payload->>'role'; cap:=payload->>'capability';
    if target=u then raise exception 'Use another principal to change your own access' using errcode='42501'; end if;
    if not exists(select 1 from public.role_assignments where user_id=target and organization_id=o and (program_id is null or program_id=p) and revoked_at is null) then raise exception 'Account is outside this program' using errcode='42501'; end if;
    if exists(select 1 from public.permission_assignments where user_id=target and permission_key in ('platform.creator','platform.principal_investigator') and revoked_at is null) then raise exception 'Principal access is managed through principal governance' using errcode='42501'; end if;
    if cohort is not null and not exists(select 1 from public.cohorts where id=cohort and program_id=p) then raise exception 'Invalid cohort'; end if;
    if r is not null then
      if r not in ('student','advisor','administrator') then raise exception 'Invalid role'; end if;
      insert into public.role_assignments(user_id,role,organization_id,program_id,cohort_id,granted_by,revoked_at) values(target,r,o,p,cohort,u,case when (payload->>'grant')::boolean then null else now() end)
      on conflict(user_id,role,organization_id,program_id,cohort_id) do update set revoked_at=excluded.revoked_at,granted_by=u,granted_at=now();
    elsif cap is not null then
      if cap in ('platform.creator','platform.principal_investigator','pilot.reset_records','accounts.purge') or not public.has_capability(cap,o,p) then raise exception 'You cannot delegate this permission' using errcode='42501'; end if;
      insert into public.permission_assignments(user_id,permission_key,organization_id,program_id,granted_by,revoked_at) values(target,cap,o,p,u,case when (payload->>'grant')::boolean then null else now() end)
      on conflict(user_id,permission_key,organization_id,program_id) do update set revoked_at=excluded.revoked_at,granted_by=u,granted_at=now();
    else raise exception 'Choose a role or permission'; end if;
    insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(o,u,'access_updated','profile',target::text,payload); return '{"ok":true}';
  elsif action='communication_policy' then
    insert into public.pathway_communication_policy(program_id,student_advisor,administrator_advisor,updated_by) values(p,(payload->>'studentAdvisor')::boolean,(payload->>'administratorAdvisor')::boolean,u)
      on conflict(program_id) do update set student_advisor=excluded.student_advisor,administrator_advisor=excluded.administrator_advisor,updated_by=u,updated_at=now();
    insert into public.audit_events(organization_id,actor_id,event_type,subject_type,subject_id,metadata) values(o,u,'communication_policy_updated','program',p::text,payload); return '{"ok":true}';
  end if;
  raise exception 'Unknown workspace action';
end $$;
revoke all on function public.pathway_admin_action(text,jsonb,uuid,uuid,uuid,boolean,boolean) from public,anon,authenticated;

-- Edge-only ingestion: user, scope and IP are derived by the authenticated Worker.
create function public.pathway_record_page(actor uuid,event_id uuid,page_key text,session_key text,ip inet) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare f public.profiles; begin
 select * into f from public.profiles where user_id=actor and status in ('active','invited');
 if f.user_id is null or not public.pathway_role(actor,'student',f.active_organization_id,f.active_program_id) then return; end if;
 if (select count(*) from public.pathway_page_views where user_id=actor and viewed_at>now()-interval '1 minute')>120 then return; end if;
 insert into public.pathway_page_views(id,user_id,organization_id,program_id,cohort_id,page,session_id,ip_address) values(event_id,actor,f.active_organization_id,f.active_program_id,f.active_cohort_id,page_key,session_key,ip) on conflict(id) do nothing;
end $$;
create function public.pathway_maintenance() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer; ap record; begin
 update public.pathway_page_views set ip_address=null where viewed_at<=now()-interval '30 days' and ip_address is not null; get diagnostics n=row_count;
 delete from public.pathway_calendar_oauth_states where expires_at<now()-interval '1 day';
 update public.pathway_background_jobs set status='pending',locked_until=null where status='running' and locked_until<now();
 for ap in select * from public.pathway_appointments where status='accepted' and starts_at between now() and now()+interval '24 hours' loop
   perform public.pathway_notify(ap.requester_id,ap.program_id,ap.id||':reminder:'||ap.version,'Upcoming appointment',ap.id);
   perform public.pathway_notify(ap.recipient_id,ap.program_id,ap.id||':reminder:'||ap.version,'Upcoming appointment',ap.id);
 end loop;
 return jsonb_build_object('ipValuesDeleted',n);
end $$;
create function public.pathway_claim_jobs() returns setof public.pathway_background_jobs
language sql security definer set search_path=public,pg_temp as $$
 update public.pathway_background_jobs set status='running',attempts=attempts+1,locked_until=now()+interval '5 minutes'
 where id in (select id from public.pathway_background_jobs where status='pending' and kind='calendar_sync' and run_after<=now() order by created_at for update skip locked limit 10) returning *;
$$;
revoke all on function public.pathway_record_page(uuid,uuid,text,text,inet),public.pathway_maintenance(),public.pathway_claim_jobs() from public,anon,authenticated;
grant execute on function public.pathway_record_page(uuid,uuid,text,text,inet),public.pathway_maintenance(),public.pathway_claim_jobs() to service_role;

commit;
