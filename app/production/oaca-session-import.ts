import { codeNarrativeThemes, type ThemeAnalysis } from "./oaca-theme-rules";
import { suggestImportMapping, type OacaImportMapping } from "./oaca-import-model";

export const narrativeFields = ["Session Feedback From Student", "Session Feedback From Tutor", "Agenda - Meeting", "Student - Open ended", "Student - Suggestions", "Tutor - Discussion", "Tutor - Follow up", "Tutor - Notes", "Tutor - Resources", "Tutor - Specialties", "Cancel Reason", "Student Attendance Reason", "narrative"];
export type ImportIssue = { rowNumber: number; severity: "warning" | "error"; code: string; message: string };
export type SessionImportOptions = { timezone?: string; narrativeProcessing?: boolean; columnMapping?: OacaImportMapping; cohortLabel?: string | null };
export type NormalizedSession = {
  source_row_number: number; source_session_id: string; student_external_id: string; provider_external_id: string;
  session_start_at: string; session_end_at: string | null; session_created_at: string | null; cancelled_at: string | null;
  duration_minutes: number; submitted_duration_minutes: number | null; service_type: string; status: string; source_attendance: string;
  cohort_label: string | null; course_or_subject: string; format: string; modality: string;
  narrative_fields: Record<string, string>; theme_analysis: ThemeAnalysis; issues: ImportIssue[];
};

/** RFC4180-style parsing with positional headers. Never silently overwrites duplicate names. */
export function parseImportCsv(text: string) {
  const records: string[][] = []; let record: string[] = []; let cell = ""; let quoted = false; let afterQuote = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; afterQuote = true; }
      else cell += c;
    } else if (c === '"' && !cell && !afterQuote) quoted = true;
    else if (c === ",") { record.push(cell); cell = ""; afterQuote = false; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      record.push(cell); if (record.some((value) => value.trim())) records.push(record);
      record = []; cell = ""; afterQuote = false;
    } else if (afterQuote && c.trim()) throw new Error("Unexpected text after a quoted CSV field.");
    else if (!afterQuote) cell += c;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  record.push(cell); if (record.some((value) => value.trim())) records.push(record);
  const originalHeaders = records.shift()?.map((header) => header.trim()) || [];
  if (!originalHeaders.length || originalHeaders.some((header) => !header)) throw new Error("Every CSV column must have a heading.");
  const counts = new Map<string, number>();
  const duplicateHeaders: string[] = [];
  const headers = originalHeaders.map((header) => {
    const key = header.toLowerCase(); const count = (counts.get(key) || 0) + 1; counts.set(key, count);
    if (count > 1) duplicateHeaders.push(header);
    return count === 1 ? header : `${header} [column ${counts.size + duplicateHeaders.length}]`;
  });
  if (new Set(headers).size !== headers.length) throw new Error("Ambiguous column headings; rename duplicated headings.");
  return { headers, originalHeaders, duplicateHeaders, records, rows: records.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] || ""]))) };
}

/** Resolve local wall time using IANA offsets; reject DST gaps and repeated hours. */
export function importTimestamp(date: string, time: string, timezone: string): string | null {
  if (!date.trim() && !time.trim()) return null;
  if (/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(date)) {
    const calendar = /^(\d{4})-(\d{2})-(\d{2})T/.exec(date);
    if (!calendar || new Date(Date.UTC(+calendar[1], +calendar[2] - 1, +calendar[3])).toISOString().slice(0, 10) !== date.slice(0, 10)) throw new Error("Invalid timestamp date");
    const value = new Date(date); if (!Number.isFinite(value.getTime())) throw new Error("Invalid timestamp"); return value.toISOString();
  }
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?$/.exec(date.trim());
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim() || parts?.[4] || "");
  if (!parts || !clock) throw new Error("A date and time are required");
  const [year, month, day] = parts.slice(1, 4).map(Number); const [hour, minute, second] = clock.slice(1).map((value) => Number(value || 0));
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  if (new Date(wall).toISOString().slice(0, 10) !== `${parts[1]}-${parts[2]}-${parts[3]}` || hour > 23 || minute > 59 || second > 59) throw new Error("Invalid date or time");
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const at = (stamp: number) => Object.fromEntries(formatter.formatToParts(new Date(stamp)).map((part) => [part.type, part.value]));
  const offsets = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) { const p = at(wall + delta); offsets.add(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - (wall + delta)); }
  const candidates = [...offsets].map((offset) => wall - offset).filter((stamp) => { const p = at(stamp); return +p.year === year && +p.month === month && +p.day === day && +p.hour === hour && +p.minute === minute && +p.second === second; });
  if (candidates.length !== 1) throw new Error("Ambiguous or nonexistent local time; supply an explicit UTC offset");
  return new Date(candidates[0]).toISOString();
}

