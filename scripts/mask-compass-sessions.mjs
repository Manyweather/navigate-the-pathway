import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID, randomInt } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { codeNarrativeThemes, fictionalThemeSentences, themeRuleVersion } from "../app/production/oaca-theme-rules.ts";

// No original identifiers, notes, or identity mappings are written to logs or disk.
const [input, outputDirectory, bundledModules] = process.argv.slice(2);
if (!input || !outputDirectory || !bundledModules) throw new Error("Usage: node mask-compass-sessions.mjs INPUT OUTPUT_DIRECTORY BUNDLED_NODE_MODULES");
const requireBundled = createRequire(path.join(bundledModules, "../package.json"));
const { Workbook } = await import(pathToFileURL(requireBundled.resolve("@oai/artifact-tool")).href);
const source = await fs.readFile(input, "utf8");
const originalDigest = createHash("sha256").update(source).digest("hex");
const workbook = await Workbook.fromCSV(source, { sheetName: "Source" });
const matrix = workbook.worksheets.getItemAt(0).getUsedRange().values;
const sourceHeaders = matrix[0].map(String);
const rows = matrix.slice(1).filter((row) => row.some((value) => value !== null && value !== "")).map((row) => Object.fromEntries(sourceHeaders.map((header, i) => [header, String(row[i] ?? "")])));
const shuffle = (values) => { for (let i = values.length - 1; i > 0; i--) { const j = randomInt(i + 1); [values[i], values[j]] = [values[j], values[i]]; } return values; };
const studentKeys = shuffle([...new Set(rows.map((row) => row["Student ID"]))]);
const providerKeys = shuffle([...new Set(rows.map((row) => row["Tutor Email"]))]);
const students = new Map(studentKeys.map((key, i) => [key, { id: `DEMO-STU-${String(i + 1).padStart(4, "0")}`, name: `Demo Learner ${String(i + 1).padStart(3, "0")}`, email: `learner${i + 1}@students.example.org` }]));
const providers = new Map(providerKeys.map((key, i) => [key, { id: `DEMO-ADV-${String(i + 1).padStart(3, "0")}`, name: `Demo Advisor ${String(i + 1).padStart(2, "0")}`, email: `advisor${i + 1}@example.org` }]));
const notes = ["Session Feedback From Student", "Session Feedback From Tutor", "Agenda - Meeting", "Student - Open ended", "Student - Suggestions", "Tutor - Discussion", "Tutor - Follow up", "Tutor - Notes", "Tutor - Resources", "Tutor - Specialties", "Cancel Reason", "Student Attendance Reason"];
const timeFields = sourceHeaders.filter((header) => / At (Date|Time)$/.test(header));
const retain = ["Status", "Kind", "Recurrence", "Requested Length", "Scheduled Length", "Tutor Submitted Length", "Student Attendance"];
const outputHeaders = ["Dataset Label", "Dataset Mode", "Unique ID", "Student ID", "Student Name", "Student Email", "Tutor SSO ID", "Tutor Name", "Tutor Email", "Appointment Type", "Course", "Location", "Agenda - Cohort", "cohort_label", ...timeFields, ...retain, ...notes];
const safeLiteralSets = new Map(retain.map((field) => [field, new Set(rows.map((row) => row[field]))]));
const shift = (value) => {
  if (!value) return "";
  const stamp = Date.parse(`${value}T12:00:00Z`); if (!Number.isFinite(stamp)) throw new Error("Source date requires review");
  return new Date(stamp - 364 * 86400000).toISOString().slice(0, 10);
};
const changeCohort = (value) => value.replace(/\b20\d{2}\b/g, (year) => String(Number(year) - 1));
const outputRows = rows.map((row) => {
  const student = students.get(row["Student ID"]); const provider = providers.get(row["Tutor Email"]);
  const service = /career/i.test(row["Appointment Type"]) ? "Career Advising" : /tutor/i.test(row["Appointment Type"]) ? "Peer Tutoring" : "Academic Advising";
  const graduationYear = /\b(20\d{2})\b/.exec(row["Metadata - Expected Graduation"] || "")?.[1];
  const out = { "Dataset Label": "Masked historical patterns with fictional narratives", "Dataset Mode": "demo", "Unique ID": randomUUID(), "Student ID": student.id, "Student Name": student.name, "Student Email": student.email, "Tutor SSO ID": provider.id, "Tutor Name": provider.name, "Tutor Email": provider.email, "Appointment Type": service, Course: service, Location: /online|zoom|teams|virtual/i.test(row.Location) ? "Demo virtual meeting" : row.Location ? "Demo advising office" : "", "Agenda - Cohort": changeCohort(row["Agenda - Cohort"]), cohort_label: changeCohort(row["Agenda - Cohort"]) || (graduationYear ? `Class of ${Number(graduationYear) - 1}` : "") };
  for (const field of timeFields) out[field] = /Date$/.test(field) ? shift(row[field]) : row[field];
  for (const field of retain) out[field] = row[field];
  for (const field of notes) {
    const analysis = codeNarrativeThemes({ [field]: row[field] || "" });
    out[field] = analysis.state === "missing" ? "" : analysis.state === "uncategorized" ? "A general discussion was recorded for this fictional student; no specific topic was established." : [...new Set(analysis.matches.map((match) => match.theme))].map((theme) => fictionalThemeSentences[theme]).join(" ");
    assert.deepEqual([...new Set(codeNarrativeThemes({ [field]: out[field] }).matches.map((match) => match.theme))].sort(), [...new Set(analysis.matches.map((match) => match.theme))].sort(), "Rewritten note changed theme coding");
  }
  return out;
});
// Every output narrative is composed solely of reviewed generic sentences, never source fragments.
const allowedSentences = new Set([...Object.values(fictionalThemeSentences), "A general discussion was recorded for this fictional student; no specific topic was established."]);
for (const row of outputRows) for (const field of notes) {
  let text = row[field]; for (const sentence of allowedSentences) text = text.replaceAll(sentence, "");
  assert.equal(text.trim(), "", "Unexpected narrative content");
}
const count = (values) => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((entry) => entry === value).length]));
for (const field of retain) { assert.deepEqual(count(rows.map((row) => row[field])), count(outputRows.map((row) => row[field]))); assert.ok(outputRows.every((row) => safeLiteralSets.get(field).has(row[field]))); }
assert.deepEqual(Object.values(count(rows.map((row) => row["Student ID"]))).sort(), Object.values(count(outputRows.map((row) => row["Student ID"]))).sort());
for (let i = 0; i < rows.length; i++) for (const field of timeFields.filter((field) => field.endsWith("Date"))) if (rows[i][field]) assert.equal(Date.parse(rows[i][field]) - Date.parse(outputRows[i][field]), 364 * 86400000);

