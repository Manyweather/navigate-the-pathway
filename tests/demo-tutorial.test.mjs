import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { demoTutorialChapters, demoTutorialSteps } from "../app/production/demo-workspace-tutorial.tsx";

test("every synthetic demonstration workspace has an optional role-aware tutorial", () => {
  const cases = [
    ["pathway", "pathway_student"],
    ["pathway", "platform_creator"],
    ["compass", "compass_student"],
    ["compass", "academic_advisor"],
    ["compass", "career_advisor"],
    ["compass", "compass_director"],
    ["impact", "impact_student"],
    ["impact", "impact_administrator"],
    ["impact", "community_liaison"],
  ];
  for (const [workspace, persona] of cases) {
    const steps = demoTutorialSteps(workspace, persona);
    assert.ok(steps.length >= 4, `${workspace}:${persona} should receive a complete walkthrough`);
    assert.equal(steps[0].selector, "[data-demo-guide='role-switcher']");
    assert.ok(steps.every((step) => step.id && step.chapterId && step.title && step.body && step.leadershipTitle && step.leadershipBody && step.selector));
    const chapters = demoTutorialChapters(workspace, persona);
    assert.ok(chapters.length >= 2, `${workspace}:${persona} should be split into resumable chapters`);
    assert.ok(chapters.reduce((minutes, chapter) => minutes + chapter.minutes, 0) >= 3);
    assert.equal(new Set(steps.map((step) => step.id)).size, steps.length, `${workspace}:${persona} step identifiers should be stable and unique`);
  }
});

test("tutorial progress and insights stay browser-local and guided tours never invoke record APIs", async () => {
  const source = await readFile(new URL("../app/production/demo-workspace-tutorial.tsx", import.meta.url), "utf8");
  assert.match(source, /navigate\.demo-tutorial\.v2/);
  assert.match(source, /window\.localStorage/);
  assert.doesNotMatch(source, /api\.request|fetch\(|XMLHttpRequest/);
  assert.match(source, /never submits, publishes, approves, cancels, or sends a record/);
  assert.match(source, /Learn this role/);
  assert.match(source, /Leadership overview/);
  assert.match(source, /Creator tutorial insights/);
});

test("Impact tutorial asks for a role and keeps Administrator and Liaison tours distinct", async () => {
  const source = await readFile(new URL("../app/production/demo-workspace-tutorial.tsx", import.meta.url), "utf8");
  assert.match(source, /Which Impact role would you like to explore\?/);
  assert.match(source, /navigate\.demo-tutorial\.pending-role\.v1/);
  assert.match(source, /window\.sessionStorage/);
  const administrator = demoTutorialSteps("impact", "impact_administrator");
  const liaison = demoTutorialSteps("impact", "community_liaison");
  assert.notDeepEqual(administrator.map((step) => step.id), liaison.map((step) => step.id));
  assert.ok(administrator.some((step) => /Administrator|administrative/i.test(`${step.title} ${step.body}`)));
  assert.ok(liaison.some((step) => /Liaison|community/i.test(`${step.title} ${step.body}`)));
});

test("tutorial targets are stable data hooks where a workflow control is highlighted", async () => {
  const [compass, advisor, impact, pathway] = await Promise.all([
    readFile(new URL("../app/production/oaca-compass-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/compass-advisor-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/genesis-impact-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/production-pilot-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(compass, /data-tutorial-id="student-availability"/);
  assert.match(compass, /data-tutorial-id="student-upcoming-events"/);
  assert.match(compass, /studentNavigation=/);
  assert.match(advisor, /data-tutorial-id={`advisor-tile-\$\{tile\.key\}`}/);
  assert.match(impact, /data-tutorial-id="impact-events"/);
  assert.match(pathway, /data-tutorial-id="pathway-portfolio"/);
});

test("Compass demo links can open the administrator view without broadening production access", async () => {
  const [access, preview, compass, impact, pathway] = await Promise.all([
    readFile(new URL("../app/production/platform-access.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/synthetic-preview.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/production/oaca-compass-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/genesis-impact-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/production-pilot-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(access, /requestedDemoRole === "admin"[\s\S]*?"compass_director"/);
  assert.match(preview, /Compass Administrator \/ Director/);
  assert.match(compass, /tutorialWorkspace="compass"/);
  assert.match(impact, /tutorialWorkspace="impact"/);
  assert.match(pathway, /tutorialWorkspace="pathway"/);
});
