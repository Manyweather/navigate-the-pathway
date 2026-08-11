import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDefaultState } from "../app/demo-model.ts";
import { createDefaultPrototypeState, migratePrototypeState, PROTOTYPE_STORAGE_KEY } from "../app/prototype-store.tsx";

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test("new prototype state takes precedence over both legacy stores", () => {
  const current = createDefaultPrototypeState();
  current.media.commitment = "reflection-review";
  const storage = memoryStorage({
    [PROTOTYPE_STORAGE_KEY]: JSON.stringify({ version: 1, state: current }),
    "navigate-demo:v3": JSON.stringify({ version: 3, state: createDefaultState() }),
    "navigate.pipeline.progress.v1": JSON.stringify({ artifacts: [], stamps: [], commitment: "course-question" }),
  });
  const result = migratePrototypeState(storage);
  assert.equal(result.state.media.commitment, "reflection-review");
  assert.equal(result.recovered, false);
});

test("legacy donor and media data merge without deleting legacy keys", () => {
  const donor = createDefaultState();
  const media = { artifacts: [{ id: "legacy-artifact", missionId: "log-experience", stationId: "evidence", label: "Legacy experience", response: "A useful moment", savedAt: "2026-08-01T00:00:00.000Z" }], stamps: ["evidence"], suggestedStation: "reflection", diagramProgress: {}, viewedVideos: ["welcome"], commitment: "reflection-review", reminderDate: "Tomorrow", focus: "records", lastUpdate: "2026-08-01T00:00:00.000Z", lastView: "home" };
  const donorRaw = JSON.stringify({ version: 3, state: donor });
  const mediaRaw = JSON.stringify(media);
  const storage = memoryStorage({ "navigate-demo:v3": donorRaw, "navigate.pipeline.progress.v1": mediaRaw });
  const result = migratePrototypeState(storage);
  assert.equal(result.recovered, true);
  assert.equal(result.state.media.artifacts[0].id, "legacy-artifact");
  assert.ok(result.state.artifacts.some((item) => item.id === "legacy-artifact"));
  assert.equal(storage.getItem("navigate-demo:v3"), donorRaw);
  assert.equal(storage.getItem("navigate.pipeline.progress.v1"), mediaRaw);
});

test("student-facing application source contains no em dash", async () => {
  const sources = await Promise.all([
    "../app/access-gate.tsx",
    "../app/prototype-shell.tsx",
    "../app/journey-experience.tsx",
    "../app/components/feature-workspaces.tsx",
    "../app/components/rosie-guide.tsx",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.doesNotMatch(sources.join("\n"), /\u2014/);
});

test("source never includes configured playtest secrets", async () => {
  const route = await readFile(new URL("../app/api/access/unlock/route.ts", import.meta.url), "utf8");
  assert.match(route, /NAVIGATE_ACCESS_CODE/);
  assert.match(route, /NAVIGATE_SESSION_SECRET/);
  assert.doesNotMatch(route, /process\.env\.[A-Z_]+\s*\|\|\s*["'][^"']+["']/);
});
