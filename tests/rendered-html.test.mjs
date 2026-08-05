import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("server-renders the self-guided opening experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Your personalized premed pathway · Navigate Pathways<\/title>/i);
  assert.match(html, /Start with what you already have/);
  assert.match(html, /About 6 minutes · Private by default/);
  assert.match(html, /Concept prototype/);
  assert.match(html, /Not an admissions decision tool/i);
  assert.doesNotMatch(html, /react-loading-skeleton|Your site is taking shape/);
});

test("keeps the critical safety, branching, and learning signals in the experience", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../app/journey-experience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /You control sharing/);
  assert.match(source, /Never enter patient names or identifying details/);
  assert.match(source, /Why it works/);
  assert.match(source, /Quiet participation is real participation/);
  assert.match(source, /Premed district unlocked/);
  assert.match(source, /Course Camp/);
  assert.match(source, /Experience Vault/);
  assert.match(source, /Reflection Studio/);
  assert.match(source, /Cohort Commons/);
  assert.match(source, /Application Outlook/);
  assert.match(source, /Recover the Evidence/);
  assert.match(source, /Chart the Route/);
  assert.match(source, /Find the Story/);
  assert.match(source, /Build the Constellation/);
  assert.match(source, /premed-district-map\.png/);
  assert.match(source, /navigate-pipeline-roseman\.png/);
  assert.match(source, /Roseman University College of Medicine · concept experience/);
  assert.match(source, /Your pathway map is ready/);
  assert.match(source, /Memory becomes evidence/);
  assert.match(styles, /--maroon: #791034/);
  assert.match(styles, /--navy: #791034/);
  assert.match(styles, /--teal: #595854/);
  assert.match(styles, /\.district-map/);
  assert.match(styles, /\.app-dock/);
  assert.match(styles, /\.transition-screen/);
  assert.doesNotMatch(source, /\u2014/);
});