const artifact = Workbook.create(); const sheet = artifact.worksheets.add("Demo sessions");
const outputMatrix = [outputHeaders, ...outputRows.map((row) => outputHeaders.map((header) => row[header] ?? ""))];
sheet.getRangeByIndexes(0, 0, outputMatrix.length, outputHeaders.length).values = outputMatrix;
artifact.recalculate();
const savedValues = sheet.getUsedRange().values;
const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = savedValues.map((row) => row.map(quote).join(",")).join("\r\n") + "\r\n";
const originalIdentifiers = [...new Set(rows.flatMap((row) => ["Unique ID", "Student ID", "Student Email", "Student Name", "Tutor Email", "Tutor Name", "Student SSO ID", "Tutor SSO ID", "Metadata - Phone Number", "Metadata - Residence location"].map((field) => row[field]).filter((value) => value?.length >= 4)))];
assert.equal(originalIdentifiers.filter((value) => csv.toLowerCase().includes(value.toLowerCase())).length, 0, "Original identifier detected in output");
assert.equal(createHash("sha256").update(await fs.readFile(input, "utf8")).digest("hex"), originalDigest, "Source file changed");
await fs.mkdir(outputDirectory, { recursive: true });
await fs.writeFile(path.join(outputDirectory, "compass-demo-sessions.csv"), csv, "utf8");
const guide = `# Compass demo sessions\n\nMasked historical patterns with fictional narratives.\n\n## Upload\nChoose **Demo**, timezone **America/Los_Angeles**, and enable **Code narrative themes**. Select compass-demo-sessions.csv, review the interpretation, upload for scanning, confirm the suggested mapping, and approve the demo import. The completed import opens demo insights. This requires the accompanying Compass application and database changes to be deployed first.\n\n## Contents\n${rows.length} sessions and ${students.size} consistent fictional student identities. Source status counts: ${JSON.stringify(count(rows.map((row) => row.Status)))}. Attendance counts (empty means unknown): ${JSON.stringify(count(rows.map((row) => row["Student Attendance"])))}.\n\nNames are neutral fictional learner/advisor labels; email addresses use example.org. Session IDs are new random UUIDs. Dates move back 364 days; cohort years move back one year. Cohort uses the explicit agenda value, otherwise the supplied graduation year; missing values remain unassigned. Exact source visit patterns remain, so this is not a guarantee against reidentification.\n\n## Fields\n- Unique ID: stable session deduplication key. Reuse this file to test repeat uploads.\n- Student ID / Student Name / Student Email: consistent fictional student labels. No real-account matching in Demo.\n- Tutor SSO ID / Tutor Name / Tutor Email: consistent fictional provider labels.\n- Appointment Type / Course / Location: generic service and location categories.\n- Requested, Scheduled, Started, Ended, and Cancelled At Date/Time: shifted calendar dates and preserved local times. Scheduled date/time defines the session; recorded start/end are retained in the file as source context.\n- Requested Length / Scheduled Length / Tutor Submitted Length: original decimal HOURS. Compass multiplies scheduled and submitted lengths by 60; submitted duration remains separate from scheduled duration.\n- Status / Student Attendance: independent source values. Blank attendance stays unknown; contradictions are flagged.\n- Agenda - Cohort: original presence/absence with shifted year. cohort_label: explicit or graduation-derived shifted cohort for reporting.\n- Narrative columns: generic fictional sentences preserving only coded broad themes. Blank or non-substantive source entries become blank. Unmatched narrative text becomes a generic uncategorized discussion.\n- Dataset Label / Dataset Mode: describe the file; choose Demo explicitly in Compass.\n\n## Theme coding\nRules: ${themeRuleVersion}. Multi-label phrase matching with explicit negation handling covers study strategies, exam preparation, time management, academic planning, wellbeing, study-environment barriers, tutoring/resources, career exploration, and follow-up. Coding is conservative and can miss nuanced language. Authorized reviewers can correct categories without editing the notes. No external model or training service is used.\n\n## Interpretation\nScheduled hours measure planned duration, not verified time delivered. Absence rate uses only recorded Present/Absent attendance. Notes and documented follow-up do not establish diagnoses, causality, completion, or resolution. Groups below 10 students are suppressed. Source status, dates, durations, and repeated-student visit counts reconcile with the original; all narrative fields use reviewed generic sentence templates. No original-to-fictional identity mapping is included.\n`;
await fs.writeFile(path.join(outputDirectory, "compass-demo-field-guide.md"), guide, "utf8");
console.log(JSON.stringify({ rows: rows.length, students: students.size, providers: providers.size, outputColumns: outputHeaders.length, narrativeCellsReviewed: rows.length * notes.length, originalIdentifiersDetected: 0, statusCounts: count(rows.map((row) => row.Status)), files: ["compass-demo-sessions.csv", "compass-demo-field-guide.md"] }));
