import assert from "node:assert/strict";
import test from "node:test";
import worker, { codesMatch, createToken, verifyToken } from "../cloudflare/access-worker.ts";

const origin = "https://manyweather.github.io";
const env = {
  NAVIGATE_ACCESS_CODE: "roseman-pathway-42",
  NAVIGATE_SESSION_SECRET: "a-test-secret-that-is-long-enough-for-hmac-validation",
};

test("Cloudflare access service normalizes codes and signs twelve-hour sessions", async () => {
  assert.equal(await codesMatch(" Roseman Pathway 42 ", env.NAVIGATE_ACCESS_CODE), true);
  assert.equal(await codesMatch("wrong-code", env.NAVIGATE_ACCESS_CODE), false);
  const token = await createToken(env.NAVIGATE_SESSION_SECRET);
  assert.equal(await verifyToken(token, env.NAVIGATE_SESSION_SECRET), true);
  assert.equal(await verifyToken(`${token}x`, env.NAVIGATE_SESSION_SECRET), false);
});

test("Cloudflare access service unlocks, verifies, and restricts origins", async () => {
  const unlock = await worker.fetch(new Request("https://worker.example/api/access/unlock", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ code: "roseman pathway 42" }),
  }), env);
  assert.equal(unlock.status, 200);
  assert.equal(unlock.headers.get("access-control-allow-origin"), origin);
  const reply = await unlock.json();
  assert.equal(reply.ok, true);
  assert.equal(typeof reply.token, "string");
  assert.equal(reply.expiresIn, 43_200);

  const verify = await worker.fetch(new Request("https://worker.example/api/access/verify", {
    method: "POST",
    headers: { origin, authorization: `Bearer ${reply.token}` },
  }), env);
  assert.equal(verify.status, 200);

  const rejected = await worker.fetch(new Request("https://worker.example/api/access/unlock", {
    method: "POST",
    headers: { origin: "https://example.com", "content-type": "application/json" },
    body: JSON.stringify({ code: env.NAVIGATE_ACCESS_CODE }),
  }), env);
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
});

test("GitHub Pages build contains the application shell without credentials", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../dist-pages/index.html", import.meta.url), "utf8");
  assert.match(html, /Navigate the Pathway/);
  assert.doesNotMatch(html, /roseman-pathway-42|NAVIGATE_SESSION_SECRET=/);
});
