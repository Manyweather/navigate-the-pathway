import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { testDatabase } from "./workspace-database.mjs";
import { processSessionImport } from "../cloudflare/oaca-session-processor.ts";
import { normalizeSessionCsv } from "../app/production/oaca-session-import.ts";

test("Generated 381-session deliverable passes queued processing and aggregate reconciliation", { skip: !process.env.COMPASS_DEMO_CSV }, async () => {
  const csv = await readFile(process.env.COMPASS_DEMO_CSV, "utf8");
  const preview = normalizeSessionCsv(csv, { narrativeProcessing: true });
  assert.equal(preview.summary.validRows, 381); assert.equal(preview.summary.students, 126);
  const org = "10000000-0000-4000-8000-000000000001", user = "10000000-0000-4000-8000-000000000002", file = "10000000-0000-4000-8000-000000000003", batch = "10000000-0000-4000-8000-000000000004";
  const db = await testDatabase();
  try {
    await db.exec(`create function public.digest(value text, algorithm text) returns bytea language sql immutable as $$select decode(md5(value)||md5(value||'x'),'hex')$$;
      insert into public.organizations(id,name,slug) values('${org}','Demo test','demo-test');
      insert into auth.users(id,email,email_confirmed_at) values('${user}','tester@example.org',now());
      insert into public.profiles(user_id,display_name,status,active_organization_id) values('${user}','Tester','active','${org}');
      insert into public.experience_role_assignments(user_id,experience_key,role,organization_id) values('${user}','oaca','administrator','${org}');
      insert into public.platform_files(id,owner_id,experience_key,storage_path,original_name,mime_type,size_bytes,scan_status,scan_completed_at) values('${file}','${user}','oaca','demo.csv','demo.csv','text/csv',100,'clean',now());
      insert into public.oaca_import_batches(id,organization_id,file_id,source_system,dataset_type,contains_real_student_data,dataset_mode,narrative_processing,status,requested_by,reviewed_by,reviewed_at) values('${batch}','${org}','${file}','penji','penji_sessions',false,'demo',true,'approved','${user}','${user}',now());
      insert into public.oaca_import_jobs(batch_id) values('${batch}');`);
    await processSessionImport({
      rest: async (path, options) => {
        const body = JSON.parse(options?.body || "{}");
        if (path === "rpc/oaca_claim_session_import") return (await db.query("select public.oaca_claim_session_import() as value")).rows[0].value;
        if (path.startsWith("platform_files?")) return (await db.query("select storage_path,original_name,size_bytes,scan_status from public.platform_files where id=$1", [file])).rows;
        if (path === "rpc/oaca_process_import_batch") return (await db.query("select public.oaca_process_import_batch($1,$2::jsonb,$3) as value", [body.batch_id, JSON.stringify(body.normalized_rows), body.processor_version])).rows[0].value;
        if (path === "rpc/oaca_fail_session_import") throw new Error(`Queued processing failed: ${body.error_code}`);
        throw new Error("Unexpected processor operation");
      }, readFile: async () => csv,
    });
    const result = (await db.query("select status,quality_summary from public.oaca_import_batches where id=$1", [batch])).rows[0];
    assert.equal(result.status, "completed"); assert.equal(result.quality_summary.insertedRows, 381); assert.equal(result.quality_summary.invalidRows, 0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal: "aal2" })]);
    const analytics = (await db.query("select public.oaca_aggregate_analytics('{\"datasetMode\":\"demo\"}') as value")).rows[0].value;
    assert.equal(analytics.totals.sessions, 381); assert.equal(analytics.totals.studentCount, 126);
    assert.equal(analytics.totals.completedSessions, 284); assert.equal(analytics.totals.cancelledSessions, 27); assert.equal(analytics.totals.scheduledSessions, 70);
    assert.equal(analytics.totals.absentSessions, 6); assert.equal(analytics.totals.attendanceRecorded, 285);
    assert.equal(analytics.totals.missingNotes, 72); assert.equal(analytics.totals.uncategorizedNotes, 53);
    assert.equal(analytics.totals.hours, Math.round(preview.sessions.reduce((sum, row) => sum + row.duration_minutes, 0) / 60 * 100) / 100);
    assert.equal(analytics.themes.find((theme) => theme.theme === "study_environment").suppressed, true);
    assert.equal((await db.query("select count(*)::int n from public.oaca_historical_sessions where student_id is not null")).rows[0].n, 0);
  } finally { await db.close(); }
});
