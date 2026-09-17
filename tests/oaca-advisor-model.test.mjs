import assert from "node:assert/strict";
import test from "node:test";
import {
  advisorRelationshipLabel,
  allowedAdvisorWorkspaces,
  attentionTotal,
  careerRoadmap,
  isReportCellVisible,
  upcomingAdvisorVisits,
} from "../app/production/oaca-advisor-model.ts";

test("next-up fallback excludes historical and cancelled visits and returns the nearest three", () => {
  const now = new Date("2026-09-17T12:00:00Z");
  const visit = (id, startsAt, status = "confirmed") => ({ id, startsAt, status });
  const history = [
    visit("history", "2026-07-09T12:00:00Z", "completed"),
    visit("past-confirmed", "2026-09-16T12:00:00Z"),
    visit("cancelled", "2026-09-18T12:00:00Z", "cancelled"),
    visit("no-show", "2026-09-18T12:00:00Z", "no_show"),
    visit("unscheduled", null),
    visit("invalid", "invalid-date"),
  ];
  assert.deepEqual(upcomingAdvisorVisits(history, now), []);
  assert.deepEqual(upcomingAdvisorVisits([
    ...history,
    visit("fourth", "2026-09-21T12:00:00Z"),
    visit("third", "2026-09-20T12:00:00Z", "counterproposed"),
    visit("first", "2026-09-18T12:00:00Z", "pending_approval"),
    visit("second", "2026-09-19T12:00:00Z"),
  ], now).map((item) => item.id), ["first", "second", "third"]);
});

test("advisor workspace capabilities stay service-specific", () => {
  assert.deepEqual(
    allowedAdvisorWorkspaces({
      roles: ["staff"],
      capabilities: ["oaca.advisor.academic"],
    }),
    ["academic"],
  );
  assert.deepEqual(
    allowedAdvisorWorkspaces({
      roles: ["staff"],
      capabilities: ["oaca.advisor.career"],
    }),
    ["career"],
  );
  assert.deepEqual(
    allowedAdvisorWorkspaces({ roles: ["administrator"], capabilities: [] }),
    ["academic", "career"],
  );
});

test("career roadmap is year-based and reports suppress small groups", () => {
  assert.deepEqual(
    [...new Set(careerRoadmap.map((item) => item.year))],
    [1, 2, 3, 4],
  );
  assert.ok(careerRoadmap.every((item) => item.required));
  assert.equal(isReportCellVisible(9), false);
  assert.equal(isReportCellVisible(10), true);
});

test("attention conditions and relationship labels are explainable", () => {
  assert.equal(
    attentionTotal([
      { key: "pending_request", label: "Pending requests", count: 2 },
      { key: "task_due", label: "Tasks due", count: 3 },
    ]),
    5,
  );
  assert.equal(
    advisorRelationshipLabel("outside_caseload"),
    "Outside permanent caseload",
  );
  assert.equal(
    advisorRelationshipLabel("drop_in"),
    "Current drop-in relationship",
  );
});
