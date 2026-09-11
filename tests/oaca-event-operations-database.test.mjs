import assert from "node:assert/strict";
import test from "node:test";
import { testDatabase } from "./workspace-database.mjs";

const org="30000000-0000-4000-8000-000000000001";
const owner="30000000-0000-4000-8000-000000000002";
const reviewer="30000000-0000-4000-8000-000000000003";
const staff="30000000-0000-4000-8000-000000000004";
const student="30000000-0000-4000-8000-000000000005";
const walkin="30000000-0000-4000-8000-000000000006";
const eventsFile="30000000-0000-4000-8000-000000000007";
const logsFile="30000000-0000-4000-8000-000000000008";
const academicService="30000000-0000-4000-8000-000000000009";
const assignedProvider="30000000-0000-4000-8000-000000000010";
const dropInProvider="30000000-0000-4000-8000-000000000011";
const lateMember="30000000-0000-4000-8000-000000000012";

async function asUser(db,userId,sql,params=[],aal="aal2") {
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[userId,JSON.stringify({sub:userId,aal})]);
  await db.exec("set role authenticated");
  try{return await db.query(sql,params);}finally{await db.exec("reset role");}
}

test("event rosters, attendance, QR check-in, notifications, conversations, and paired imports are scoped",async()=>{
  const db=await testDatabase("202609100011");
  try{
    await db.exec("create function public.digest(value text, algorithm text) returns bytea language sql immutable as $$select decode(md5(value)||md5(value||'x'),'hex')$$");
    await db.exec(`
      insert into public.organizations(id,name,slug) values('${org}','Roseman University','roseman-events');
      insert into auth.users(id,email,email_confirmed_at) values('${owner}','owner@roseman.edu',now()),('${reviewer}','reviewer@roseman.edu',now()),('${staff}','staff@roseman.edu',now()),('${student}','student@roseman.edu',now()),('${walkin}','walkin@roseman.edu',now());
      insert into public.profiles(user_id,display_name,status,active_organization_id) values('${owner}','Event Owner','active','${org}'),('${reviewer}','Second Administrator','active','${org}'),('${staff}','Unassigned Staff','active','${org}'),('${student}','Registered Student','active','${org}'),('${walkin}','Walk-in Student','active','${org}');
      insert into public.experience_role_assignments(user_id,experience_key,role,organization_id) values('${owner}','oaca','administrator','${org}'),('${reviewer}','oaca','administrator','${org}'),('${staff}','oaca','staff','${org}'),('${student}','oaca','student','${org}'),('${walkin}','oaca','student','${org}');
      insert into public.experience_capability_assignments(user_id,experience_key,capability,organization_id) values('${staff}','oaca','oaca.outreach.manage','${org}');
      insert into public.platform_notification_preferences(user_id,email_enabled,sms_enabled) values('${student}',true,false),('${walkin}',true,false);
      insert into public.platform_files(id,owner_id,experience_key,storage_path,original_name,mime_type,size_bytes,scan_status) values('${eventsFile}','${owner}','oaca','${owner}/oaca/event-imports/events.csv','events.csv','text/csv',100,'clean'),('${logsFile}','${owner}','oaca','${owner}/oaca/event-imports/logs.csv','logs.csv','text/csv',100,'clean');
      insert into public.oaca_service_lines(id,organization_id,key,name,provider_rule,duration_minutes,policy_status) values('${academicService}','${org}','academic_advising','Academic advising','assigned',30,'sandbox_approved');
      insert into public.oaca_providers(id,user_id,organization_id,classification,modalities) values('${assignedProvider}','${owner}','${org}','faculty',array['teams']),('${dropInProvider}','${staff}','${org}','staff',array['teams']);
      insert into public.oaca_provider_services(provider_id,service_line_id) values('${assignedProvider}','${academicService}'),('${dropInProvider}','${academicService}');
      insert into public.oaca_advisor_assignments(student_id,provider_id) values('${student}','${assignedProvider}');
    `);
    for(const [index,startsAt] of ["2030-10-08T12:00:00-07:00","2030-10-15T12:00:00-07:00"].entries()){
      const appointment=await asUser(db,student,"select public.oaca_create_appointment($1::jsonb) result",[JSON.stringify({serviceLineId:academicService,providerId:dropInProvider,startsAt,modality:"teams",format:"individual",topic:`Drop-in question ${index+1}`,policyContext:{reasonForVisit:"Quick drop-in question",academicDropIn:true,academicBlockKey:"Block 3",academicDropInProviderId:dropInProvider}})]);
      const routed=await db.query("select provider_id from public.oaca_appointments where id=$1",[appointment.rows[0].result.id]);
      assert.equal(routed.rows[0].provider_id,dropInProvider);
    }
    await assert.rejects(()=>asUser(db,student,"select public.oaca_create_appointment($1::jsonb)",[JSON.stringify({serviceLineId:academicService,providerId:dropInProvider,startsAt:"2030-10-22T12:00:00-07:00",modality:"teams",format:"individual",topic:"Third drop-in",policyContext:{reasonForVisit:"Quick drop-in question",academicDropIn:true,academicBlockKey:"Block 3",academicDropInProviderId:dropInProvider}})]),/limited to two visits per academic block/i);
    const created=await asUser(db,owner,"select (public.oaca_create_event($1::jsonb)).id as id",[JSON.stringify({title:"Student Success Lab",description:"Practice and connect.",startsAt:"2030-10-01T12:00:00-07:00",endsAt:"2030-10-01T13:00:00-07:00",modality:"in_person",location:"Innovation Hall",audience:{includeAllStudents:true}})]);
    const eventId=created.rows[0].id;
    await asUser(db,owner,"select public.oaca_publish_event($1::jsonb)",[JSON.stringify({eventId})]);
    await asUser(db,student,"select public.oaca_register_event($1::jsonb)",[JSON.stringify({eventId})]);
    const defaults=await db.query("select offset_minutes from public.oaca_event_notification_rules where event_id=$1 order by offset_minutes",[eventId]);
    assert.deepEqual(defaults.rows.map((row)=>row.offset_minutes),[60,1440]);
    const digestJobs=await db.query("select count(*)::int count from public.oaca_event_coordinator_digest_jobs where event_id=$1 and activity_type='rsvp'",[eventId]);
    assert.equal(digestJobs.rows[0].count,1);
    await db.query("update public.oaca_event_coordinator_digest_jobs set available_at=now()-interval '1 minute' where event_id=$1",[eventId]);
    const digestRun=await db.query("select public.oaca_enqueue_event_coordinator_digests() result");
    assert.equal(digestRun.rows[0].result.digests,1);

    await assert.rejects(()=>asUser(db,staff,"select public.oaca_event_workspace($1::jsonb)",[JSON.stringify({eventId})]),/assigned event staff/i);
    const directRoster=await asUser(db,staff,"select count(*)::int count from public.oaca_event_registrations where event_id=$1",[eventId]);
    assert.equal(directRoster.rows[0].count,0);

    const marked=await asUser(db,owner,"select public.oaca_update_event_attendance($1::jsonb) result",[JSON.stringify({eventId,studentId:student,status:"absent",version:0})]);
    assert.equal(marked.rows[0].result.version,1);
    await assert.rejects(()=>asUser(db,owner,"select public.oaca_update_event_attendance($1::jsonb)",[JSON.stringify({eventId,studentId:student,status:"present",version:0})]),/another device/i);

    const personal=await asUser(db,student,"select public.oaca_issue_student_qr('{}'::jsonb) result");
    const personalToken=personal.rows[0].result.token;
    assert.equal(personal.rows[0].result.permanent,true);
    const samePersonal=await asUser(db,student,"select public.oaca_issue_student_qr('{}'::jsonb) result");
    assert.equal(samePersonal.rows[0].result.token,personalToken);
    await asUser(db,owner,"select public.oaca_scan_student_qr($1::jsonb)",[JSON.stringify({eventId,token:personalToken})]);
    const repeatedScan=await asUser(db,owner,"select public.oaca_scan_student_qr($1::jsonb) result",[JSON.stringify({eventId,token:personalToken})]);
    assert.equal(repeatedScan.rows[0].result.deduplicated,true);

    const checkin=await asUser(db,owner,"select public.oaca_set_event_checkin($1::jsonb) result",[JSON.stringify({eventId,action:"open",minutes:60})]);
    await asUser(db,walkin,"select public.oaca_self_checkin($1::jsonb)",[JSON.stringify({token:checkin.rows[0].result.token})]);
    const walkinRow=await db.query("select registration_source,attendance_status from public.oaca_event_registrations where event_id=$1 and student_id=$2",[eventId,walkin]);
    assert.deepEqual(walkinRow.rows[0],{registration_source:"walk_in",attendance_status:"present"});

    const correction=await asUser(db,student,"select (public.oaca_request_attendance_correction($1::jsonb)).id id",[JSON.stringify({eventId,requestedStatus:"absent",explanation:""})]);
    await asUser(db,owner,"select public.oaca_resolve_attendance_correction($1::jsonb)",[JSON.stringify({correctionId:correction.rows[0].id,decision:"approve"})]);
    const corrected=await db.query("select attendance_status from public.oaca_event_registrations where event_id=$1 and student_id=$2",[eventId,student]);
    assert.equal(corrected.rows[0].attendance_status,"absent");

    const sent=await asUser(db,owner,"select public.oaca_send_event_notification($1::jsonb) result",[JSON.stringify({eventId,type:"announcement",title:"Room reminder",body:"Open Compass for details.",channels:["in_app","email","push","sms"],audience:"registered",generation:"test"})]);
    assert.equal(sent.rows[0].result.inPlatformCreated,2);
    const noticeCount=await db.query("select count(*)::int count from public.platform_notifications where event_id=$1",[eventId]);
    assert.ok(noticeCount.rows[0].count>=3);
    const deliveryStates=await db.query("select status,count(*)::int count from public.platform_notification_deliveries group by status order by status");
    assert.ok(deliveryStates.rows.some((row)=>row.status==="queued"));
    assert.ok(deliveryStates.rows.some((row)=>row.status==="suppressed"));

    await asUser(db,owner,"select public.oaca_send_event_message($1::jsonb)",[JSON.stringify({eventId,studentId:student,body:"Reply here if you need help.",channel:"sms"})]);
    const ownerWorkspace=await asUser(db,owner,"select public.oaca_event_workspace($1::jsonb) result",[JSON.stringify({eventId})]);
    assert.equal(ownerWorkspace.rows[0].result.threads.length,1);
    const reviewerWorkspace=await asUser(db,reviewer,"select public.oaca_event_workspace($1::jsonb) result",[JSON.stringify({eventId})]);
    assert.equal(reviewerWorkspace.rows[0].result.roster.length,2);
    assert.equal(reviewerWorkspace.rows[0].result.threads.length,0);

    const staffSummary=await asUser(db,staff,"select public.oaca_event_workspace('{}'::jsonb) result");
    assert.ok(staffSummary.rows[0].result.events.some((item)=>item.id===eventId));
    assert.equal(staffSummary.rows[0].result.events.find((item)=>item.id===eventId).canManage,false);

    await db.query("insert into public.platform_student_affiliations(student_id,affiliation_type,designation,created_by) values($1,'student_council','student_council',$2)",[student,owner]);
    const unionPreview=await asUser(db,owner,"select public.oaca_preview_event_audience($1::jsonb) result",[JSON.stringify({audience:{memberRoles:["staff"],studentCouncil:true}})]);
    assert.equal(unionPreview.rows[0].result.count,2);

    const workflowCreated=await asUser(db,owner,"select (saved).id,(saved).status,(saved).publication_error from (select public.oaca_create_event($1::jsonb) saved) created",[JSON.stringify({
      title:"Published from review",description:"Five-step workflow test.",startsAt:"2030-11-01T12:00:00-07:00",endsAt:"2030-11-01T13:00:00-07:00",modality:"in_person",location:"Discovery",audience:{includeAllMembers:true,excludeUserIds:[reviewer]},coordinatorUserIds:[owner,staff],action:"publish",
      attendeeNotificationRules:[{type:"publication",offsetMinutes:null,enabled:true,channels:["in_app","email"]},{type:"reminder",offsetMinutes:1440,enabled:true,channels:["in_app","push"]},{type:"reminder",offsetMinutes:60,enabled:true,channels:["in_app","push"]}],
      coordinatorAlertRules:[{activityType:"rsvp",deliveryMode:"hourly",channels:["in_app","email"]},{activityType:"event_message",deliveryMode:"immediate",channels:["in_app","push"]},{activityType:"checkin",deliveryMode:"hourly",channels:["in_app"]},{activityType:"correction",deliveryMode:"immediate",channels:["in_app"]},{activityType:"waitlist",deliveryMode:"hourly",channels:["in_app"]},{activityType:"delivery_failure",deliveryMode:"immediate",channels:["in_app"]},{activityType:"event_change",deliveryMode:"immediate",channels:["in_app"]}]
    })]);
    assert.equal(workflowCreated.rows[0].status,"published",workflowCreated.rows[0].publication_error);
    const workflowEventId=workflowCreated.rows[0].id;
    const workflowState=await db.query("select (select count(*)::int from public.oaca_event_hosts where event_id=$1 and host_role='owner') owners,(select recipient_count from public.oaca_event_audience_versions where event_id=$1 order by version desc limit 1) recipients",[workflowEventId]);
    assert.deepEqual(workflowState.rows[0],{owners:2,recipients:4});
    await assert.rejects(()=>asUser(db,staff,"select count(*) from public.oaca_event_audience_recipients where event_id=$1",[workflowEventId]),/permission denied/i);
    const staffDetail=await asUser(db,staff,"select public.oaca_event_workspace($1::jsonb) result",[JSON.stringify({eventId:workflowEventId})]);
    assert.equal(staffDetail.rows[0].result.roster.length,0);
    assert.equal(staffDetail.rows[0].result.recipientCount,4);

    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${lateMember}','late@roseman.edu',now()); insert into public.profiles(user_id,display_name,status,active_organization_id) values('${lateMember}','Late Member','active','${org}'); insert into public.experience_role_assignments(user_id,experience_key,role,organization_id) values('${lateMember}','oaca','student','${org}');`);
    const refreshPreview=await asUser(db,owner,"select public.oaca_refresh_event_recipients($1::jsonb) result",[JSON.stringify({eventId:workflowEventId,commit:false})]);
    assert.equal(refreshPreview.rows[0].result.additions,1);
    const refreshCommit=await asUser(db,owner,"select public.oaca_refresh_event_recipients($1::jsonb) result",[JSON.stringify({eventId:workflowEventId,commit:true})]);
    assert.equal(refreshCommit.rows[0].result.version,2);
    assert.equal(refreshCommit.rows[0].result.count,5);
    await assert.rejects(()=>db.query("update public.oaca_event_audience_versions set recipient_count=0 where event_id=$1",[workflowEventId]),/immutable/i);
    await asUser(db,owner,"select public.oaca_remove_event_host($1::jsonb)",[JSON.stringify({eventId:workflowEventId,userId:staff})]);
    await assert.rejects(()=>asUser(db,staff,"select public.oaca_event_workspace($1::jsonb)",[JSON.stringify({eventId:workflowEventId})]),/assigned event staff/i);
    await assert.rejects(()=>asUser(db,owner,"select public.oaca_remove_event_host($1::jsonb)",[JSON.stringify({eventId:workflowEventId,userId:owner})]),/retain at least one coordinator/i);

    await db.query("update public.platform_notification_preferences set verified_phone='+17025550123',phone_verified_at=now(),sms_enabled=true where user_id=$1",[student]);
    const stopped=await db.query("select public.oaca_receive_event_sms($1::jsonb) result",[JSON.stringify({from:"+1 (702) 555-0123",providerMessageId:"sms-stop-1",body:"STOP",eventId})]);
    assert.equal(stopped.rows[0].result.smsEnabled,false);
    const duplicateStop=await db.query("select public.oaca_receive_event_sms($1::jsonb) result",[JSON.stringify({from:"+17025550123",providerMessageId:"sms-stop-1",body:"STOP",eventId})]);
    assert.equal(duplicateStop.rows[0].result.duplicate,true);
    await db.query("select public.oaca_receive_event_sms($1::jsonb)",[JSON.stringify({from:"+17025550123",providerMessageId:"sms-start-1",body:"START",eventId})]);
    await db.query("select public.oaca_receive_event_sms($1::jsonb)",[JSON.stringify({from:"+17025550123",providerMessageId:"sms-message-1",body:"Where should I check in?",eventId})]);
    const inbound=await db.query("select count(*)::int count from public.oaca_messages where provider_message_id='sms-message-1' and direction='inbound' and channel='sms'");
    assert.equal(inbound.rows[0].count,1);
    await db.query("select public.oaca_receive_event_sms($1::jsonb)",[JSON.stringify({from:"+17025550999",providerMessageId:"sms-unknown-1",body:"Which event?",eventId})]);
    const restricted=await db.query("select metadata->>'reason' reason from public.oaca_sms_reconciliation_queue where provider_message_id='sms-unknown-1'");
    assert.equal(restricted.rows[0].reason,"unknown_or_unverified_phone");

    const packageResult=await asUser(db,owner,"select (public.oaca_create_event_import_package($1::jsonb)).id id",[JSON.stringify({eventsFileId:eventsFile,attendanceFileId:logsFile})]);
    const packageId=packageResult.rows[0].id;
    await assert.rejects(()=>asUser(db,owner,"select public.oaca_review_event_import_package($1::jsonb)",[JSON.stringify({packageId,decision:"approve"})]),/second authorized reviewer/i);
    const approved=await asUser(db,reviewer,"select (public.oaca_review_event_import_package($1::jsonb)).status status",[JSON.stringify({packageId,decision:"approve"})]);
    assert.equal(approved.rows[0].status,"approved");
    const normalizedEvents=[{title:"Imported Weekly Lab",description:"",startsAt:"2025-08-04T16:00:00.000Z",endsAt:"2025-08-04T17:00:00.000Z",seriesEndsOn:"2025-08-18",modality:"in_person",location:"Innovation Hall",capacity:null}];
    const normalizedAttendance=[{sourceLogId:"log-1",eventName:"Imported Weekly Lab",startsAt:"2025-08-04T16:00:00.000Z",studentSso:"student",studentEmail:"student@roseman.edu",studentId:"100",attendance:"not_recorded"},{sourceLogId:"log-2",eventName:"Imported Weekly Lab",startsAt:"2025-08-04T16:00:00.000Z",studentSso:"student",studentEmail:"student@roseman.edu",studentId:"100",attendance:"not_recorded"}];
    const processed=await db.query("select public.oaca_process_event_import_package($1,$2::jsonb,$3::jsonb,$4) result",[packageId,JSON.stringify(normalizedEvents),JSON.stringify(normalizedAttendance),"test-v1"]);
    assert.equal(processed.rows[0].result.occurrences,3);
    assert.equal(processed.rows[0].result.mergedDuplicates,1,JSON.stringify(processed.rows[0].result));
    const imported=await db.query("select count(*)::int count,bool_and(status='completed') completed,bool_and(capacity is null) unlimited from public.oaca_events where source_system='penji'");
    assert.deepEqual(imported.rows[0],{count:3,completed:true,unlimited:true});

    await assert.rejects(()=>db.query("update public.oaca_event_attendance_changes set new_status='present'"),/immutable/i);
  }finally{await db.close();}
});
