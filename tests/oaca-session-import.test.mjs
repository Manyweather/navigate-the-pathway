import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSessionCsv, parseImportCsv, importTimestamp } from "../app/production/oaca-session-import.ts";
import { codeNarrativeThemes } from "../app/production/oaca-theme-rules.ts";
import { processSessionImport, boundedCsvText } from "../cloudflare/oaca-session-processor.ts";

const csv = 'Unique ID,Student ID,Status,Appointment Type,Scheduled Start At Date,Scheduled Start At Time,Scheduled End At Date,Scheduled End At Time,Scheduled Length,Student Attendance,Tutor - Notes,Agenda - Cohort\r\ns1,d1,Completed,Academic Advising,2025-09-17,10:00,2025-09-17,10:30,0.50,Absent,"Discussed study strategies.\nExam preparation and follow-up.",Class of 2029';
test("Penji times, hours, attendance, multiline notes, and cohorts normalize", () => {
  const data = normalizeSessionCsv(csv, { narrativeProcessing: true }); const row = data.sessions[0];
  assert.equal(data.summary.validRows, 1); assert.equal(row.duration_minutes, 30); assert.equal(row.session_start_at, "2025-09-17T17:00:00.000Z");
  assert.equal(row.source_attendance, "Absent"); assert.equal(row.status, "Completed"); assert.equal(row.cohort_label, "Class of 2029");
  assert.ok(row.issues.some((issue) => issue.code === "attendance_conflict")); assert.equal(row.theme_analysis.matches.length, 3);
  assert.equal(normalizeSessionCsv(csv).sessions[0].theme_analysis.state, "missing");
});
test("CSV does not overwrite case-insensitive duplicate headers or ignore malformed rows", () => {
  const parsed = parseImportCsv('ID,Metadata - NAME,Metadata - Name\n1,"a,b","quoted ""value"""');
  assert.equal(parsed.headers.length, 3); assert.equal(new Set(parsed.headers).size, 3); assert.equal(parsed.records[0][2], 'quoted "value"');
  assert.throws(() => parseImportCsv('id,note\n1,"unfinished'), /unclosed/);
  assert.equal(normalizeSessionCsv(csv + ',extra').summary.invalidRows, 1);
});
test("Timezone conversion rejects impossible dates and DST gaps/ambiguity", () => {
  assert.throws(() => importTimestamp("2025-03-09", "02:30", "America/Los_Angeles"));
  assert.throws(() => importTimestamp("2025-11-02", "01:30", "America/Los_Angeles"));
  assert.throws(() => importTimestamp("2025-02-30", "10:30", "America/Los_Angeles"));
  assert.throws(() => importTimestamp("2025-02-30T10:30:00Z", "", "America/Los_Angeles"));
  assert.equal(importTimestamp("2025-11-02T01:30:00-07:00", "", "America/Los_Angeles"), "2025-11-02T08:30:00.000Z");
});
test("Missing and negative duration and missing dates are errors; source blanks stay unknown", () => {
  assert.equal(normalizeSessionCsv(csv.replace("0.50", "-1")).summary.invalidRows, 1);
  assert.equal(normalizeSessionCsv(csv.replace("2025-09-17,10:00", ",")).summary.invalidRows, 1);
  assert.equal(normalizeSessionCsv(csv.replace(",Absent,", ",,")).sessions[0].source_attendance, "");
});
test("Theme rules handle negation, synonyms, multiple topics, word boundaries and blanks", () => {
  const themes = (text) => codeNarrativeThemes({ narrative: text }).matches.map((match) => match.theme);
  assert.deepEqual(themes("No tutoring needed. Exam preparation was not discussed. No follow-up planned."), []);
  assert.deepEqual(themes("No tutoring needed, but tutoring resources were discussed."), ["tutoring_resources"]);
  assert.ok(themes("Used active recall and spaced repetition.").includes("study_strategies"));
  assert.deepEqual(themes("The example was interesting."), []);
  assert.equal(codeNarrativeThemes({ narrative: "" }).state, "missing");
  assert.equal(codeNarrativeThemes({ narrative: "N/A" }).state, "missing");
  assert.equal(codeNarrativeThemes({ narrative: "General conversation." }).state, "uncategorized");
  assert.equal(codeNarrativeThemes({ narrative: "Follow-up planned." }).followUpDocumented, true);
});
test("Processor requires clean files and sends safe failure codes", async () => {
  const calls = []; let reads = 0;
  const services = { rest: async (path, options) => { calls.push([path, options]); if (path.includes("claim")) return { id: "b", job_id: "j", file_id: "f" }; if (path.startsWith("platform_files")) return [{ scan_status: "pending", original_name: "x.csv", size_bytes: 1 }]; }, readFile: async () => { reads++; return csv; } };
  await processSessionImport(services); assert.equal(reads, 0); assert.equal(JSON.parse(calls.at(-1)[1].body).error_code, "security_scan_incomplete");
});
test("Processor consumes a normalized session job and does not log source text", async () => {
  let sent; await processSessionImport({ rest: async (path, options) => { if (path.includes("claim")) return { id: "b", job_id: "j", file_id: "f", dataset_type: "penji_sessions", import_timezone: "America/Los_Angeles", narrative_processing: true, column_mapping: {} }; if (path.startsWith("platform_files")) return [{ scan_status: "clean", original_name: "x.csv", size_bytes: csv.length, storage_path: "x" }]; if (path.includes("process_import")) sent = JSON.parse(options.body); }, readFile: async () => csv });
  assert.equal(sent.normalized_rows[0].duration_minutes, 30); assert.equal(sent.normalized_rows[0].theme_analysis.matches.length, 3);
  await assert.rejects(() => boundedCsvText(new Response("12345"), 4), /unsupported_file/);
});
