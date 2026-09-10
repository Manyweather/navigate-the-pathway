import assert from "node:assert/strict";
import test from "node:test";
import { testDatabase } from "./workspace-database.mjs";

const org = "20000000-0000-4000-8000-000000000001";
const admin = "20000000-0000-4000-8000-000000000002";
const student = "20000000-0000-4000-8000-000000000003";
const file = "20000000-0000-4000-8000-000000000004";
const batch = "20000000-0000-4000-8000-000000000005";

async function asUser(db, userId, sql, params = [], aal = "aal2") {
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [userId, JSON.stringify({ sub: userId, aal })]);
  await db.exec("set role authenticated");
  try { return await db.query(sql, params); }
  finally { await db.exec("reset role"); }
}

test("OACA events, campaigns, forms, and nudges stay scoped and auditable", async () => {
  const db = await testDatabase("202609100007");
  try {
    await db.exec("create function public.digest(value text, algorithm text) returns bytea language sql immutable as $$select convert_to(md5(value),'UTF8')$$");
    await db.exec(`
      insert into public.organizations(id,name,slug) values('${org}','Roseman University','roseman-outreach');
      insert into auth.users(id,email,email_confirmed_at) values('${admin}','oaca-admin@roseman.edu',now()),('${student}','student@roseman.edu',now());
      insert into public.profiles(user_id,display_name,status,active_organization_id) values('${admin}','OACA Admin','active','${org}'),('${student}','Student','active','${org}');
      insert into public.experience_role_assignments(user_id,experience_key,role,organization_id) values('${admin}','oaca','administrator','${org}'),('${student}','oaca','student','${org}');
      insert into public.platform_files(id,owner_id,experience_key,storage_path,original_name,mime_type,size_bytes,scan_status) values('${file}','${admin}','oaca','${admin}/oaca/imports/test.csv','test.csv','text/csv',100,'clean');
      insert into public.oaca_import_batches(id,organization_id,file_id,source_system,dataset_type,status,requested_by) values('${batch}','${org}','${file}','student_information_system','student_roster','completed','${admin}');
      insert into public.oaca_student_dimensions(student_id,organization_id,cohort_label,current_phase,current_year,campus,effective_from,source_batch_id) values('${student}','${org}','Class of 2029','Foundations','M2','Summerlin','2025-08-01','${batch}');
    `);
    const eventResult = await asUser(db, admin, "select (public.oaca_create_event($1::jsonb)).id as id", [JSON.stringify({ title: "Career pathways evening", description: "Meet specialty advisors.", startsAt: "2030-10-01T18:00:00-07:00", endsAt: "2030-10-01T19:30:00-07:00", modality: "hybrid", location: "Summerlin and Teams", capacity: 50, audience: { cohortLabels: ["Class of 2029"] } })]);
    const eventId = eventResult.rows[0].id;
    await asUser(db, admin, "select public.oaca_publish_event($1::jsonb)", [JSON.stringify({ eventId })]);
    const feed = await asUser(db, student, "select public.oaca_event_feed('{}'::jsonb) as feed");
    assert.equal(feed.rows[0].feed[0].title, "Career pathways evening");
    const registration = await asUser(db, student, "select (public.oaca_register_event($1::jsonb)).status as status", [JSON.stringify({ eventId })]);
    assert.equal(registration.rows[0].status, "registered");

    const campaignResult = await asUser(db, admin, "select (public.oaca_create_campaign($1::jsonb)).id as id", [JSON.stringify({ name: "Career event invitation", subject: "Join the career pathways evening", previewText: "Reserve your place", content: { heading: "Career pathways evening", body: "Meet specialty advisors and bring your questions.", callToActionLabel: "View event", callToActionUrl: "https://navigate.example/app/oaca" }, audience: { cohortLabels: ["Class of 2029"] }, eventId, trackOpens: false, embeddedForm: { title: "What would help you prepare?", fields: [{ id: "response", label: "What would help you prepare?", responseType: "long_text", required: true }] } })]);
    const campaignId = campaignResult.rows[0].id;
    const queued = await asUser(db, admin, "select public.oaca_queue_campaign($1::jsonb) as result", [JSON.stringify({ campaignId })]);
    assert.equal(queued.rows[0].result.recipientCount, 1);
    const recipient = await db.query("select delivery_status from public.oaca_campaign_recipients where campaign_id=$1", [campaignId]);
    assert.equal(recipient.rows[0].delivery_status, "queued");
    const hiddenRecipients = await asUser(db, admin, "select count(*)::int as count from public.oaca_campaign_recipients where campaign_id=$1", [campaignId]);
    assert.equal(hiddenRecipients.rows[0].count, 0);
    const ownRecipient = await asUser(db, student, "select count(*)::int as count from public.oaca_campaign_recipients where campaign_id=$1", [campaignId]);
    assert.equal(ownRecipient.rows[0].count, 1);
    const form = await db.query("select form_id from public.oaca_outreach_campaigns where id=$1", [campaignId]);
    const formId = form.rows[0].form_id;
    const submitted = await asUser(db, student, "select (public.oaca_submit_form_response($1::jsonb)).id as id", [JSON.stringify({ formId, campaignId, responses: { response: "A specialty comparison would help." } })]);
    assert.ok(submitted.rows[0].id);
    const hiddenResponses = await asUser(db, admin, "select count(*)::int as count from public.oaca_form_responses where form_id=$1", [formId]);
    assert.equal(hiddenResponses.rows[0].count, 0);

    const nudge = await asUser(db, admin, "select (public.oaca_send_appointment_nudge($1::jsonb)).id as id", [JSON.stringify({ studentId: student, serviceKey: "career_advising", channels: ["in_app", "email"], dueBy: "2030-09-15" })]);
    const nudgeId = nudge.rows[0].id;
    const opened = await asUser(db, student, "select (public.oaca_update_nudge($1::jsonb)).status as status", [JSON.stringify({ nudgeId, action: "opened" })]);
    assert.equal(opened.rows[0].status, "opened");
    await assert.rejects(() => asUser(db, student, "select public.oaca_create_event($1::jsonb)", [JSON.stringify({ title: "Not allowed", startsAt: "2030-10-02T18:00:00-07:00", modality: "teams", audience: { includeAllStudents: true } })]), /capability and MFA/i);
    const audits = await db.query("select count(*)::int as count from public.audit_events where experience_key='oaca' and event_type like 'oaca_%'");
    assert.ok(audits.rows[0].count >= 5);
  } finally { await db.close(); }
});
