export type OacaImportDataset = "student_roster" | "penji_sessions";

export type OacaImportField = {
  key: string;
  label: string;
  required: boolean;
  aliases: readonly string[];
  description: string;
};

export const oacaHistoricalBaseline = {
  sourceSystem: "penji",
  cohortLabel: "Class of 2029",
  coverageStartsOn: "2025-08-01",
  expectedGraduationYear: 2029,
} as const;

export const oacaImportDatasets: Record<OacaImportDataset, { label: string; description: string; fields: readonly OacaImportField[] }> = {
  penji_sessions: {
    label: "Penji session history",
    description: "Appointment and tutoring activity exported from Penji. Free-text notes are excluded from the analytic record.",
    fields: [
      { key: "source_session_id", label: "Session ID", required: true, aliases: ["session id", "appointment id", "event id", "id"], description: "Stable Penji identifier used to prevent duplicate imports." },
      { key: "student_external_id", label: "Student external ID", required: true, aliases: ["student id", "student email", "student_email", "student"], description: "Matched in a restricted identity vault, then stored as a one-way hash." },
      { key: "provider_external_id", label: "Provider external ID", required: false, aliases: ["tutor id", "tutor email", "provider id", "advisor email", "provider"], description: "Optional provider match key." },
      { key: "session_created_at", label: "Requested or created at", required: false, aliases: ["created at", "requested at", "booked at", "session created"], description: "Used to calculate wait time when available." },
      { key: "session_start_at", label: "Session start", required: true, aliases: ["start time", "starts at", "session start", "appointment start", "date"], description: "Session date and time with timezone." },
      { key: "session_end_at", label: "Session end", required: false, aliases: ["end time", "ends at", "session end", "appointment end"], description: "Provide this or duration_minutes." },
      { key: "duration_minutes", label: "Duration minutes", required: false, aliases: ["duration", "minutes", "length"], description: "Provide this or session_end_at." },
      { key: "service_type", label: "Service type", required: true, aliases: ["service", "appointment type", "session type", "topic type"], description: "Academic advising, career advising, or peer tutoring." },
      { key: "course_or_subject", label: "Course or subject", required: false, aliases: ["course", "subject", "class"], description: "Course or tutoring subject without narrative notes." },
      { key: "topic_category", label: "Topic category", required: false, aliases: ["topic", "reason", "category"], description: "A controlled category, not a free-text advising note." },
      { key: "format", label: "Format", required: false, aliases: ["session format", "group type"], description: "Individual, small group, drop-in, or review." },
      { key: "modality", label: "Modality", required: false, aliases: ["location type", "delivery", "meeting type"], description: "In person, Teams, phone, or other approved value." },
      { key: "status", label: "Status", required: true, aliases: ["attendance status", "appointment status", "outcome"], description: "Completed, cancelled, no-show, or scheduled." },
      { key: "attendance_count", label: "Attendance count", required: false, aliases: ["attendees", "student count", "attendance"], description: "Number of students present for a group session." },
      { key: "exam_block_key", label: "Exam block", required: false, aliases: ["exam block", "block", "exam"], description: "Optional tutoring period key." },
      { key: "cohort_label", label: "Cohort", required: false, aliases: ["cohort", "graduating class", "class year"], description: "Defaults to the batch cohort when omitted." },
      { key: "campus", label: "Campus", required: false, aliases: ["campus", "location"], description: "Campus or approved reporting location." },
      { key: "reschedule_count", label: "Reschedule count", required: false, aliases: ["reschedules", "reschedule count", "number of reschedules"], description: "Number of times the session was rescheduled." },
      { key: "cancelled_at", label: "Cancelled at", required: false, aliases: ["cancelled at", "canceled at", "cancellation time"], description: "Cancellation timestamp when available." },
    ],
  },
  student_roster: {
    label: "Student and cohort roster",
    description: "Student metadata used to match institutional accounts and interpret session history over time.",
    fields: [
      { key: "student_external_id", label: "Student external ID", required: true, aliases: ["student id", "student email", "student_email", "email"], description: "Matched in a restricted identity vault, then stored as a one-way hash." },
      { key: "institutional_email", label: "Institutional email", required: false, aliases: ["roseman email", "school email", "institutional email"], description: "Optional match aid; discarded after identity resolution." },
      { key: "cohort_label", label: "Cohort", required: true, aliases: ["cohort", "graduating class", "class year"], description: "For example, Class of 2029." },
      { key: "expected_graduation_year", label: "Expected graduation year", required: true, aliases: ["graduation year", "grad year", "expected graduation"], description: "Four-digit expected graduation year." },
      { key: "program_start_date", label: "Program start date", required: false, aliases: ["start date", "matriculation date", "program start"], description: "Use a real date, preferably YYYY-MM-DD." },
      { key: "current_phase", label: "Current phase", required: false, aliases: ["phase", "academic phase"], description: "Foundations, clerkship, advanced, or another approved value." },
      { key: "current_year", label: "Current year", required: false, aliases: ["year", "academic year", "medical school year"], description: "M1, M2, M3, or M4." },
      { key: "campus", label: "Campus", required: false, aliases: ["campus", "location"], description: "Campus or approved reporting location." },
      { key: "active_status", label: "Enrollment status", required: false, aliases: ["status", "enrollment status", "active"], description: "Active, leave, withdrawn, graduated, or another approved value." },
    ],
  },
};

