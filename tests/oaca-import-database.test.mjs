import assert from "node:assert/strict";
import test from "node:test";
import { testDatabase } from "./workspace-database.mjs";

const org = "10000000-0000-4000-8000-000000000001";
const uploader = "10000000-0000-4000-8000-000000000002";
const reviewer = "10000000-0000-4000-8000-000000000003";
const file = "10000000-0000-4000-8000-000000000004";

async function asUser(db, userId, sql, params = []) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [userId, JSON.stringify({ sub: userId, aal: "aal2" })]);
  await db.exec("set role authenticated");
  try { return await db.query(sql, params); }
  finally { await db.exec("reset role"); }
}

test("real OACA imports require a clean file, explicit mapping, and a second reviewer", async () => {
  const db = await testDatabase("202609100006");
  try {
    await db.exec(`
      insert into public.organizations(id,name,slug) values('${org}','Roseman University','roseman');
      insert into auth.users(id,email,email_confirmed_at) values('${uploader}','uploader@roseman.edu',now()),('${reviewer}','reviewer@roseman.edu',now());
      insert into public.profiles(user_id,display_name,status,active_organization_id) values('${uploader}','Uploader','active','${org}'),('${reviewer}','Reviewer','active','${org}');
      insert into public.experience_role_assignments(user_id,experience_key,role,organization_id) values('${uploader}','oaca','administrator','${org}'),('${reviewer}','oaca','administrator','${org}');
      insert into public.platform_files(id,owner_id,experience_key,storage_path,original_name,mime_type,size_bytes,scan_status,scan_completed_at) values('${file}','${uploader}','oaca','${uploader}/oaca/imports/penji.csv','penji.csv','text/csv',100,'clean',now());
    `);
    const created = await asUser(db, uploader, "select (public.oaca_create_import_batch($1::jsonb)).id as id", [JSON.stringify({ fileId: file, datasetType: "penji_sessions", sourceSystem: "penji", cohortLabel: "Class of 2029", periodStartsOn: "2025-08-01", containsRealStudentData: true, sourceHeaders: ["Session ID","Student Email","Start Time","Duration","Service","Status"] })]);
    const batchId = created.rows[0].id;
    await asUser(db, uploader, "select (public.oaca_save_import_mapping($1::jsonb)).status as status", [JSON.stringify({ batchId, columnMapping: { source_session_id: "Session ID", student_external_id: "Student Email", session_start_at: "Start Time", duration_minutes: "Duration", service_type: "Service", status: "Status" } })]);
    await assert.rejects(() => asUser(db, uploader, "select public.oaca_review_import_batch($1::jsonb)", [JSON.stringify({ batchId, decision: "approve" })]), /second authorized reviewer/i);
    const approved = await asUser(db, reviewer, "select (public.oaca_review_import_batch($1::jsonb)).status as status", [JSON.stringify({ batchId, decision: "approve" })]);
    assert.equal(approved.rows[0].status, "approved");
    const jobs = await db.query("select count(*)::int as count from public.oaca_import_jobs where batch_id=$1", [batchId]);
    assert.equal(jobs.rows[0].count, 1);
  } finally { await db.close(); }
});
