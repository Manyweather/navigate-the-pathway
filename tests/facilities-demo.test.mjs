import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cloneFacilitiesDemoState,
  facilitiesInsights,
  facilitiesRequestStages,
  facilitiesVenueCatalogSummary,
  makeEventSetupRequest,
  nextFacilitiesRequestStatus,
  reservationConflicts,
  roomAvailability,
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

test("room maps distinguish available, tentative, and unavailable time blocks", () => {
  const state = cloneFacilitiesDemoState();
  assert.equal(roomAvailability("room-101", "2026-09-16", "10:30", "11:00", state.reservations), "unavailable");
  assert.equal(roomAvailability("room-h201", "2026-09-22", "13:30", "14:00", state.reservations), "tentative");
  assert.equal(roomAvailability("room-h202", "2026-09-22", "13:30", "14:00", state.reservations), "available");
  assert.ok(state.rooms.some((room) => room.building === "Henderson Campus" && room.hours && room.features.length));
  assert.ok(state.rooms.some((room) => room.building === "South Jordan Campus" && room.hours && room.features.length));
});

test("FacilitiesLink parity includes keys, related work records, venue paths, and account access", async () => {
  const state = cloneFacilitiesDemoState();
  assert.ok(state.keyRequests.some((item) => item.status === "approval" && item.revokeOnSeparation));
  assert.ok(state.accessRequests.some((item) => item.status === "pending"));
  assert.equal(facilitiesVenueCatalogSummary.reduce((sum, item) => sum + item.count, 0), 175);
  const source = await readFile(new URL("../app/production/facilities-dashboard-app.tsx", import.meta.url), "utf8");
  for (const label of ["Keys & access", "Reserve by date", "Reserve by venue", "Quotes", "Invoices", "Request more access", "End access on separation"]) assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(source, /dental-equipment request/);
  assert.match(source, /Photos or documents/);
  assert.match(source, /Open 360° room preview/);
});

test("Facilities demo exposes Administrator, Staff, and Requester personas", async () => {
  assert.deepEqual(FACILITIES_DEMO_PERSONAS.map((item) => item.key), ["facilities_administrator", "facilities_staff", "facilities_requester"]);
  assert.equal(facilitiesDemoPersonaForSlug("admin"), "facilities_administrator");
  assert.equal(facilitiesDemoPersonaForSlug("staff"), "facilities_staff");
  assert.equal(facilitiesDemoPersonaForSlug("requester"), "facilities_requester");
  assert.equal(facilitiesDemoSlugForPersona("facilities_requester"), "requester");
  const requester = syntheticMembershipsForPersona("facilities_requester")[0];
  const staff = syntheticMembershipsForPersona("facilities_staff")[0];
  const admin = syntheticMembershipsForPersona("facilities_administrator")[0];
  assert.deepEqual(requester.roles, ["requester"]);
  assert.equal(requester.capabilities.includes("facilities.inventory.department"), true);
  assert.equal(staff.capabilities.includes("facilities.requests.work"), true);
  assert.equal(admin.capabilities.includes("facilities.inventory"), true);
  const source = await readFile(new URL("../app/production/facilities-dashboard-app.tsx", import.meta.url), "utf8");
  assert.match(source, /url\.searchParams\.set\("preview", "facilities"\)/);
  assert.match(source, /Demo only: external email is simulated/);
  assert.match(source, /Reset synthetic data/);
  assert.match(source, /Take inventory photo/);
  assert.match(source, /Every submitted event, spreadsheet-style/);
  assert.match(source, /Green is available, yellow is tentative, and red is unavailable/);
});
