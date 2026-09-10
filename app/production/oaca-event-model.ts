export const penjiEventHeaders = [
  "Name", "Next Start Date", "Next Start Time", "Start Date", "Start Time", "End Date", "End Time",
  "Tutor Email", "Tutor SSO ID", "Tutor Name", "Courses", "Location", "Location URL", "Student Capacity",
] as const;

export const penjiAttendanceHeaders = [
  "Unique ID", "Status", "Event Name", "Start At Date", "Start At Time", "End At Date", "End At Time",
  "Duration Minutes", "Student Email", "Student SSO ID", "Student ID", "Student Name", "Student Attendance",
  "Student Attendance Source", "Tutor Email", "Tutor SSO ID", "Tutor Name", "Recurrence", "Courses", "Location",
] as const;

export const ignoredPenjiAttendancePrefixes = ["Metadata - "] as const;
export type AttendanceStatus = "present" | "absent" | "not_recorded";

export type CsvRecord = Record<string, string>;

export type PenjiEventImportSummary = {
  eventRows: number;
  attendanceRows: number;
  occurrenceMatches: number;
  uniqueStudents: number;
  present: number;
  absent: number;
  notRecorded: number;
  safelyMergedBlankDuplicates: number;
  conflictingDuplicates: number;
  missingRequiredEventHeaders: string[];
  missingRequiredAttendanceHeaders: string[];
  ignoredMetadataColumns: string[];
};

export function parseCsv(source: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const headers = (rows.shift() || []).map((value) => value.replace(/^\uFEFF/, "").trim());
  return rows.filter((values) => values.some((value) => value.trim())).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ""])));
}

export function csvHeaders(source: string) {
  const firstLine = source.split(/\r?\n/, 1)[0] || "";
  return parseCsv(`${firstLine}\nvalue`).length ? Object.keys(parseCsv(`${firstLine}\nvalue`)[0]) : [];
}

export function normalizeEventName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function normalizeAttendance(value: string): AttendanceStatus {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (normalized === "present") return "present";
  if (normalized === "absent") return "absent";
  return "not_recorded";
}

export function normalizeCapacity(value: string): number | null {
  const capacity = Number.parseInt(value, 10);
  if (!Number.isFinite(capacity) || capacity < 1 || capacity === 9999) return null;
  return capacity;
}

export function penjiOccurrenceKey(name: string, date: string, time: string) {
  return `${normalizeEventName(name)}|${date.trim()}|${time.trim().slice(0, 5)}`;
}

