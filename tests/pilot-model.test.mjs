import assert from "node:assert/strict";
import test from "node:test";
import { curriculumPrograms, matchCourseCode, snapshotCompleteness } from "../app/curriculum-data.ts";
import { advisorVisiblePortfolio, correctAttendance, createDefaultPilotState, recordStudentCheckIn, upsertSurveyResponseSet, validatePortfolioFile } from "../app/pilot-model.ts";

test("published curriculum references preserve program totals and eight terms", () => {
  assert.deepEqual(curriculumPrograms.map((item) => item.publishedTotalCreditHours), [123, 122, 123]);
  assert.ok(curriculumPrograms.every((item) => item.terms.length === 8));
  assert.equal(curriculumPrograms.find((item) => item.id === "chemistry-bs").terms[4].publishedTermTotal, 15);
});

test("course matching distinguishes exact, ambiguous, and unmatched student entries", () => {
  assert.equal(matchCourseCode("biology-bs", "ch-241").status, "exact");
  assert.equal(matchCourseCode("chemistry-bs", "CS 215").status, "ambiguous");
  assert.equal(matchCourseCode("biology-bs", "BIO 999").status, "unmatched");
  const termId = curriculumPrograms[0].terms[0].id;
  assert.deepEqual(snapshotCompleteness("biology-bs", termId, ["biology-bs-t1-r1"]), { reported: 1, published: 7 });
});

test("attendance check-in honors its window, blocks duplicates, and logs admin corrections", () => {
  const now = new Date("2026-08-17T16:00:00.000Z");
  const state = createDefaultPilotState(now);
  const first = recordStudentCheckIn(state, "fictional-session-checkin", now);
  assert.equal(first.outcome, "recorded");
  assert.equal(recordStudentCheckIn(first.state, "fictional-session-checkin", now).outcome, "duplicate");
  const corrected = correctAttendance(first.state, first.state.attendance.records[0].id, "excused", "fictional-admin", "Interface test", now);
  assert.equal(corrected.attendance.records[0].status, "excused");
  assert.equal(corrected.attendance.changeLog.length, 1);
});

test("survey shell stores completion metadata but no raw survey answers", () => {
  const now = new Date("2026-08-17T16:00:00.000Z");
  const completed = upsertSurveyResponseSet(createDefaultPilotState(now), "pre", ["Interface shell reviewed"], true, now);
  assert.equal(completed.surveys.responseSets[0].status, "complete");
  assert.equal("answers" in completed.surveys.responseSets[0], false);
});

test("portfolio intake validates formats and advisor visibility requires an active share", () => {
  assert.equal(validatePortfolioFile({ type: "application/pdf", size: 1024 }), null);
  assert.match(validatePortfolioFile({ type: "image/png", size: 1024 }), /PDF/);
  const docs = createDefaultPilotState().portfolioDocuments.map((item) => ({ ...item, shareWithAdvisor: true }));
  assert.equal(advisorVisiblePortfolio(docs, false).length, 0);
  assert.equal(advisorVisiblePortfolio(docs, true).length, 1);
  assert.ok(docs.every((item) => item.originalBytesStored === false));
});

test("pilot source does not introduce GPA, risk labels, or admissions predictions", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/components/pilot-workspaces.tsx", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /on track|at risk|competitive score|admissions probability/i);
});
