import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shell = fs.readFileSync(new URL("../app/prototype-shell.tsx", import.meta.url), "utf8");
const workspaces = fs.readFileSync(new URL("../app/components/feature-workspaces.tsx", import.meta.url), "utf8");
const roleDemo = fs.readFileSync(new URL("../app/demo/roles/page.tsx", import.meta.url), "utf8");

test("Pathway demo offers a direct role selector and Principal Investigator view", () => {
  assert.match(roleDemo, /initialSurface="entry"/);
  assert.match(shell, /Open Principal Investigator view/);
  assert.match(shell, /surface === "advisor" \|\| surface === "pi" \|\| surface === "admin"/);
  assert.match(workspaces, /mode: "advisor" \| "pi" \| "admin"/);
  assert.match(workspaces, /<h1>Principal Investigator<\/h1>/);
});

test("Principal Investigator copy states the protected-data boundary", () => {
  assert.match(workspaces, /cannot browse private messages, unshared drafts, or bypass participant consent/);
  assert.match(workspaces, /Small groups are suppressed/);
});
