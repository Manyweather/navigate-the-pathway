import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import {
  parseCsv,
  csvText,
  rosterFromGrid,
  rosterColumns,
  validateRoster,
  localTimeToUtc,
  calendarFile,
  supportGeneration,
  appointmentEmail,
} from "../app/production/workspace-model.ts";
import {
  encryptCalendarSecret,
  decryptCalendarSecret,
} from "../cloudflare/workspace-calendars.ts";
test("CSV roster round trip preserves quotes, commas and multiline cells", () => {
  const grid = [
    [...rosterColumns],
    [
      "Last, First",
      "student@example.test",
      "",
      "student",
      "Pathway",
      "Cohort A",
      "advisor@example.test",
    ],
  ];
  assert.deepEqual(
    rosterFromGrid(parseCsv(csvText(grid)))[0].name,
    "Last, First",
  );
  assert.equal(parseCsv('a,b\n"two\nlines","a""b"')[1][1], 'a"b');
  assert.throws(() => parseCsv('"unfinished'), /Unclosed/);
});
test("roster validation catches aliases, duplicate addresses, invalid roles and formulas", () => {
  const r = {
    name: "A",
    primary_email: "A@Example.Test",
    secondary_email: "",
    role: "student",
    program: "Pathway",
    cohort: "A",
    advisor_email: "",
  };
  assert.equal(validateRoster([r])[0].values.primary_email, "a@example.test");
  assert.ok(validateRoster([r, { ...r, name: "B" }])[1].errors.length);
  assert.ok(validateRoster([{ ...r, role: "creator" }])[0].errors.length);
  assert.ok(validateRoster([{ ...r, name: "=1+1" }])[0].errors.length);
  assert.match(csvText([["=cmd()"]]), /"'=cmd/);
});
test("Excel templates round trip as text without formulas", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook
    .addWorksheet("Roster")
    .addRows([
      [...rosterColumns],
      [
        "Student",
        "student@example.test",
        "",
        "student",
        "Pathway",
        "A",
        "advisor@example.test",
      ],
    ]);
  const copy = new ExcelJS.Workbook();
  await copy.xlsx.load(await workbook.xlsx.writeBuffer());
  const grid = [];
  copy
    .getWorksheet("Roster")
    .eachRow((row) =>
      grid.push(rosterColumns.map((_, i) => row.getCell(i + 1).text)),
    );
  assert.equal(validateRoster(rosterFromGrid(grid))[0].errors.length, 0);
});
test("time zone conversion handles DST, rejects gaps and ambiguous local times", () => {
  assert.equal(
    localTimeToUtc("2026-09-08T09:00", "America/Los_Angeles"),
    "2026-09-08T16:00:00.000Z",
  );
  assert.equal(
    localTimeToUtc("2026-01-08T09:00", "America/Los_Angeles"),
    "2026-01-08T17:00:00.000Z",
  );
  assert.throws(
    () => localTimeToUtc("2026-03-08T02:30", "America/Los_Angeles"),
    /does not exist/,
  );
  assert.throws(
    () => localTimeToUtc("2026-11-01T01:30", "America/Los_Angeles"),
    /occurs twice/,
  );
});
test("calendar exports escape event text and preserve stable UIDs", () => {
  const body = calendarFile({
    id: "fixture",
    title: "Planning\nBEGIN:VEVENT",
    starts_at: "2026-09-09T16:00Z",
    ends_at: "2026-09-09T17:00Z",
  });
  assert.equal(body.split("\r\nBEGIN:VEVENT").length, 2);
  assert.match(body, /SUMMARY:Planning\\nBEGIN:VEVENT/);
  assert.match(body, /UID:fixture@navigate-pathway/);
});
test("calendar credentials are authenticated encryption and reject tampering", async () => {
  const key = Buffer.alloc(32, 8).toString("base64url");
  const encrypted = await encryptCalendarSecret("private tokens", key);
  assert.equal(await decryptCalendarSecret(encrypted, key), "private tokens");
  await assert.rejects(
    decryptCalendarSecret(encrypted, Buffer.alloc(32, 7).toString("base64url")),
  );
});
test("AI and appointment email remain explicitly disabled", () => {
  assert.equal(supportGeneration.enabled, false);
  assert.equal(appointmentEmail.enabled, false);
});
