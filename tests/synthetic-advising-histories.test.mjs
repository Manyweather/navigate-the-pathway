import assert from "node:assert/strict";
import test from "node:test";
import { mergeMissingExamples } from "../app/production/synthetic-advising-histories.ts";

const personaKey = "navigate.synthetic-pilot-persona.v1";
const advisorKey = "navigate.compass.synthetic-advisor.v1";
const recordsKey = "navigate.compass.synthetic-encounters.v1";

test("all eight demo students have substantive, linked academic and career histories", async () => {
  const { syntheticPreviewApi: api } = await import("../app/production/synthetic-preview.ts?history-fresh");
  const data = await api.request("/api/oaca/bootstrap");
  assert.equal(new Set(data.appointments.map((item) => item.id)).size, data.appointments.length);
  assert.equal(new Set(data.encounterRecords.map((item) => item.appointmentId)).size, data.encounterRecords.length);
  const advisor = await api.request("/api/oaca/advisor/bootstrap?workspace=academic");
  for (const student of advisor.students) {
    const visits = data.appointments.filter((item) => item.studentId === student.id && item.status === "completed");
    assert.ok(visits.length >= 6 && visits.length <= 8, `${student.displayName}: ${visits.length} visits`);
    assert.equal(new Set(visits.map((item) => item.serviceName)).size, 2);
    const sorted = [...visits].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
    assert.equal(student.lastVisitAt, sorted[0].startsAt);
    assert.ok(Date.parse(sorted[0].startsAt) - Date.parse(sorted.at(-1).startsAt) >= 42 * 86400000);
    for (const visit of visits) {
      const record = data.encounterRecords.find((item) => item.appointmentId === visit.id);
      assert.ok(record, visit.id);
      const words = record.workingNotes.split(/\s+/).length;
      assert.ok(words >= 100 && words <= 180, `${visit.id}: ${words} words`);
      assert.ok(record.structuredData.followUp.length);
      assert.equal(record.studentRecap, visit.studentRecap);
      assert.ok(Date.parse(visit.startsAt) < Date.now());
      assert.ok(Date.parse(visit.endsAt) > Date.parse(visit.startsAt));
      assert.ok(Date.parse(record.publishedAt) >= Date.parse(visit.endsAt));
      assert.equal(visit.providerName, visit.serviceName === "Academic advising" ? student.assignedAdvisorName : "Art Avila, M.Ed.");
    }
  }
  assert.equal(data.encounterRecords.length, 50);
  assert.equal(data.appointments.find((item) => item.id === "appointment-1").status, "confirmed");
  assert.equal(data.appointments.find((item) => item.id === "appointment-academic-cancelled").status, "cancelled");
  for (const workspace of ["academic", "career"]) {
    const scoped = await api.request(`/api/oaca/advisor/bootstrap?workspace=${workspace}`);
    assert.ok(scoped.appointments.every((item) => item.serviceName.toLowerCase().includes(workspace)));
    assert.ok(scoped.encounterRecords.every((item) => scoped.appointments.some((visit) => visit.id === item.appointmentId)));
  }
});

test("backfill preserves saved edits and user entries, survives reload, and keeps drafts private", async () => {
  const { syntheticPreviewApi: initial } = await import("../app/production/synthetic-preview.ts?history-source");
  const seed = await initial.request("/api/oaca/bootstrap");
  const editedVisit = { ...seed.appointments.find((item) => item.id === "advising-history-student-1-1"), subject: "Saved edited subject", studentRecap: "Previously published recap" };
  const editedRecord = { ...seed.encounterRecords.find((item) => item.appointmentId === editedVisit.id), workingNotes: "", studentRecap: "Unpublished edited draft", revision: 4 };
  const customVisit = { ...editedVisit, id: "user-created-visit", subject: "My own demo visit", studentRecap: undefined };
  const customRecord = { ...editedRecord, appointmentId: customVisit.id, workingNotes: "Private user note", publishedAt: null };
  const values = new Map([
    [personaKey, "academic_advisor"],
    [advisorKey, JSON.stringify({ appointments: [editedVisit, customVisit] })],
    [recordsKey, JSON.stringify([editedRecord, customRecord])],
  ]);
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) } };
  try {
    const { syntheticPreviewApi: api } = await import("../app/production/synthetic-preview.ts?history-saved");
    // Advisor bootstrap must load saved notes even before the general bootstrap.
    const advisor = await api.request("/api/oaca/advisor/bootstrap?workspace=academic");
    assert.deepEqual(advisor.encounterRecords.find((item) => item.appointmentId === editedVisit.id), editedRecord);
    const data = await api.request("/api/oaca/bootstrap");
    assert.deepEqual(data.appointments.find((item) => item.id === editedVisit.id), editedVisit);
    assert.deepEqual(data.encounterRecords.find((item) => item.appointmentId === customVisit.id), customRecord);
    assert.equal(data.encounterRecords.length, seed.encounterRecords.length + 1);
    assert.equal(data.appointments.length, seed.appointments.length + 1);
    // Existing save operations persist the merged collections.
    await api.request("/api/oaca/advisor/attention-flags", { method: "POST", body: { studentId: "student-1", label: "Demo follow-up" } });
    await api.request("/api/oaca/records", { method: "POST", body: { ...editedRecord, publishRecap: false } });
    const { syntheticPreviewApi: reloaded } = await import("../app/production/synthetic-preview.ts?history-reloaded");
    const reload = await reloaded.request("/api/oaca/bootstrap");
    assert.equal(reload.appointments.length, data.appointments.length);
    assert.equal(reload.encounterRecords.length, data.encounterRecords.length);
    assert.equal(reload.encounterRecords.find((item) => item.appointmentId === editedVisit.id).workingNotes, "");
    assert.equal(reload.encounterRecords.find((item) => item.appointmentId === editedVisit.id).revision, 5);
    values.set(personaKey, "compass_student");
    const student = await reloaded.request("/api/oaca/bootstrap");
    assert.deepEqual(student.encounterRecords, []);
    assert.ok(student.appointments.every((item) => item.studentId === "synthetic-compass-student"));
    assert.equal(student.appointments.find((item) => item.id === editedVisit.id).studentRecap, "Previously published recap");
    assert.equal(student.appointments.find((item) => item.id === customVisit.id).studentRecap, undefined);
    assert.doesNotMatch(JSON.stringify(student), /Unpublished edited draft|Private user note/);
    await assert.rejects(() => reloaded.request("/api/oaca/advisor/bootstrap"), /cannot access staff/);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("missing-example merge is additive and idempotent even with an empty saved history", () => {
  const defaults = [{ id: "example", note: "Example" }];
  const saved = [{ id: "example", note: "" }, { id: "custom", note: "Mine" }];
  assert.deepEqual(mergeMissingExamples(saved, defaults, (item) => item.id), saved);
  const first = mergeMissingExamples([], defaults, (item) => item.id);
  assert.deepEqual(mergeMissingExamples(first, defaults, (item) => item.id), defaults);
});
