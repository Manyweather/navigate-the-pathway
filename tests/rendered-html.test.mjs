import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function fetchBuilt(request) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    request,
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function render() {
  return fetchBuilt(new Request("http://localhost/", { headers: { accept: "text/html" } }));
}

test("server renders the Rosie access gate before protected views", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Playtest access code/);
  assert.match(html, /Rosie saved your place/);
  assert.match(html, /not a student account or institutional login/i);
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("built access routes reject, unlock, authorize, and sign out", async () => {
  process.env.NAVIGATE_ACCESS_CODE = "test-code-4200";
  process.env.NAVIGATE_SESSION_SECRET = "test-session-secret-with-sufficient-length";
  const rejected = await fetchBuilt(new Request("http://localhost/api/access/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "wrong" }) }));
  assert.equal(rejected.status, 401);
  const unlocked = await fetchBuilt(new Request("http://localhost/api/access/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "test code 4200" }) }));
  assert.equal(unlocked.status, 200);
  const setCookie = unlocked.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /ntp_access=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Max-Age=43200/i);
  const cookie = setCookie.split(";")[0];
  const authorized = await fetchBuilt(new Request("http://localhost/", { headers: { accept: "text/html", cookie } }));
  const authorizedHtml = await authorized.text();
  assert.match(authorizedHtml, /Navigate The Pathway/);
  assert.match(authorizedHtml, /Start Rosie&#x27;s explanation/);
  assert.match(authorizedHtml, /Reviewer views/);
  const signedOut = await fetchBuilt(new Request("http://localhost/api/access/signout", { method: "POST", headers: { cookie } }));
  assert.equal(signedOut.status, 303);
  assert.match(signedOut.headers.get("set-cookie") ?? "", /Max-Age=0/i);
});

test("ships visual stations, unified persistence, Rosie, and functional navigation", async () => {
  const [journey, store, shell, styles] = await Promise.all([
    readFile(new URL("../app/journey-experience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-store.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const station of ["Courses", "Experiences", "Compassion & Values", "Cohort", "Your Story", "Application"]) assert.match(journey, new RegExp(station));
  for (const mission of ["log-experience", "course-question", "support-outreach", "study-strategy", "cohort-participation", "reflection-review", "service-reflection", "application-evidence"]) assert.match(journey, new RegExp(mission));
  assert.match(store, /navigate\.pathway\.demo\.v1/);
  assert.match(store, /navigate\.pipeline\.progress\.v1/);
  assert.match(store, /navigate-demo:v3/);
  assert.match(shell, /Quick capture/);
  assert.match(shell, /useState<Surface>\("pathway"\)/);
  assert.match(journey, /Continue my pathway/);
  assert.match(journey, /Navigate The Pathway/);
  assert.match(journey, /What would you like to focus on first\?/);
  assert.match(journey, /Build My Map/);
  assert.match(journey, /Why this matters/);
  assert.match(journey, /shared practice message board/);
  assert.match(journey, /Open station tools/);
  assert.match(journey, /Start Rosie's explanation/);
  assert.match(journey, /Play explanation/);
  assert.match(journey, /mediaFailed \? <div className="media-caption"/);
  assert.match(journey, /prefers-reduced-motion/);
  assert.match(styles, /--maroon: #791034/);
  assert.match(styles, /\.app-dock/);
  assert.match(styles, /\.rosie-guide/);
  assert.match(styles, /\.media-start-button/);
  assert.match(styles, /\.media-caption::after/);
  assert.match(styles, /\.rosie-guide > div::before/);
  assert.match(styles, /\.welcome-grid \.media-stage > img/);
  assert.match(styles, /\.welcome-grid \.media-stage \{[^}]*aspect-ratio: 16 \/ 9/);
  assert.match(styles, /\.welcome-grid \.media-stage video \{[^}]*object-fit: contain/);
  assert.match(styles, /\.welcome-landscape/);
});

test("includes Rosie, caption, and brand assets", async () => {
  await Promise.all([
    ...["idle", "gesture", "nodding", "pointing"].map((pose) => access(new URL(`../public/assets/rosie/${pose}.webp`, import.meta.url))),
    access(new URL("../public/assets/rosie/tracks.jpg", import.meta.url)),
    access(new URL("../public/assets/navigate-pathway-mark.svg", import.meta.url)),
    access(new URL("../public/assets/brand/aspire-logo.jpg", import.meta.url)),
    access(new URL("../public/assets/brand/oaca-emblem.png", import.meta.url)),
    access(new URL("../public/media/welcome.vtt", import.meta.url)),
    access(new URL("../public/media/reflection-studio.vtt", import.meta.url)),
    access(new URL("../public/media/cohort-commons.vtt", import.meta.url)),
    ...["welcome", "reflection-studio", "cohort-commons"].flatMap((name) => [
      access(new URL(`../public/media/${name}.mp4`, import.meta.url)),
      access(new URL(`../public/media/${name}.webm`, import.meta.url)),
      access(new URL(`../public/media/${name}-poster.jpg`, import.meta.url)),
    ]),
    access(new URL("../docs/content/ROSIE_SPEECH_HEYGEN_REVIEW.md", import.meta.url)),
  ]);
});

test("uses the finished explanation videos with resilient playback", async () => {
  const journey = await readFile(new URL("../app/journey-experience.tsx", import.meta.url), "utf8");
  for (const name of ["welcome", "reflection-studio", "cohort-commons"]) {
    assert.match(journey, new RegExp(`/media/${name}\\.webm`));
    assert.match(journey, new RegExp(`/media/${name}\\.mp4`));
    assert.match(journey, new RegExp(`/media/${name}-poster\\.jpg`));
  }
  assert.match(journey, /preload="metadata"/);
  assert.match(journey, /videoRef\.current\.play\(\)\.catch/);
  assert.doesNotMatch(journey, /<video[^>]+autoPlay/);
});

test("reviewer views include student-organized packets and functional route previews", async () => {
  const [reviewers, model, styles] = await Promise.all([
    readFile(new URL("../app/components/feature-workspaces.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demo-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(model, /advisorDemoStudents/);
  assert.match(reviewers, /Fictional student/);
  assert.match(reviewers, /Student-selected packet items/);
  assert.match(reviewers, /admin-route-preview/);
  assert.match(reviewers, /Open matching station tools/);
  assert.match(reviewers, /Why this route appeared/);
  assert.match(styles, /\.student-snapshot-grid/);
  assert.match(styles, /\.route-preview-columns/);
});

test("course and experience workspaces steer toward AMCAS organization without blocking early capture", async () => {
  const [workspaces, guidance, styles] = await Promise.all([
    readFile(new URL("../app/components/feature-workspaces.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/aamc-guidance.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(workspaces, /Start with what you know/);
  assert.match(workspaces, /Align with a transcript when you are ready/);
  assert.match(workspaces, /Review or add details/);
  assert.match(workspaces, /completed and future hours separate/i);
  assert.match(workspaces, /possible Most Meaningful/);
  assert.match(workspaces, /Leave anything blank until you can verify it/);
  assert.match(guidance, /experienceEntries: 15/);
  assert.match(guidance, /recurringDateRanges: 4/);
  assert.match(guidance, /experienceDescriptionCharacters: 700/);
  assert.match(guidance, /mostMeaningfulCharacters: 1325/);
  assert.match(styles, /\.guidance-details/);
  assert.match(styles, /\.alignment-grid/);
});

test("Story Studio turns AAMC essay guidance into student-authored visual lenses", async () => {
  const [workspaces, guidance, exportSource, styles] = await Promise.all([
    readFile(new URL("../app/components/feature-workspaces.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/aamc-guidance.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application-export.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const label of ["Why medicine?", "What shaped you?", "What should they know?", "Where are you going?"]) assert.match(guidance, new RegExp(label.replace("?", "\\?")));
  assert.match(workspaces, /Personal essay map/);
  assert.match(workspaces, /You do not need to disclose hardship/);
  assert.match(workspaces, /Draft in plain text when you are ready/);
  assert.match(workspaces, /final submission must reflect your own work and experiences/);
  assert.match(guidance, /personalCommentsCharacters: 5300/);
  assert.match(guidance, /mdPhdCharacters: 3000/);
  assert.match(guidance, /significantResearchCharacters: 10000/);
  assert.match(exportSource, /Personal Comments essay preparation/);
  assert.match(styles, /\.essay-lens-picker/);
  assert.match(styles, /\.essay-prompt-card/);
});
