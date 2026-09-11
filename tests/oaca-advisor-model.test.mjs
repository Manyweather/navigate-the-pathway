import assert from "node:assert/strict";
import test from "node:test";
import {
  advisorRelationshipLabel,
  allowedAdvisorWorkspaces,
  attentionTotal,
  careerRoadmap,
  isReportCellVisible,
} from "../app/production/oaca-advisor-model.ts";

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
