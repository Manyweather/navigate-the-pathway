import assert from "node:assert/strict";
import test from "node:test";
import {
  oacaHistoricalBaseline,
  parseCsvHeader,
  suggestImportMapping,
  suppressOacaMetric,
  validateImportMapping,
  validateImportUpload,
} from "../app/production/oaca-import-model.ts";

test("Compass fixes the first Penji baseline without freezing the student's current phase", () => {
  assert.deepEqual(oacaHistoricalBaseline, { sourceSystem: "penji", cohortLabel: "Class of 2029", coverageStartsOn: "2025-08-01", expectedGraduationYear: 2029 });
  assert.equal("currentYear" in oacaHistoricalBaseline, false);
});

test("CSV headers preserve quoted commas and map common Penji labels", () => {
  const headers = parseCsvHeader('Session ID,"Student Email",Start Time,Duration,Appointment Type,Status,"Topic, Category"\r\n1,a@example.edu,2025-08-01,60,Tutoring,Completed,Study');
  assert.deepEqual(headers, ["Session ID", "Student Email", "Start Time", "Duration", "Appointment Type", "Status", "Topic, Category"]);
  const mapping = suggestImportMapping("penji_sessions", headers);
  assert.equal(mapping.source_session_id, "Session ID");
  assert.equal(mapping.student_external_id, "Student Email");
  assert.equal(mapping.session_start_at, "Start Time");
  assert.equal(mapping.duration_minutes, "Duration");
  assert.equal(validateImportMapping("penji_sessions", mapping).valid, true);
});

test("required mappings and duplicate source columns are rejected", () => {
  const missing = validateImportMapping("student_roster", { student_external_id: "ID" });
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.missing, ["cohort_label", "expected_graduation_year"]);
  const duplicate = validateImportMapping("student_roster", { student_external_id: "Email", cohort_label: "Class", expected_graduation_year: "Class" });
  assert.equal(duplicate.valid, false);
  assert.deepEqual(duplicate.duplicateSourceColumns, ["Class"]);
});

test("import upload types stay narrow and aggregate cells suppress small cohorts", () => {
  assert.equal(validateImportUpload({ name: "penji.csv", type: "text/csv", size: 10 }), null);
  assert.equal(validateImportUpload({ name: "notes.pdf", type: "application/pdf", size: 10 }), "Use a CSV or XLSX file.");
  assert.deepEqual(suppressOacaMetric({ studentCount: 9, value: 12 }), { studentCount: 9, value: null, suppressed: true });
  assert.deepEqual(suppressOacaMetric({ studentCount: 10, value: 12 }), { studentCount: 10, value: 12, suppressed: false });
});
