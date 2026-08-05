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
  assert.match(html, /<title>Your path is already in motion · Navigate Pathways<\/title>/i);
  assert.match(html, /You have already started your path to medicine/);
  assert.match(html, /No score\. No ranking\. About 6 minutes\./);
  assert.match(html, /Concept prototype/);
  assert.match(html, /Not an admissions decision tool/i);
  assert.doesNotMatch(html, /react-loading-skeleton|Your site is taking shape/);
});

test("keeps the critical safety, branching, and learning signals in the experience", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../app/journey-experience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /Private by default/);
  assert.match(source, /Never enter patient names or identifying details/);
  assert.match(source, /Why we suggested this/);
  assert.match(source, /Quiet participation is real participation/);
  assert.match(source, /accurate record → reflection → evidence → clearer writing later/);
  assert.match(source, /Recover the Evidence/);
  assert.match(source, /Chart the Route/);
  assert.match(source, /Find the Story/);
  assert.match(source, /Build the Constellation/);
  assert.match(source, /RouteMark/);
  assert.match(source, /Roseman University College of Medicine · concept experience/);
  assert.match(source, /Your route is taking shape/);
  assert.match(source, /Memory becomes evidence/);
  assert.match(styles, /--maroon: #791034/);
  assert.match(styles, /--navy: #1b2a4a/);
  assert.match(styles, /--teal: #1a6b6b/);
  assert.match(styles, /\.transition-screen/);
});
