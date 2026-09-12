import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultAdvisorAvailabilitySettings,
  expandAdvisorAvailability,
  normalizeAdvisorAvailability,
} from "../app/production/advisor-availability.ts";

test("advisor availability defaults appointments to 30 minutes", () => {
  assert.equal(defaultAdvisorAvailabilitySettings.defaultDurationMinutes, 30);
  assert.ok(
    defaultAdvisorAvailabilitySettings.blocks.every(
      (block) => block.durationMinutes === 30,
    ),
  );
});

test("legacy availability is normalized into an editable recurring block", () => {
  const result = normalizeAdvisorAvailability({
    weekdays: [1, 3, 5],
    startsAt: "09:00",
    endsAt: "12:00",
    bufferMinutes: 10,
    modalities: ["in_person", "teams"],
  });
  assert.equal(result.defaultDurationMinutes, 30);
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0].durationMinutes, 30);
  assert.deepEqual(result.blocks[0].weekdays, [1, 3, 5]);
});

test("availability expansion respects shorter and longer appointment blocks", () => {
  const provider = {
    id: "advisor-1",
    name: "Assigned Advisor",
    role: "Your academic advisor",
    serviceKey: "academic_advising",
  };
  const now = new Date("2026-09-13T08:00:00-07:00");
  const shorter = expandAdvisorAvailability(
    {
      defaultDurationMinutes: 20,
      blocks: [
        {
          id: "monday",
          weekdays: [1],
          startsAt: "09:00",
          endsAt: "10:00",
          bufferMinutes: 10,
          durationMinutes: 20,
          modalities: ["teams"],
          location: "",
        },
      ],
    },
    provider,
    { now, days: 1 },
  );
  assert.equal(shorter.length, 2);
  assert.equal(
    new Date(shorter[0].endsAt).getTime() -
      new Date(shorter[0].startsAt).getTime(),
    20 * 60_000,
  );

  const longer = expandAdvisorAvailability(
    {
      defaultDurationMinutes: 60,
      blocks: [
        {
          id: "monday-long",
          weekdays: [1],
          startsAt: "09:00",
          endsAt: "11:00",
          bufferMinutes: 0,
          durationMinutes: 60,
          modalities: ["in_person"],
          location: "Student Affairs Suite",
        },
      ],
    },
    provider,
    { now, days: 1 },
  );
  assert.equal(longer.length, 2);
  assert.equal(
    new Date(longer[0].endsAt).getTime() -
      new Date(longer[0].startsAt).getTime(),
    60 * 60_000,
  );
});

test("one-day availability augments recurring blocks without changing the weekly pattern", () => {
  const provider = {
    id: "advisor-1",
    name: "Assigned Advisor",
    role: "Your academic advisor",
    serviceKey: "academic_advising",
  };
  const slots = expandAdvisorAvailability(
    {
      defaultDurationMinutes: 30,
      blocks: [],
      exceptions: [
        {
          id: "extra-tuesday",
          date: "2026-09-15",
          kind: "add",
          startsAt: "13:00",
          endsAt: "14:00",
          bufferMinutes: 0,
          durationMinutes: 30,
          modalities: ["teams"],
          location: "",
        },
      ],
    },
    provider,
    { now: new Date("2026-09-14T08:00:00-07:00"), days: 2 },
  );
  assert.equal(slots.length, 2);
  assert.ok(slots.every((slot) => slot.startsAt.startsWith("2026-09-15")));
});