export type OacaImportMapping = Record<string, string | null>;

export function normalizeImportHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseCsvHeader(text: string) {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
  const headers: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index];
    if (character === '"' && quoted && firstLine[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { headers.push(value.trim()); value = ""; }
    else value += character;
  }
  headers.push(value.trim());
  return headers.filter(Boolean);
}

export function suggestImportMapping(dataset: OacaImportDataset, headers: string[]): OacaImportMapping {
  const normalized = headers.map((header) => ({ header, normalized: normalizeImportHeader(header) }));
  return Object.fromEntries(oacaImportDatasets[dataset].fields.map((field) => {
    const candidates = [field.key, field.label, ...field.aliases].map(normalizeImportHeader);
    const exact = normalized.find((item) => candidates.includes(item.normalized));
    return [field.key, exact?.header || null];
  }));
}

export function validateImportMapping(dataset: OacaImportDataset, mapping: OacaImportMapping) {
  const missing = oacaImportDatasets[dataset].fields.filter((field) => field.required && !mapping[field.key]).map((field) => field.key);
  if (dataset === "penji_sessions" && !mapping.session_end_at && !mapping.duration_minutes) missing.push("session_end_at_or_duration_minutes");
  const chosen = Object.values(mapping).filter(Boolean);
  const duplicateSourceColumns = [...new Set(chosen.filter((column, index) => chosen.indexOf(column) !== index))];
  return { valid: missing.length === 0 && duplicateSourceColumns.length === 0, missing, duplicateSourceColumns };
}

export const oacaImportMimeTypes = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function validateImportUpload(file: Pick<File, "name" | "size" | "type">, maximumBytes = 25 * 1024 * 1024) {
  const extension = file.name.toLowerCase().split(".").pop();
  if (!oacaImportMimeTypes.has(file.type) && !["csv", "xlsx"].includes(extension || "")) return "Use a CSV or XLSX file.";
  if (file.size < 1 || file.size > maximumBytes) return "Choose a file between 1 byte and 25 MB.";
  return null;
}

export type OacaMetricCell = { studentCount: number; value: number | null; suppressed?: boolean };

export function suppressOacaMetric(cell: OacaMetricCell, minimum = 10): OacaMetricCell {
  return cell.studentCount < minimum ? { ...cell, value: null, suppressed: true } : { ...cell, suppressed: false };
}
