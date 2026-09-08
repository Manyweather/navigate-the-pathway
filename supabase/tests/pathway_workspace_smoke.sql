begin;
do $$
declare o uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); student uuid:=gen_random_uuid(); advisor uuid:=gen_random_uuid(); owner_id uuid:=gen_random_uuid(); appointment jsonb; conversation jsonb; source jsonb; review jsonb; event_id uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(student,student||'@example.test'),(advisor,advisor||'@example.test'),(owner_id,owner_id||'@example.test');
 insert into public.organizations(id,name,slug) values(o,'Fictional upgrade verification',o::text);
 insert into public.programs(id,organization_id,name,slug) values(p,o,'Fictional verification',p::text);
 insert into public.profiles(user_id,display_name,active_organization_id,active_program_id,status) values(student,'Fictional student',o,p,'active'),(advisor,'Fictional advisor',o,p,'active'),(owner_id,'Fictional creator',o,p,'active');
 insert into public.role_assignments(user_id,role,organization_id,program_id,granted_by) values(student,'student',o,p,owner_id),(advisor,'advisor',o,p,owner_id),(owner_id,'administrator',o,p,owner_id);
 insert into public.permission_assignments(user_id,permission_key,organization_id,program_id,granted_by) values(owner_id,'platform.creator',o,p,owner_id),(owner_id,'accounts.manage',o,p,owner_id),(owner_id,'program.configure',o,p,owner_id);
 insert into public.advisor_assignments(advisor_id,student_id,organization_id,program_id,created_by) values(advisor,student,o,p,owner_id);
 perform set_config('request.jwt.claim.sub',student::text,true); perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 appointment:=public.pathway_action('appointment_request',jsonb_build_object('recipientId',advisor,'title','Fictional staging appointment','startsAt',now()+interval '40 days','endsAt',now()+interval '40 days 30 minutes','timezone','America/Los_Angeles','requestKey',gen_random_uuid()));
 if appointment->>'status'<>'pending' then raise exception 'Request did not require acceptance'; end if;
 source:=public.pathway_action('support_share','{"goals":"Fictional planning goal"}');
 perform set_config('request.jwt.claim.sub',advisor::text,true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
 appointment:=public.pathway_action('appointment_change',jsonb_build_object('id',appointment->>'id','version',1,'decision','accept'));
 if appointment->>'status'<>'accepted' then raise exception 'Acceptance failed'; end if;
 conversation:=public.pathway_action('conversations','{}')->0;
 perform public.pathway_action('message_send',jsonb_build_object('conversationId',conversation->>'id','body','Fictional staging message','clientId',gen_random_uuid()));
 review:=public.pathway_action('support_review',jsonb_build_object('sourceId',source->>'id','area','Planning','evidence','Student shared a planning goal','action','Review plan','status','reviewed','share',true));
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 begin
   perform public.pathway_action('messages',jsonb_build_object('conversationId',conversation->>'id'));raise exception 'Private chat unexpectedly exposed to Creator';
 exception when insufficient_privilege then null;end;
 perform public.pathway_record_page(student,event_id,'home','fictional','192.0.2.1');perform public.pathway_record_page(student,event_id,'home','fictional','192.0.2.1');
 if (select count(*) from public.pathway_page_views where id=event_id)<>1 then raise exception 'Page deduplication failed'; end if;
 perform set_config('request.jwt.claim.sub',student::text,true);
 if jsonb_array_length(public.pathway_action('support','{}')->'reviews')<>1 then raise exception 'Shared review missing'; end if;
 perform public.pathway_action('support_revoke',jsonb_build_object('id',source->>'id'));
 perform set_config('request.jwt.claim.sub',advisor::text,true);
 if jsonb_array_length(public.pathway_action('support','{}')->'reviews')<>0 then raise exception 'Source revocation failed'; end if;
 if exists(select 1 from public.pathway_email_jobs e join public.pathway_notifications n on n.id=e.notification_id where n.program_id=p and e.status<>'suppressed') then raise exception 'Email delivery unexpectedly enabled'; end if;
end $$;
rollback;
select 'PASS: fictional booking, acceptance, private chat, sharing, revocation, analytics, and suppressed email. All fictional records rolled back.' as staging_verification;
