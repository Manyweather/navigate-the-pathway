import test from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./workspace-database.mjs";
import { normalizeSessionCsv } from "../app/production/oaca-session-import.ts";

const org = "10000000-0000-4000-8000-000000000001";
const uploader = "10000000-0000-4000-8000-000000000002";
const reviewer = "10000000-0000-4000-8000-000000000003";
const outsider = "10000000-0000-4000-8000-000000000004";
const file = "10000000-0000-4000-8000-000000000005";
async function as(db, user, name, payload) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal: "aal2" })]);
  await db.exec("set role authenticated");
  try { return (await db.query(`select to_jsonb(public.${name}($1::jsonb)) as value`, [JSON.stringify(payload)])).rows[0].value; }
  finally { await db.exec("reset role"); }
}
const headers = ["source_session_id", "student_external_id", "session_start_at", "duration_minutes", "service_type", "status", "source_attendance", "narrative"];
const csv = [headers.join(","), ...Array.from({ length: 12 }, (_, i) => `s${i},student${i % 10}@example.org,2025-09-17T10:00:00-07:00,30,Academic Advising,Completed,Present,Study strategies and follow-up.`)].join("\n");
const rows = normalizeSessionCsv(csv, { narrativeProcessing: true }).sessions;

test("Reviewed imports isolate demo identities, deduplicate, restrict narratives, code themes and recover failed jobs", async () => {
  const db = await testDatabase();
  try {
    // PGlite test stand-in only. Production uses pgcrypto SHA-256.
    await db.exec("create function public.digest(value text, algorithm text) returns bytea language sql immutable as $$select decode(md5(value)||md5(value||'x'),'hex')$$");
    await db.exec(`insert into public.organizations(id,name,slug) values('${org}','Test university','test-import');
      insert into auth.users(id,email,email_confirmed_at) values('${uploader}','uploader@example.org',now()),('${reviewer}','reviewer@example.org',now()),('${outsider}','outsider@example.org',now());
      insert into public.profiles(user_id,display_name,status,active_organization_id) values('${uploader}','Uploader','active','${org}'),('${reviewer}','Reviewer','active','${org}'),('${outsider}','Outside','active','${org}');
      insert into public.experience_role_assignments(user_id,experience_key,role,organization_id) values('${uploader}','oaca','administrator','${org}'),('${reviewer}','oaca','administrator','${org}');
      insert into public.platform_files(id,owner_id,experience_key,storage_path,original_name,mime_type,size_bytes,scan_status,scan_completed_at) values('${file}','${uploader}','oaca','${uploader}/oaca/imports/test.csv','test.csv','text/csv',100,'clean',now());`);
    const create = async (mode) => {
      const batch = await as(db, uploader, "oaca_create_import_batch", { fileId: file, datasetType: "penji_sessions", sourceSystem: "penji", datasetMode: mode, narrativeProcessing: true, sourceHeaders: headers });
      await as(db, uploader, "oaca_save_import_mapping", { batchId: batch.id, columnMapping: Object.fromEntries(headers.filter((h) => !["narrative", "source_attendance"].includes(h)).map((h) => [h, h])) });
      return batch;
    };
    const batch = await create("demo");
    assert.equal(batch.contains_real_student_data, false);
    await as(db, uploader, "oaca_review_import_batch", { batchId: batch.id, decision: "approve" });
    await assert.rejects(() => as(db, uploader, "oaca_save_import_mapping", { batchId: batch.id, columnMapping: {} }), /locked/);
    const claim = (await db.query("select public.oaca_claim_session_import() as value")).rows[0].value;
    assert.equal(claim.id, batch.id);
    const imported = (await db.query("select public.oaca_process_import_batch($1,$2::jsonb,'test') as value", [batch.id, JSON.stringify(rows)])).rows[0].value;
    assert.equal(imported.insertedRows, 12); assert.equal(imported.invalidRows, 0);
    assert.equal((await db.query("select count(*)::int n from public.oaca_historical_sessions where student_id is not null")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from public.oaca_external_identity_links")).rows[0].n, 0);
    const analytics = await as(db, uploader, "oaca_aggregate_analytics", { datasetMode: "demo" });
    assert.equal(analytics.totals.sessions, 12); assert.equal(analytics.totals.studentCount, 10); assert.equal(analytics.totals.repeatStudents, 2);
    assert.equal(analytics.themes.find((x) => x.theme === "study_strategies").sessions, 12);
    assert.equal(analytics.repeatThemes[0].sessions, null);
    assert.equal(JSON.stringify(analytics).includes("Study strategies and follow-up."), false);
    assert.equal((await as(db, uploader, "oaca_aggregate_analytics", { datasetMode: "live" })).totals, null);
    const id = (await db.query("select id from public.oaca_historical_sessions limit 1")).rows[0].id;
    await assert.rejects(() => as(db, outsider, "oaca_imported_narratives", { sessionId: id }), /Assigned student/);
    const note = await as(db, uploader, "oaca_imported_narratives", { sessionId: id });
    await as(db, uploader, "oaca_review_session_themes", { sessionId: id, themes: ["academic_planning"] });
    assert.deepEqual((await as(db, uploader, "oaca_imported_narratives", { sessionId: id })).fields, note.fields);
    assert.deepEqual((await as(db, uploader, "oaca_imported_narratives", { sessionId: id })).override, ["academic_planning"]);
    const duplicate = await create("demo"); await as(db, uploader, "oaca_review_import_batch", { batchId: duplicate.id, decision: "approve" });
    const duplicateResult = (await db.query("select public.oaca_process_import_batch($1,$2::jsonb,'test') as value", [duplicate.id, JSON.stringify(rows)])).rows[0].value;
    assert.equal(duplicateResult.duplicateRows, 12); assert.equal(duplicateResult.insertedRows, 0);
    const live = await create("live");
    await assert.rejects(() => as(db, uploader, "oaca_review_import_batch", { batchId: live.id, decision: "approve" }), /second authorized reviewer/);
    await as(db, reviewer, "oaca_review_import_batch", { batchId: live.id, decision: "approve" });
    await db.query("select public.oaca_process_import_batch($1,$2::jsonb,'test')", [live.id, JSON.stringify(rows)]);
    const liveId = (await db.query("select id from public.oaca_historical_sessions where dataset_mode='live' limit 1")).rows[0].id;
    await assert.rejects(() => as(db, uploader, "oaca_imported_narratives", { sessionId: liveId }), /Assigned student/);
    assert.equal((await as(db, uploader, "oaca_aggregate_analytics", { datasetMode: "live" })).totals.sessions, 12);
    assert.equal((await as(db, uploader, "oaca_aggregate_analytics", { datasetMode: "demo" })).totals.sessions, 12);
    const retry = await create("demo"); await as(db, uploader, "oaca_review_import_batch", { batchId: retry.id, decision: "approve" });
    const job = (await db.query("select public.oaca_claim_session_import() as value")).rows[0].value;
    await db.query("update public.oaca_import_jobs set attempts=3 where id=$1", [job.job_id]);
    await db.query("select public.oaca_fail_session_import($1,'sensitive source text')", [job.job_id]);
    assert.equal((await db.query("select last_error_code from public.oaca_import_jobs where id=$1", [job.job_id])).rows[0].last_error_code, "import_failed");
    assert.equal((await as(db, uploader, "oaca_retry_session_import", { batchId: retry.id })).queued, true);
    const reclaimed = (await db.query("select public.oaca_claim_session_import() as value")).rows[0].value;
    assert.equal(reclaimed.attempt, 1);
    await db.query("update public.oaca_import_jobs set locked_until=now()-interval '1 minute' where id=$1", [reclaimed.job_id]);
    assert.equal((await db.query("select public.oaca_claim_session_import() as value")).rows[0].value.attempt, 2);
  } finally { await db.close(); }
});
