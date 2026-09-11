import assert from "node:assert/strict";
import test from "node:test";
import { describeOacaAudience, engagementRate, validateCampaignContent, validateOacaAudience } from "../app/production/oaca-engagement-model.ts";

test("OACA outreach audiences remain explicit and readable", () => {
  assert.equal(validateOacaAudience({}), false);
  assert.equal(validateOacaAudience({ includeAllStudents: true }), true);
  assert.equal(validateOacaAudience({ includeAllMembers: true }), true);
  assert.equal(validateOacaAudience({ cohortLabels: ["Class of 2029"] }), true);
  assert.equal(describeOacaAudience({ cohortLabels: ["Class of 2029"], phases: ["Foundations"] }), "Cohort: Class of 2029 · Phase: Foundations");
  assert.equal(describeOacaAudience({ organizationIds: ["group-1"], studentCouncil: true, excludeUserIds: ["person-1"] }), "1 interest group · Student Council · 1 excluded");
});

test("campaign content requires accessible media and HTTPS links", () => {
  assert.deepEqual(validateCampaignContent({ heading: "Update", body: "Please review this event." }), []);
  assert.match(validateCampaignContent({ heading: "Update", body: "Please review.", mediaUrl: "http://example.com/video" })[0], /HTTPS/);
  assert.match(validateCampaignContent({ heading: "Update", body: "Please review.", mediaFileId: "file" })[0], /alternative text/i);
});

test("engagement rates are suppressed for small audiences", () => {
  assert.equal(engagementRate(5, 9), null);
  assert.equal(engagementRate(5, 10), 50);
  assert.equal(engagementRate(7, 20), 35);
});
