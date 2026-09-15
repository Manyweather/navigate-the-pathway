import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("advisor home places appointment decisions immediately after availability", async () => {
  const source = await readFile(
    new URL("../app/production/compass-advisor-workspace.tsx", import.meta.url),
    "utf8",
  );
  const availability = source.indexOf('data-tutorial-id="advisor-home-availability"');
  const reviewQueue = source.indexOf('data-tutorial-id="advisor-home-review-queue"');
  const options = source.indexOf('data-tutorial-id="advisor-home-options"');
  const tasks = source.indexOf('data-tutorial-id="advisor-home-tasks"');
  assert.ok(availability >= 0 && reviewQueue > availability);
  assert.ok(options > reviewQueue && tasks > options);
  assert.match(source, /Approvals and cancellations/);
  assert.match(source, /Advisor options/);
  assert.match(source, /Cancelled/);
});

test("advising scheduling and availability include Zoom", async () => {
  const [advisor, compass, availability] = await Promise.all([
    readFile(new URL("../app/production/compass-advisor-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/oaca-compass-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/advisor-availability.ts", import.meta.url), "utf8"),
  ]);
  assert.match(advisor, /value="zoom">Zoom/);
  assert.match(compass, /"in_person", "phone", "teams", "zoom"/);
  assert.match(availability, /"in_person", "phone", "teams", "zoom"/);
});

test("advisor preview includes a larger fictional caseload and actionable cancellation", async () => {
  const source = await readFile(
    new URL("../app/production/synthetic-preview.ts", import.meta.url),
    "utf8",
  );
  for (const student of ["Avery Johnson", "Jordan Kim", "Maya Patel", "Noah Williams"]) {
    assert.match(source, new RegExp(student));
  }
  assert.match(source, /id: "appointment-academic-cancelled"[\s\S]*?status: "cancelled"/);
  for (const appointment of [
    "appointment-academic-request-jordan",
    "appointment-academic-cancelled-taylor",
    "appointment-career-request-cameron",
    "appointment-career-request-maya",
    "appointment-career-cancelled-noah",
  ]) {
    assert.match(source, new RegExp(`id: "${appointment}"`));
  }
  assert.match(source, /\["student-1", "student-2", "student-5", "student-6"\]/);
});
