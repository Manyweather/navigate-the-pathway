import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarPublicRoute,
  calendarRequest,
  syncCalendars,
} from "../cloudflare/workspace-calendars.ts";
import {
  appointmentEmailTemplate,
  mayDeliverAppointmentEmail,
} from "../cloudflare/workspace-email.ts";
const config = {
  googleClientId: "",
  googleClientSecret: "",
  microsoftClientId: "",
  microsoftClientSecret: "",
  encryptionKey: "",
  callbackUrl: "https://api.example.test/api/calendar/callback",
  allowedOrigins: ["https://portal.example.test"],
};
const svc = (service = async () => []) => ({
  config,
  user: {
    id: "fictional",
    token: "fixture",
    aal: "aal2",
    sessionId: "fixture",
  },
  rpc: async () => [],
  service,
});
test("calendar configuration stays disabled until all required credentials exist", async () => {
  const result = await calendarRequest(
    new Request("https://api.example.test/api/calendar/status"),
    svc(),
  );
  assert.deepEqual(await result.json(), { google: false, microsoft: false });
  await assert.rejects(
    calendarRequest(
      new Request("https://api.example.test/api/calendar/connect", {
        method: "POST",
        body: JSON.stringify({ provider: "google" }),
        headers: { origin: "https://portal.example.test" },
      }),
      svc(),
    ),
    /not configured/,
  );
});
test("OAuth callback rejects expired or replayed state without contacting a provider", async () => {
  let called = 0;
  await assert.rejects(
    calendarPublicRoute(
      new Request(
        "https://api.example.test/api/calendar/callback?state=expired&code=unused",
      ),
      svc(async (path) => {
        assert.match(path, /used_at=is.null/);
        called++;
        return [];
      }),
    ),
    /expired or was already used/,
  );
  assert.equal(called, 1);
});
test("calendar webhook verifies connection secret and deduplicates retry jobs", async () => {
  const jobs = new Map();
  const s = svc(async (path, options) => {
    if (path.startsWith("pathway_calendar_connections"))
      return [{ id: "connection", subscription_secret: "right" }];
    if (options?.method === "POST") {
      const job = JSON.parse(options.body);
      jobs.set(job.dedupe_key, job);
    }
    return [];
  });
  const req = (secret) =>
    new Request("https://api.example.test/api/calendar/webhook", {
      method: "POST",
      headers: {
        "x-goog-channel-id": "channel",
        "x-goog-channel-token": secret,
      },
    });
  await calendarPublicRoute(req("wrong"), s);
  assert.equal(jobs.size, 0);
  await calendarPublicRoute(req("right"), s);
  await calendarPublicRoute(req("right"), s);
  assert.equal(jobs.size, 1);
});
test("scheduled reconciliation checks connections even when provider notifications are missed", async () => {
  const paths = [];
  const s = svc(async (path) => {
    paths.push(path);
    return [];
  });
  s.config = { ...config, encryptionKey: "configured" };
  await syncCalendars(s);
  assert.ok(paths.some((p) => p.startsWith("pathway_calendar_connections")));
});
test("email templates are prepared without enabling delivery or replaying historical jobs", () => {
  for (const event of [
    "request",
    "accepted",
    "declined",
    "reschedule",
    "cancelled",
    "reminder",
  ])
    assert.match(
      appointmentEmailTemplate(event, "https://portal.example.test").text,
      /Sign in/,
    );
  assert.equal(
    mayDeliverAppointmentEmail({ status: "pending", createdAt: "2026-09-08" }),
    false,
  );
  assert.equal(
    mayDeliverAppointmentEmail(
      { status: "suppressed", createdAt: "2026-10-09" },
      { enabled: true, enabledSince: "2026-10-01" },
    ),
    false,
  );
  assert.equal(
    mayDeliverAppointmentEmail(
      { status: "pending", createdAt: "2026-09-08" },
      { enabled: true, enabledSince: "2026-10-01" },
    ),
    false,
  );
});
