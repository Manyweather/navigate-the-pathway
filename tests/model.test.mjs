import assert from "node:assert/strict";
import test from "node:test";
import {
  advisorDemoStudents,
  advisorVisibleArtifacts,
  createSharedScenarioState,
  personaIntakes,
  recommendRoute,
  sensitiveSignals,
} from "../app/demo-model.ts";
import { buildApplicationExport, buildApplicationExportText } from "../app/application-export.ts";
import { aamcLimits } from "../app/aamc-guidance.ts";

test("all eight fictional presets produce all eight intended starting routes", () => {
  const routes = Object.values(personaIntakes).map((intake) => recommendRoute(intake).recommendedRoute);
  assert.deepEqual(new Set(routes), new Set(["chart", "recover", "story", "explore", "quiet", "constellation", "sustainable", "assemble"]));
});

test("route branching uses readiness context without prohibited score variables", () => {
  const source = recommendRoute.toString();
  for (const prohibited of ["gpa", "mcat", "race", "gender", "personality", "messageVolume"]) assert.doesNotMatch(source, new RegExp(prohibited, "i"));
});

test("privacy detector catches common identifiers", () => {
  assert.deepEqual(sensitiveSignals("student@example.edu and 702-555-1212"), ["an email address", "a phone number"]);
  assert.deepEqual(sensitiveSignals("One fictional moment without names."), []);
});

test("advisor visibility ends immediately after revocation or expiration", () => {
  const shared = createSharedScenarioState("advisor");
  assert.ok(advisorVisibleArtifacts(shared).length > 0);
  assert.deepEqual(advisorVisibleArtifacts({ ...shared, packet: { ...shared.packet, status: "revoked" } }), []);
  assert.deepEqual(advisorVisibleArtifacts({ ...shared, packet: { ...shared.packet, expiresAt: "2020-01-01T00:00:00.000Z" } }), []);
});

test("fictional advisor roster keeps packet content behind active sharing", () => {
  assert.equal(advisorDemoStudents.length, 4);
  assert.ok(advisorDemoStudents.filter((student) => student.packet.status === "shared").every((student) => student.packet.items.length > 0));
  assert.ok(advisorDemoStudents.filter((student) => student.packet.status !== "shared").every((student) => student.packet.items.length === 0));
});

test("application export includes finished work and omits drafts", () => {
  const state = createSharedScenarioState("advisor");
  state.drafts.secret = { key: "secret", workflow: "experience", sourceId: null, fields: { body: "Unfinished private draft" }, mode: "default", updatedAt: new Date().toISOString(), submissionId: "secret" };
  const text = buildApplicationExportText(buildApplicationExport(state));
  assert.match(text, /Saturday clinic shift/);
  assert.doesNotMatch(text, /Unfinished private draft/);
  assert.match(text, /does not change any advising share/i);
  assert.match(text, /Confirm the current AMCAS guide before submitting/);
});

test("cycle-specific application preparation limits stay centralized", () => {
  assert.deepEqual(aamcLimits, {
    experienceEntries: 15,
    recurringDateRanges: 4,
    mostMeaningfulEntries: 3,
    experienceDescriptionCharacters: 700,
    mostMeaningfulCharacters: 1325,
  });
});
