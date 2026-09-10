import assert from "node:assert/strict";
import test from "node:test";
import { expandWeeklyDates, normalizeAttendance, normalizeCapacity, parseCsv, summarizePenjiEventFiles } from "../app/production/oaca-event-model.ts";

test("Penji event normalization expands weekly dates and treats 9999 as unlimited", () => {
  assert.deepEqual(expandWeeklyDates("2026-09-01", "2026-09-22"), ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"]);
  assert.equal(normalizeCapacity("9999"), null);
  assert.equal(normalizeCapacity("30"), 30);
  assert.equal(normalizeAttendance(""), "not_recorded");
  assert.equal(normalizeAttendance("Present"), "present");
});

test("quoted CSV content is parsed while non-operational metadata stays outside normalization", () => {
  const rows = parseCsv('Name,Location,Description\r\n"Event, One","Room 2","Bring questions, notes, and water"');
  assert.deepEqual(rows, [{ Name: "Event, One", Location: "Room 2", Description: "Bring questions, notes, and water" }]);
});

test("paired source preview reports matches, attendance, identity merges, and ignored metadata", () => {
  const events = `Name,Next Start Date,Next Start Time,Start Date,Start Time,End Date,End Time,Tutor Email,Tutor SSO ID,Tutor Name,Courses,Location,Location URL,Student Capacity\nStudy Lab,2026-09-11,12:00,2026-09-11,12:00,2026-09-11,13:00,host@roseman.edu,host,Host,,Room 1,,9999`;
  const logs = `Unique ID,Status,Event Name,Start At Date,Start At Time,End At Date,End At Time,Duration Minutes,Student Email,Student SSO ID,Student ID,Student Name,Student Attendance,Student Attendance Source,Tutor Email,Tutor SSO ID,Tutor Name,Recurrence,Courses,Location,Metadata - Phone Number\n1,Completed,Study Lab,2026-09-11,12:00,2026-09-11,13:00,60,student@roseman.edu,student,100,Student One,Present,Admin,host@roseman.edu,host,Host,Once,,Room 1,ignored`;
  const summary = summarizePenjiEventFiles(events, logs);
  assert.equal(summary.eventRows, 1);
  assert.equal(summary.attendanceRows, 1);
  assert.equal(summary.occurrenceMatches, 1);
  assert.equal(summary.present, 1);
  assert.deepEqual(summary.ignoredMetadataColumns, ["Metadata - Phone Number"]);
  assert.deepEqual(summary.missingRequiredEventHeaders, []);
  assert.deepEqual(summary.missingRequiredAttendanceHeaders, []);
});
