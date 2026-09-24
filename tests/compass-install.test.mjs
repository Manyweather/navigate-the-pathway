import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Compass install contract opens the safe Roseman sign-in route", async () => {
  const manifest = await read("app/manifest.ts");
  assert.match(manifest, /id:\s*["']\/app["']/);
  assert.match(manifest, /start_url:\s*["']\/app\?signin=1["']/);
  assert.match(manifest, /scope:\s*["']\/["']/);
});

test("Compass registers a network-only service worker without protected caching", async () => {
  const layout = await read("app/layout.tsx");
  const registration = await read("app/pwa-registration.tsx");
  const worker = await read("public/compass-sw.js");
  assert.match(layout, /PwaRegistration/);
  assert.match(registration, /serviceWorker\.register\("\/compass-sw\.js"/);
  assert.match(worker, /addEventListener\("fetch"/);
  assert.match(worker, /event\.respondWith\(fetch\(event\.request\)\)/);
  assert.match(worker, /addEventListener\("push"/);
  assert.doesNotMatch(worker, /caches\.open|cache\.put/);
});

test("every Compass entry gate includes the install control", async () => {
  const paths = [
    "app/access-gate.tsx",
    "app/production/production-pilot-app.tsx",
    "app/production/auth-callback.tsx",
    "app/production/creator-recovery.tsx",
    "app/production/platform-access.tsx",
  ];
  for (const path of paths) assert.match(await read(path), /InstallCompass/);
});
