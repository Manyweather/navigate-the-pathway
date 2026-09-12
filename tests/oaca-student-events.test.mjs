import assert from "node:assert/strict";
import test from "node:test";
import {
  eventAvailabilityLabel,
  filterStudentEvents,
  studentEventRegistrationStatus,
} from "../app/production/oaca-student-events-model.ts";

const now = new Date("2026-09-11T19:00:00Z").getTime();
const event = (id, startsAt, extra = {}) => ({
  id,
  startsAt,
  endsAt: null,
  status: "published",
  audienceEligible: true,
  publicCatalog: false,
  ...extra,
});

test("student event tabs keep discovery, registrations, and history distinct", () => {
  const events = [
    event("open", "2026-09-12T18:00:00Z"),
    event("registered", "2026-09-13T18:00:00Z", { registrationStatus: "registered" }),
    event("waitlisted", "2026-09-14T18:00:00Z", { registrationStatus: "waitlisted", waitlistPosition: 2 }),
    event("attended", "2026-09-09T18:00:00Z", { status: "completed", registrationStatus: "attended", attendanceStatus: "present" }),
    event("invited", "2026-09-08T18:00:00Z", { status: "completed" }),
    event("public", "2026-09-07T18:00:00Z", { status: "completed", audienceEligible: false, publicCatalog: true }),
  ];

  assert.deepEqual(filterStudentEvents(events, "upcoming", "for_me", now).map(({ id }) => id), ["open", "registered", "waitlisted"]);
  assert.deepEqual(filterStudentEvents(events, "mine", "for_me", now).map(({ id }) => id), ["registered", "waitlisted"]);
  assert.deepEqual(filterStudentEvents(events, "past", "for_me", now).map(({ id }) => id), ["attended", "invited"]);
  assert.deepEqual(filterStudentEvents(events, "past", "attended", now).map(({ id }) => id), ["attended"]);
  assert.deepEqual(filterStudentEvents(events, "past", "all_public", now).map(({ id }) => id), ["public"]);
});

test("event availability labels expose only the signed-in student's state", () => {
  assert.equal(studentEventRegistrationStatus({ startsAt: "2030-01-01", status: "published", registered: true }), "registered");
  assert.equal(eventAvailabilityLabel({ startsAt: "2030-01-01", status: "published", registrationStatus: "waitlisted", waitlistPosition: 3 }), "Waitlist position 3");
  assert.equal(eventAvailabilityLabel({ startsAt: "2030-01-01", status: "published", capacity: 20, registrationCount: 18 }), "2 spaces remaining");
  assert.equal(eventAvailabilityLabel({ startsAt: "2030-01-01", status: "published", capacity: 20, registrationCount: 20 }), "Waitlist available");
});