export function expandWeeklyDates(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate || startDate}T12:00:00Z`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end < start) return [];
  const values: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 7)) values.push(cursor.toISOString().slice(0, 10));
  return values;
}

function missingHeaders(headers: string[], required: readonly string[]) {
  const found = new Set(headers.map((header) => header.trim()));
  return required.filter((header) => !found.has(header));
}

export function summarizePenjiEventFiles(eventsSource: string, attendanceSource: string): PenjiEventImportSummary {
  const events = parseCsv(eventsSource);
  const attendance = parseCsv(attendanceSource);
  const eventHeaders = events[0] ? Object.keys(events[0]) : csvHeaders(eventsSource);
  const attendanceHeaders = attendance[0] ? Object.keys(attendance[0]) : csvHeaders(attendanceSource);
  const occurrenceKeys = new Set<string>();
  for (const event of events) {
    const dates = expandWeeklyDates(event["Start Date"], event["End Date"] || event["Start Date"]);
    for (const date of dates.length ? dates : [event["Start Date"]]) occurrenceKeys.add(penjiOccurrenceKey(event.Name, date, event["Start Time"]));
  }
  const attendanceOccurrenceKeys = new Set(attendance.map((row) => penjiOccurrenceKey(row["Event Name"], row["Start At Date"], row["Start At Time"])));
  const students = new Set(attendance.map((row) => row["Student SSO ID"] || row["Student Email"].split("@")[0] || row["Student ID"]).filter(Boolean));
  const statuses = attendance.map((row) => normalizeAttendance(row["Student Attendance"]));
  const duplicateGroups = new Map<string, AttendanceStatus[]>();
  for (const row of attendance) {
    const identity = row["Student SSO ID"] || row["Student Email"].split("@")[0] || row["Student ID"];
    const key = `${penjiOccurrenceKey(row["Event Name"], row["Start At Date"], row["Start At Time"])}|${identity.toLocaleLowerCase("en-US")}`;
    duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), normalizeAttendance(row["Student Attendance"])]);
  }
  let safelyMergedBlankDuplicates = 0;
  let conflictingDuplicates = 0;
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    if (group.every((value) => value === "not_recorded")) safelyMergedBlankDuplicates += group.length - 1;
    else if (new Set(group).size > 1) conflictingDuplicates += group.length - 1;
  }
  const knownSso = new Set(attendance.map((row) => row["Student SSO ID"].toLocaleLowerCase("en-US")).filter(Boolean));
  safelyMergedBlankDuplicates += attendance.filter((row) => !row["Student SSO ID"] && normalizeAttendance(row["Student Attendance"]) === "not_recorded" && knownSso.has(row["Student Email"].split("@")[0].toLocaleLowerCase("en-US"))).length;
  return {
    eventRows: events.length,
    attendanceRows: attendance.length,
    occurrenceMatches: [...attendanceOccurrenceKeys].filter((key) => occurrenceKeys.has(key)).length,
    uniqueStudents: students.size,
    present: statuses.filter((status) => status === "present").length,
    absent: statuses.filter((status) => status === "absent").length,
    notRecorded: statuses.filter((status) => status === "not_recorded").length,
    safelyMergedBlankDuplicates,
    conflictingDuplicates,
    missingRequiredEventHeaders: missingHeaders(eventHeaders, penjiEventHeaders),
    missingRequiredAttendanceHeaders: missingHeaders(attendanceHeaders, penjiAttendanceHeaders),
    ignoredMetadataColumns: attendanceHeaders.filter((header) => ignoredPenjiAttendancePrefixes.some((prefix) => header.startsWith(prefix))),
  };
}

export function eventBucket(startsAt: string, now = new Date()) {
  const start = new Date(startsAt);
  const startDay = start.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  if (startDay === today) return "today" as const;
  return start > now ? "upcoming" as const : "past" as const;
}

export function notificationChannels(values: { email: boolean; push: boolean; sms: boolean }) {
  return ["in_app", ...(values.email ? ["email"] : []), ...(values.push ? ["push"] : []), ...(values.sms ? ["sms"] : [])];
}

export function zonedLocalIso(date: string, time: string, timeZone = "America/Los_Angeles") {
  const [year,month,day]=date.split("-").map(Number); const [hour,minute]=time.split(":").map(Number);
  if (![year,month,day,hour,minute].every(Number.isFinite)) throw new Error("Invalid local date or time.");
  const desired=Date.UTC(year,month-1,day,hour,minute,0); let candidate=desired;
  const formatter=new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
  for(let attempt=0;attempt<3;attempt+=1){const values=Object.fromEntries(formatter.formatToParts(new Date(candidate)).filter((part)=>part.type!=="literal").map((part)=>[part.type,part.value])); const represented=Date.UTC(Number(values.year),Number(values.month)-1,Number(values.day),Number(values.hour),Number(values.minute),Number(values.second)); candidate+=desired-represented;}
  return new Date(candidate).toISOString();
}

export function normalizePenjiEventExports(eventsSource: string, attendanceSource: string) {
  const events=parseCsv(eventsSource).map((row)=>({
    title:row.Name,
    description:"",
    startsAt:zonedLocalIso(row["Start Date"],row["Start Time"]),
    endsAt:zonedLocalIso(row["Start Date"],row["End Time"]),
    seriesEndsOn:row["End Date"]||row["Start Date"],
    modality:/teams/i.test(`${row.Location} ${row["Location URL"]}`)?"teams":"in_person",
    location:row.Location,
    capacity:normalizeCapacity(row["Student Capacity"]),
  }));
  const attendance=parseCsv(attendanceSource).map((row)=>({
    sourceLogId:row["Unique ID"],eventName:row["Event Name"],startsAt:zonedLocalIso(row["Start At Date"],row["Start At Time"]),
    studentSso:row["Student SSO ID"],studentEmail:row["Student Email"],studentId:row["Student ID"],attendance:normalizeAttendance(row["Student Attendance"]),
  }));
  return { events,attendance,summary:summarizePenjiEventFiles(eventsSource,attendanceSource) };
}
