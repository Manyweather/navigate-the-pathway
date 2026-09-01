import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { advisorInstrumentCatalog, studentInstrumentCatalog } from "../app/production/catalog.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("grant instrument assignment is represented by names and counts only", () => {
  assert.deepEqual(studentInstrumentCatalog.map(({ name, itemCount, openResponseCount }) => ({ name, itemCount, openResponseCount })), [
    { name: "Your Pre-Health Application Profile: A Self-Assessment", itemCount: 22, openResponseCount: 2 },
    { name: "Short Grit Survey", itemCount: 8, openResponseCount: 0 },
    { name: "MacLeod Clark Professional Identity Scale", itemCount: 9, openResponseCount: 0 },
    { name: "Brief Resilience Scale", itemCount: 6, openResponseCount: 0 },
  ]);
  assert.deepEqual(advisorInstrumentCatalog.map(({ name, itemCount }) => ({ name, itemCount })), [
    { name: "Advisor Coaching Competency Scale (ACCS)", itemCount: 20 },
  ]);
});

test("production client never persists domain records in localStorage", async () => {
  const production = await read("../app/production/production-pilot-app.tsx");
  const api = await read("../app/production/api-client.ts");
  assert.doesNotMatch(production, /localStorage|sessionStorage/);
  assert.doesNotMatch(api, /localStorage|sessionStorage/);
  assert.match(production, /server-side|saved securely|Supabase/i);
});

test("invitation handoff recovers the secure session and opens the student view first", async () => {
  const production = await read("../app/production/production-pilot-app.tsx");
  assert.match(production, /supabase\.auth\.refreshSession\(\)/);
  assert.match(production, /Retry secure connection/);
  assert.match(production, /value\.roles\.includes\("student"\) \? "student"/);
});

test("worker exposes authenticated survey and evaluation boundaries", async () => {
  const worker = await read("../cloudflare/pilot-api.ts");
  for (const route of [
    "/api/surveys/assignments",
    "/api/admin/survey-waves",
    "/api/evaluation/results",
    "/api/evaluation/export",
  ]) assert.match(worker, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(worker, /evaluation\.identifiable_results/);
  assert.match(worker, /requireStaffMfa/);
  assert.match(worker, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(worker, /service_role\s*[:=]\s*["'][A-Za-z0-9_-]{20}/);
});

test("database migration isolates evaluation data and enforces scoped access", async () => {
  const schema = await read("../supabase/migrations/202608310001_production_pilot.sql");
  for (const clause of [
    "create schema if not exists evaluation",
    "evaluation.identifiable_results",
    "enable row level security",
    "public.is_assigned_advisor",
    "Submitted survey responses are immutable",
    "configure_staging_tri_role_fixture",
    "The tri-role fixture is staging-only",
  ]) assert.match(schema, new RegExp(clause.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.match(schema, /revoke all on schema evaluation from public, anon, authenticated/i);
  assert.match(schema, /auth\.uid\(\)/);
  assert.doesNotMatch(schema, /social security|\bssn\b/i);
});

test("staging environment and Portfolio storage use locked server-side controls", async () => {
  const runtime = await read("../supabase/migrations/202609010000_runtime_environment.sql");
  const storage = await read("../supabase/migrations/202609010001_private_portfolio_storage.sql");
  assert.match(runtime, /pilot_runtime_config/);
  assert.match(runtime, /revoke all on public\.pilot_runtime_config from public, anon, authenticated/i);
  assert.match(runtime, /public\.pilot_environment\(\)/);
  assert.match(storage, /'pilot-portfolio'/);
  assert.match(storage, /public\s*=\s*false/i);
  assert.match(storage, /portfolio_object_is_shared/);
  assert.match(storage, /public\.staff_mfa_verified\(\)/);
  assert.match(storage, /public\.is_assigned_advisor/);
  assert.equal((storage.match(/create policy pilot_portfolio_/g) || []).length, 4);
});

test("survey data is absent from recommendation and routine student routing code", async () => {
  const model = await read("../app/demo-model.ts");
  const catalog = await read("../app/production/catalog.ts");
  assert.doesNotMatch(model, /grit|resilience|professional identity|survey score/i);
  assert.doesNotMatch(catalog, /prompt\s*:/i);
});

test("legacy Pilot navigation is renamed while redirect remains", async () => {
  const workspaces = await read("../app/components/feature-workspaces.tsx");
  const journey = await read("../app/journey-experience.tsx");
  const redirect = await read("../app/pilot/page.tsx");
  assert.match(workspaces, /id: "sessions", name: "Sessions"/);
  assert.match(journey, /Open Sessions/);
  assert.match(redirect, /redirect\("\/app"\)/);
});
