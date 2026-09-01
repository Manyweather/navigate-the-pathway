import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pilotAnalyticsTestHelpers } from "../cloudflare/pilot-api.ts";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("fixed analytics dataset produces deterministic descriptive results", () => {
  const values = [1, 2, 3, 4, 5];
  assert.equal(pilotAnalyticsTestHelpers.mean(values), 3);
  assert.equal(pilotAnalyticsTestHelpers.median(values), 3);
  assert.equal(Number(pilotAnalyticsTestHelpers.standardDeviation(values).toFixed(4)), 1.5811);
  assert.equal(pilotAnalyticsTestHelpers.quartile(values, 0.75), 4);
});

test("rank correlation handles ties and attendance association", () => {
  const attendance = pilotAnalyticsTestHelpers.rank([1, 2, 2, 4]);
  const outcome = pilotAnalyticsTestHelpers.rank([1, 3, 2, 4]);
  assert.deepEqual(attendance, [1, 2.5, 2.5, 4]);
  assert.ok(pilotAnalyticsTestHelpers.correlation(attendance, outcome) > 0.8);
});

test("reverse-scored survey fixture preserves approved server-side calculation", () => {
  const definition = {
    version: "fixture-v1",
    instructions: "Fixture",
    options: [{ label: "One", value: "1" }, { label: "Two", value: "2" }, { label: "Three", value: "3" }, { label: "Four", value: "4" }, { label: "Five", value: "5" }],
    items: [{ prompt: "Direct" }, { prompt: "Reverse" }],
    reversePositions: [2],
    scoreKey: "mean",
  };
  assert.deepEqual(pilotAnalyticsTestHelpers.calculateSurveyScores(definition, { "1": "5", "2": "1" }), { mean: 5, total: 10, answeredItems: 2 });
});

test("false discovery rate adjustment is ordered and never below raw p-values", () => {
  const raw = [0.01, 0.04, 0.03, null];
  const adjusted = pilotAnalyticsTestHelpers.falseDiscoveryRate(raw);
  assert.deepEqual(adjusted.map((value) => value === null ? null : Number(value.toFixed(3))), [0.03, 0.04, 0.04, null]);
  raw.forEach((value, index) => { if (value !== null) assert.ok(adjusted[index] >= value); });
});

test("analytics UI and API enforce audience separation and small-cell safeguards", async () => {
  const worker = await read("../cloudflare/pilot-api.ts");
  const analytics = await read("../app/production/survey-analytics-center.tsx");
  assert.match(worker, /submission\.audience === audience/);
  assert.match(worker, /group\.length < configuration\.minimumGroupSize/);
  assert.match(worker, /smallSampleWarningBelow/);
  assert.match(worker, /One comparison dimension at a time|dimension = configuration\.enabledDimensions/);
  assert.match(analytics, /Student Surveys/);
  assert.match(analytics, /Advisor Surveys/);
  assert.match(analytics, /Cross-instrument averages are intentionally avoided|One comparison dimension at a time/);
});

test("Creator and PI governance stays server-authorized and dual approved", async () => {
  const worker = await read("../cloudflare/pilot-api.ts");
  const controls = await read("../app/production/creator-controls.tsx");
  const migration = await read("../supabase/migrations/202609010002_survey_analytics_governance.sql");
  assert.match(worker, /CREATOR_BOOTSTRAP_EMAIL/);
  assert.match(worker, /A principal cannot approve their own request/);
  assert.match(worker, /platform\.principal_investigator/);
  assert.match(controls, /Platform Creator Access/);
  assert.match(controls, /Principal Investigator Access/);
  assert.match(migration, /on delete set null/);
  assert.match(migration, /reset_evaluation_pilot_records/);
});

test("protected exports and qualitative coding require explicit capabilities and audit history", async () => {
  const worker = await read("../cloudflare/pilot-api.ts");
  assert.match(worker, /requireCapability\(context, "evaluation\.raw_export"\)/);
  assert.match(worker, /identifiable_confirmation_required/);
  assert.match(worker, /evaluation\.qualitative_analysis/);
  assert.match(worker, /qualitative_response_codings/);
  assert.match(worker, /human|reviewed_by|coded_by/i);
});
