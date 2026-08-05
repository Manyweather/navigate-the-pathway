import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server renders the media-first opening", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Your experiences already matter/);
  assert.match(html, /Navigate Learning Coach/);
  assert.match(html, /Not an admissions decision tool/i);
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("ships visual missions, diagrams, persistence, and navigation", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../app/journey-experience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const station of ["Course Camp", "Experience Vault", "Compassion Commons", "Cohort Commons", "Reflection Studio", "Application Outlook"]) assert.match(source, new RegExp(station));
  for (const phrase of ["Course status", "Specific moment", "Compassionate response", "Observe", "What changes next", "Future direction"]) assert.match(source, new RegExp(phrase));
  for (const mission of ["log-experience", "course-question", "support-outreach", "study-strategy", "cohort-participation", "reflection-review", "service-reflection", "application-evidence"]) assert.match(source, new RegExp(mission));
  assert.match(source, /navigate\.pipeline\.progress\.v1/);
  assert.match(source, /Continue my pathway/);
  assert.match(source, /Start over/);
  assert.match(source, /Clear this device/);
  assert.match(source, /Open next move/);
  assert.match(source, /requiredArtifact/);
  assert.match(source, /diagramComplete/);
  assert.match(source, /viewedVideos/);
  assert.match(source, /autoplayOnce/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /navigate-learning-coach-v1\.png/);
  assert.match(styles, /--maroon: #791034/);
  assert.match(styles, /\.diagram-track/);
  assert.match(styles, /\.station--stamped/);
  assert.match(styles, /\.app-dock/);
  assert.doesNotMatch(source, /\u2014/);
});

test("includes local avatar and caption assets", async () => {
  await Promise.all([
    access(new URL("../public/assets/navigate-learning-coach-v1.png", import.meta.url)),
    access(new URL("../public/media/welcome.vtt", import.meta.url)),
    access(new URL("../public/media/reflection-studio.vtt", import.meta.url)),
    access(new URL("../public/media/cohort-commons.vtt", import.meta.url)),
  ]);
});
