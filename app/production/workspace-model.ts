/** Shared validation; authorization remains in the database. */
export const rosterColumns = [
  "name",
  "primary_email",
  "secondary_email",
  "role",
  "program",
  "cohort",
  "advisor_email",
] as const;
export type RosterRow = Record<(typeof rosterColumns)[number], string>;
export type RosterPreviewRow = {
  row: number;
  values: RosterRow;
  errors: string[];
  status?: string;
  userId?: string;
};
export const workspacePages = [
  "home",
  "sessions",
  "map",
  "vault",
  "portfolio",
  "cohort",
  "advising",
  "students",
  "survey",
  "people",
  "surveys",
  "configuration",
  "creator",
  "appointments",
  "messages",
  "support",
  "calendars",
  "notifications",
  "analytics",
  "access",
  "roster",
  "courses",
  "evidence",
  "service",
  "reflection",
  "application",
] as const;
export type WorkspacePage = (typeof workspacePages)[number];
export type Appointment = {
  id: string;
  title: string;
  requester_id: string;
  recipient_id: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  version: number;
  proposal: null | {
    starts_at: string;
    ends_at: string;
    timezone: string;
    requested_by: string;
  };
  conversation_id?: string;
  other_name?: string;
};
export type DirectoryPerson = { id: string; name: string; roles: string[] };
export type Conversation = {
  id: string;
  kind: "appointment" | "dm";
  title: string;
  readonly: boolean;
  unread: number;
};
export type ChatMessage = {
  id: string;
  body: string;
  author_id: string;
  author_name: string;
  created_at: string;
};
export type SupportReview = {
  id: string;
  student_id: string;
  student_name: string;
  source_id: string;
  area: string;
  evidence: string;
  action: string;
  status: "draft" | "reviewed" | "in_progress" | "completed";
  shared_with_student: boolean;
  follow_up_on: string | null;
  updated_at: string;
};
export type SupportSource = {
  id: string;
  student_id: string;
  student_name: string;
  packet_title?: string | null;
  goals: string;
  barriers: string;
  deadlines: string;
  expires_at: string | null;
  revoked_at: string | null;
};
export type SupportSuggestion = {
  sourceIds: string[];
  area: string;
  rationale: string;
  proposedAction: string;
};
export interface SupportGenerator {
  generate(sources: SupportSource[]): Promise<SupportSuggestion[]>;
}
export const supportGeneration = {
  enabled: false,
  status: "Not configured",
} as const;
export const appointmentEmail = {
  enabled: false,
  status: "Not configured",
} as const;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!quoted && cell) throw new Error("Unexpected quote in CSV.");
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed quoted cell in CSV.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function csvText(rows: string[][]): string {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            const safe = /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
            return '"' + safe.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}

export function validateRoster(rows: unknown): RosterPreviewRow[] {
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000)
    throw new Error("Provide between 1 and 1,000 roster rows.");
  const seen = new Set<string>();
  return rows.map((input, index) => {
    const values = Object.fromEntries(
      rosterColumns.map((key) => [key, String(input?.[key] ?? "").trim()]),
    ) as RosterRow;
    for (const key of [
      "primary_email",
      "secondary_email",
      "advisor_email",
    ] as const)
      values[key] = values[key].toLowerCase();
    values.role = values.role.toLowerCase();
    const errors: string[] = [];
    if (!values.name || values.name.length > 160)
      errors.push("Name is required (up to 160 characters).");
    if (!["student", "advisor"].includes(values.role))
      errors.push("Role must be student or advisor.");
    if (!values.program) errors.push("Program is required.");
    for (const key of [
      "primary_email",
      "secondary_email",
      "advisor_email",
    ] as const)
      if (
        (key === "primary_email" || values[key]) &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[key])
      )
        errors.push(`Invalid ${key.replaceAll("_", " ")}.`);
    if (values.primary_email === values.secondary_email)
      errors.push("Secondary email must differ from primary.");
    if (
      Object.values(values).some(
        (value) => value.length > 320 || /^[=+\-@]/.test(value),
      )
    )
      errors.push("Oversized or formula-like cells are not supported.");
    for (const email of [values.primary_email, values.secondary_email].filter(
      Boolean,
    )) {
      if (seen.has(email)) errors.push("Email appears in more than one row.");
      seen.add(email);
    }
    return { row: index + 2, values, errors };
  });
}

export function rosterFromGrid(grid: string[][]): RosterRow[] {
  const headings = (grid[0] || []).map((value) => value.trim().toLowerCase());
  if (rosterColumns.some((key) => !headings.includes(key)))
    throw new Error(
      "Use the downloadable roster template and keep all column headings.",
    );
  return grid
    .slice(1)
    .filter((row) => row.some(Boolean))
    .map(
      (row) =>
        Object.fromEntries(
          rosterColumns.map((key) => [key, row[headings.indexOf(key)] || ""]),
        ) as RosterRow,
    );
}

export function localTimeToUtc(value: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Choose a complete date and time.");
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const naive = Date.parse(value + ":00Z");
  const matches: number[] = [];
  // Checking candidate offsets also detects ambiguous and nonexistent DST times.
  for (let minutes = -14 * 60; minutes <= 14 * 60; minutes += 15) {
    const candidate = naive + minutes * 60_000;
    if (formatter.format(candidate).replace(" ", "T") === value)
      matches.push(candidate);
  }
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? "This time occurs twice during the clock change. Choose an unambiguous time."
        : "This local time does not exist. Choose another time.",
    );
  return new Date(matches[0]).toISOString();
}

export function calendarFile(event: {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status?: string;
  version?: number;
}): string {
  const escape = (s: string) =>
    s
      .replaceAll("\\", "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;");
  const stamp = (s: string) =>
    new Date(s)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Navigate the Pathway//Scheduling//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@navigate-pathway`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(event.starts_at)}`,
    `DTEND:${stamp(event.ends_at)}`,
    `SEQUENCE:${event.version || 0}`,
    `SUMMARY:${escape(event.title)}`,
    `STATUS:${event.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