export function normalizeSessionCsv(text: string, options: SessionImportOptions = {}) {
  const parsed = parseImportCsv(text); const timezone = options.timezone || "America/Los_Angeles";
  new Intl.DateTimeFormat("en", { timeZone: timezone });
  const mapping = { ...suggestImportMapping("penji_sessions", parsed.headers), ...options.columnMapping };
  const issues: ImportIssue[] = []; const sessions: NormalizedSession[] = [];
  const used = new Set<string>();
  parsed.duplicateHeaders.forEach(() => issues.push({ rowNumber: 1, severity: "warning", code: "duplicate_header", message: "An overlapping heading was preserved as a separate positional column; review mapping." }));
  for (const [index, row] of parsed.rows.entries()) {
    const rowNumber = index + 2; const rowIssues: ImportIssue[] = [];
    const issue = (code: string, message: string, severity: "warning" | "error" = "warning") => rowIssues.push({ rowNumber, severity, code, message });
    const value = (key: string, fallback?: string) => { const header = mapping[key] || fallback; if (header) used.add(header); return header ? (row[header] || "").trim() : ""; };
    const timestamp = (key: string, fallback: string) => {
      const header = mapping[key] || fallback; const timeHeader = header.replace(/Date$/, "Time");
      if (timeHeader !== header) used.add(timeHeader);
      try { return importTimestamp(value(key, fallback), timeHeader !== header ? row[timeHeader] || "" : "", timezone); }
      catch { issue("invalid_timestamp", `${key}: missing, invalid, or ambiguous date/time.`, "error"); return null; }
    };
    if (parsed.records[index].length !== parsed.headers.length) issue("column_count", "Row has a different number of columns than the header.", "error");
    const id = value("source_session_id", "Unique ID"); const student = value("student_external_id", "Student ID");
    if (!id || !student) issue("missing_identity", "Session ID and student ID are required.", "error");
    const start = timestamp("session_start_at", "Scheduled Start At Date"); const end = timestamp("session_end_at", "Scheduled End At Date");
    const created = timestamp("session_created_at", "Requested At Date"); const cancelled = timestamp("cancelled_at", "Cancelled At Date");
    if (!start) issue("missing_start", "A session start date and time are required.", "error");
    const lengthHeader = mapping.duration_minutes || "Scheduled Length";
    const rawLength = value("duration_minutes", "Scheduled Length");
    const duration = rawLength ? Number(rawLength) * (/^(?:Scheduled|Requested|Tutor Submitted) Length$/.test(lengthHeader) ? 60 : 1) : start && end ? (Date.parse(end) - Date.parse(start)) / 60000 : NaN;
    if (!Number.isFinite(duration) || duration < 0 || duration > 1440) issue("invalid_duration", "Duration must be a number between 0 and 1440 minutes.", "error");
    if (start && end && end < start) issue("end_before_start", "Session end precedes its start.", "error");
    if (start && created && created > start) issue("created_after_start", "Booking was recorded after the scheduled start; excluded from wait-time averages.");
    if (start && end && Number.isFinite(duration) && Math.abs((Date.parse(end) - Date.parse(start)) / 60000 - duration) > 1) issue("duration_mismatch", "Recorded duration differs from the scheduled time interval.");
    const status = value("status", "Status"); used.add("Student Attendance"); used.add("source_attendance");
    const attendance = (row.source_attendance ?? row["Student Attendance"] ?? "").trim();
    if (!status) issue("missing_status", "Source status is required.", "error");
    if ((/completed/i.test(status) && /^absent$/i.test(attendance)) || (/scheduled|cancelled|canceled/i.test(status) && /^present$/i.test(attendance))) issue("attendance_conflict", "Source status and attendance disagree; both values are preserved.");
    const notes: Record<string, string> = {};
    if (options.narrativeProcessing) for (const field of narrativeFields) { if (field in row) used.add(field); if (row[field]?.trim()) notes[field] = row[field].trim(); }
    const submitted = row["Tutor Submitted Length"]?.trim() || row.submitted_duration_minutes?.trim();
    if ("Tutor Submitted Length" in row) used.add("Tutor Submitted Length");
    if ("submitted_duration_minutes" in row) used.add("submitted_duration_minutes");
    const submittedMinutes = submitted ? Number(submitted) * (row["Tutor Submitted Length"]?.trim() ? 60 : 1) : null;
    if (submittedMinutes !== null && (!Number.isFinite(submittedMinutes) || submittedMinutes < 0 || submittedMinutes > 1440)) issue("invalid_submitted_duration", "Submitted duration is invalid.", "error");
    const cohort = value("cohort_label", "Agenda - Cohort") || options.cohortLabel || null;
    const service = value("service_type", "Appointment Type"); if (!service) issue("missing_service", "Service type is required.", "error");
    const session: NormalizedSession = { source_row_number: rowNumber, source_session_id: id, student_external_id: student, provider_external_id: value("provider_external_id", "Tutor Email"), session_start_at: start || "", session_end_at: end, session_created_at: created, cancelled_at: cancelled, duration_minutes: duration, submitted_duration_minutes: submittedMinutes, service_type: service, status, source_attendance: attendance, cohort_label: cohort, course_or_subject: value("course_or_subject", "Course"), format: value("format", "Kind"), modality: value("modality", "Location"), narrative_fields: notes, theme_analysis: codeNarrativeThemes(notes), issues: rowIssues };
    issues.push(...rowIssues); sessions.push(session);
  }
  const valid = sessions.filter((session) => !session.issues.some((issue) => issue.severity === "error"));
  return { sessions, issues, headers: parsed.headers, mapping, summary: { rows: sessions.length, validRows: valid.length, invalidRows: sessions.length - valid.length, students: new Set(valid.map((session) => session.student_external_id)).size, cohorts: [...new Set(valid.map((session) => session.cohort_label || "Unassigned"))], coverageStart: valid.map((session) => session.session_start_at).sort()[0] || null, coverageEnd: valid.map((session) => session.session_start_at).sort().at(-1) || null, missingNotes: valid.filter((session) => session.theme_analysis.state === "missing").length, uncategorizedNotes: valid.filter((session) => session.theme_analysis.state === "uncategorized").length, themes: Object.fromEntries([...new Set(valid.flatMap((session) => session.theme_analysis.matches.map((match) => match.theme)))].map((theme) => [theme, valid.filter((session) => session.theme_analysis.matches.some((match) => match.theme === theme)).length])), excludedColumns: parsed.headers.filter((header) => !used.has(header)) } };
}
