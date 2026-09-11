import assert from "node:assert/strict";
import test from "node:test";
import {
  availabilityTimeBand,
  filterStudentAvailability,
  groupAvailabilityByDay,
  studentVisibleAvailabilityProviderIds,
} from "../app/production/oaca-student-availability.ts";

const future = (day, hour, minute = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + day);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
};

const slots = [
  {
    id: "academic-morning",
    providerId: "academic-1",
    providerName: "Academic Advisor",
    providerRole: "Your academic advisor",
    serviceKey: "academic_advising",
    startsAt: future(1, 9),
    endsAt: future(1, 9, 30),
    modalities: ["in_person", "teams"],
    location: "Student Affairs Suite",
    source: "compass",
  },
  {
    id: "academic-afternoon",
    providerId: "academic-2",
    providerName: "Drop-in Advisor",
    providerRole: "Academic drop-in advisor",
    serviceKey: "academic_advising",
    startsAt: future(2, 15),
    endsAt: future(2, 15, 30),
    modalities: ["teams"],
    location: null,
    source: "compass",
  },
  {
    id: "career",
    providerId: "career-1",
    providerName: "Career Advisor",
    providerRole: "Career advisor",
    serviceKey: "career_advising",
    startsAt: future(1, 12),
    endsAt: future(1, 12, 30),
    modalities: ["teams"],
    location: null,
    source: "compass",
  },
];

test("student availability filters by service, advisor, and modality", () => {
  const result = filterStudentAvailability(slots, {
    serviceKey: "academic_advising",
    providerIds: ["academic-1", "academic-2"],
    modality: "in_person",
  });
  assert.deepEqual(result.map((slot) => slot.id), ["academic-morning"]);
});

test("academic students can only query their assigned advisor's availability", () => {
  const providerIds = studentVisibleAvailabilityProviderIds({
    serviceKey: "academic_advising",
    assignedAcademicAdvisorId: "academic-1",
    careerAdvisorId: "career-1",
    peerTutorIds: ["tutor-1", "tutor-2"],
  });
  assert.deepEqual(providerIds, ["academic-1"]);
  assert.deepEqual(
    filterStudentAvailability(slots, {
      serviceKey: "academic_advising",
      providerIds,
      modality: "teams",
    }).map((slot) => slot.providerId),
    ["academic-1"],
  );
});

test("clickable time blocks group into readable days and time bands", () => {
  const academic = slots.filter((slot) => slot.serviceKey === "academic_advising");
  const days = groupAvailabilityByDay(academic);
  assert.equal(days.length, 2);
  assert.equal(days.reduce((count, day) => count + day.slots.length, 0), 2);
  assert.equal(availabilityTimeBand(slots[0].startsAt), "Morning");
  assert.equal(availabilityTimeBand(slots[1].startsAt), "Afternoon");
});
