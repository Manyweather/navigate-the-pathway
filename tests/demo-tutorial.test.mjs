import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { demoTutorialSteps } from "../app/production/demo-workspace-tutorial.tsx";

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
    assert.ok(steps.every((step) => step.title && step.body && step.selector));
  }
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

