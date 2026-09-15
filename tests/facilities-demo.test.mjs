import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cloneFacilitiesDemoState,
  facilitiesInsights,
  facilitiesRequestStages,
  makeEventSetupRequest,
  nextFacilitiesRequestStatus,
  reservationConflicts,
} from "../app/production/facilities-demo-model.ts";
import {
  FACILITIES_DEMO_PERSONAS,
  facilitiesDemoPersonaForSlug,
  facilitiesDemoSlugForPersona,
  syntheticMembershipsForPersona,
} from "../app/production/synthetic-preview.ts";

test("Facilities uses the connected request-to-completion workflow", () => {
  assert.deepEqual(facilitiesRequestStages.map((stage) => stage.key), ["new_request", "approval", "prep", "in_progress", "complete"]);
  assert.equal(nextFacilitiesRequestStatus("new_request"), "approval");
  assert.equal(nextFacilitiesRequestStatus("approval"), "prep");
  assert.equal(nextFacilitiesRequestStatus("complete"), null);
});

test("approved reservations can create a linked preparation work order", () => {
  const state = cloneFacilitiesDemoState();
  const reservation = state.reservations.find((item) => item.id === "RSV-2206");
  assert.ok(reservation);
  const request = makeEventSetupRequest({ ...reservation, status: "approved" }, 1050);
  assert.equal(request.status, "prep");
  assert.equal(request.reservationId, reservation.id);
  assert.ok(request.prepTasks.length >= 3);
});

test("room conflicts and proactive insights are explainable", () => {
  const state = cloneFacilitiesDemoState();
  const conflicts = reservationConflicts({ id: "candidate", roomId: "room-101", date: "2026-09-16", startsAt: "10:30", endsAt: "11:00" }, state.reservations);
  assert.equal(conflicts.length, 1);
  const insights = facilitiesInsights(state);
  assert.ok(insights.some((item) => item.id === "low-stock" && item.source.length > 0));
  assert.ok(insights.some((item) => item.id === "urgent" && item.source.length > 0));
  assert.ok(insights.some((item) => item.id === "liquor" && item.source.length > 0));
});

test("Facilities demo exposes only Administrator and Requester personas", async () => {
  assert.deepEqual(FACILITIES_DEMO_PERSONAS.map((item) => item.key), ["facilities_administrator", "facilities_requester"]);
  assert.equal(facilitiesDemoPersonaForSlug("admin"), "facilities_administrator");
  assert.equal(facilitiesDemoPersonaForSlug("requester"), "facilities_requester");
  assert.equal(facilitiesDemoSlugForPersona("facilities_requester"), "requester");
  const requester = syntheticMembershipsForPersona("facilities_requester")[0];
  const admin = syntheticMembershipsForPersona("facilities_administrator")[0];
  assert.deepEqual(requester.roles, ["requester"]);
  assert.equal(requester.capabilities.includes("facilities.inventory"), false);
  assert.equal(admin.capabilities.includes("facilities.inventory"), true);
  const source = await readFile(new URL("../app/production/facilities-dashboard-app.tsx", import.meta.url), "utf8");
  assert.match(source, /url\.searchParams\.set\("preview", "facilities"\)/);
  assert.match(source, /Demo only: external email is simulated/);
  assert.match(source, /Reset synthetic data/);
});
