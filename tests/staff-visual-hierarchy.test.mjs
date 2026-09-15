import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Compass assigns role-specific visual hierarchy only to staff shells", async () => {
  const source = await readFile(
    new URL("../app/production/oaca-compass-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /mode === "student"\s*\? ""/);
  assert.match(source, /mode === "peer_tutor"\s*\? "peer-tutor"/);
  assert.match(source, /\["tutoring_manager", "administrator", "creator"\]\.includes\(mode\)/);
  assert.match(source, /staff-workspace-shell--\$\{staffTone\}/);
});

test("staff hierarchy defines distinct advisor, tutor, and administrator accents", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.staff-workspace-shell \{[^}]*--staff-accent:#2f688d/);
  assert.match(css, /\.staff-workspace-shell--peer-tutor \{[^}]*--staff-accent:#0f6685/);
  assert.match(css, /\.staff-workspace-shell--administrator \{[^}]*--staff-accent:#791034/);
  assert.match(css, /border-left:6px solid var\(--staff-accent\)/);
  assert.match(css, /\.staff-section-heading h2[^}]*clamp\(1\.45rem,3vw,1\.9rem\)/);
  assert.match(css, /@media\(max-width:620px\)[\s\S]*?\.staff-workspace-shell \.staff-section-heading/);
});

test("template library has explicit, semantic library and creation headings", async () => {
  const source = await readFile(
    new URL("../app/production/compass-advisor-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /advisor-template-library/);
  assert.match(source, /<h2>Available templates<\/h2>/);
  assert.match(source, /<h2>Create a template<\/h2>/);
  assert.match(source, /staff-form-panel/);
});

test("tutoring and outreach detail screens participate in the staff hierarchy", async () => {
  const [tutoring, outreach] = await Promise.all([
    readFile(new URL("../app/production/peer-tutoring-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/oaca-engagement-center.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(tutoring, /staff-page-heading/);
  assert.match(tutoring, /tutoring-workspace--\$\{mode === "peer_tutor" \? "tutor" : "manager"\}/);
  assert.match(outreach, /experience-panel outreach-workspace/);
});
