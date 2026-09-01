import type { CurriculumProgramId } from "./curriculum-data";

export type AttendanceStatus = "not_recorded" | "present" | "absent" | "excused";
export type SessionFormat = "virtual" | "in_person";

export type ProgramSession = {
  id: string;
  title: string;
  topic: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  format: SessionFormat;
  semester: string;
  academicYear: string;
  checkInOpensAt: string;
  checkInClosesAt: string;
  status: "active" | "archived";
  officialSchedule: false;
};

export type AttendanceRecord = {
  id: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  recordedAt: string;
  source: "student_check_in" | "administrator";
  administrativeNote: string;
};

export type AttendanceChange = {
  id: string;
  attendanceRecordId: string;
  changedBy: string;
  previousStatus: AttendanceStatus;
  newStatus: AttendanceStatus;
  changedAt: string;
  reason: string;
};

export type AbsenceNotification = {
  id: string;
  sessionId: string;
  studentId: string;
  createdAt: string;
  note: string;
  status: "notified";
};

export type SurveyInstrument = {
  id: string;
  name: string;
  version: string;
  sourceReference: string;
  permissionStatus: "not_approved" | "approved";
  responseScale: string;
  waveEligibility: Array<"pre" | "post">;
};

export type SurveyWave = {
  id: "pre" | "post";
  label: string;
  opensAt: string | null;
  closesAt: string | null;
  status: "not_available" | "available" | "closed";
  instrumentIds: string[];
  instructions: string;
  completionRequirements: string;
};

export type SurveyResponseSet = {
  id: string;
  studentId: string;
  waveId: "pre" | "post";
  instrumentVersionIds: string[];
  status: "not_started" | "in_progress" | "complete";
  completedPlaceholderSteps: string[];
  startedAt: string | null;
  submittedAt: string | null;
};

export type PortfolioDocumentType = "Resume" | "CV" | "Activity list" | "Course list" | "Reflection" | "Personal statement draft" | "Advising document" | "Hour record" | "Research summary" | "Other";
export type PortfolioDestination = "Courses" | "Experiences" | "Reflection and Values" | "Cohort or Support Network" | "Your Story" | "Application";

export type PortfolioDocument = {
  id: string;
  title: string;
  documentType: PortfolioDocumentType;
  documentDate: string;
  description: string;
  addedAt: string;
  sourceProvenance: "local_preview_only" | "fictional_seed";
  originalBytesStored: false;
  revisionHistory: Array<{ id: string; title: string; revisedAt: string }>;
  proposedDestinations: PortfolioDestination[];
  confirmedDestinations: PortfolioDestination[];
  shareWithAdvisor: boolean;
  sharingExpiresAt: string | null;
};

export type PilotState = {
  demoStudentId: "fictional-current-student";
  attendance: {
    sessions: ProgramSession[];
    records: AttendanceRecord[];
    changeLog: AttendanceChange[];
    notifications: AbsenceNotification[];
    participationWarningThreshold: number;
  };
  surveys: {
    instruments: SurveyInstrument[];
    waves: SurveyWave[];
    responseSets: SurveyResponseSet[];
  };
  courses: {
    selectedReference: CurriculumProgramId | "undecided" | "another_major" | "not_sure";
    compareThroughTermId: string;
    dataNoteStatuses: Record<string, "needs_review" | "confirmed" | "rejected">;
  };
  portfolioDocuments: PortfolioDocument[];
};

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000).toISOString();

export function createDefaultPilotState(now = new Date()): PilotState {
  const activeStart = addMinutes(now, 15);
  const activeEnd = addMinutes(now, 75);
  const nextStart = addMinutes(now, 7 * 24 * 60);
  const nextEnd = addMinutes(now, 7 * 24 * 60 + 60);
  return {
    demoStudentId: "fictional-current-student",
    attendance: {
      sessions: [
        { id: "fictional-session-checkin", title: "Fictional check-in practice", topic: "Official session topic pending", startsAt: activeStart, endsAt: activeEnd, timeZone: "America/New_York", format: "virtual", semester: "Fictional fall term", academicYear: "2026-2027", checkInOpensAt: addMinutes(now, -15), checkInClosesAt: addMinutes(now, 30), status: "active", officialSchedule: false },
        { id: "fictional-session-next", title: "Fictional in-person session", topic: "Official session topic pending", startsAt: nextStart, endsAt: nextEnd, timeZone: "America/New_York", format: "in_person", semester: "Fictional fall term", academicYear: "2026-2027", checkInOpensAt: addMinutes(now, 7 * 24 * 60 - 30), checkInClosesAt: addMinutes(now, 7 * 24 * 60 + 20), status: "active", officialSchedule: false },
      ],
      records: [],
      changeLog: [],
      notifications: [],
      participationWarningThreshold: 80,
    },
    surveys: {
      instruments: [
        ["self-assessment", "Your Pre-Health Application Profile: A Self-Assessment"],
        ["grit", "Short Grit Survey"],
        ["identity", "MacLeod Clark Professional Identity Scale"],
        ["resilience", "Brief Resilience Scale"],
      ].map(([id, name]): SurveyInstrument => ({ id, name, version: "Version pending", sourceReference: "Approved protected source required", permissionStatus: "not_approved", responseScale: "Pending confirmation", waveEligibility: ["pre", "post"] })),
      waves: [
        { id: "pre", label: "Fictional open wave", opensAt: null, closesAt: null, status: "available", instrumentIds: ["self-assessment", "grit", "identity", "resilience"], instructions: "Interface demonstration only. Approved survey items are not loaded.", completionRequirements: "Completion rules pending protocol approval." },
        { id: "post", label: "Fictional future wave", opensAt: null, closesAt: null, status: "not_available", instrumentIds: ["self-assessment", "grit", "identity", "resilience"], instructions: "The administrator sets every wave and date. No pre or post schedule is hardcoded.", completionRequirements: "Completion rules pending protocol approval." },
      ],
      responseSets: [],
    },
    courses: { selectedReference: "not_sure", compareThroughTermId: "", dataNoteStatuses: {} },
    portfolioDocuments: [
      { id: "fictional-portfolio-resume", title: "Fictional experience summary", documentType: "Resume", documentDate: "2026-08-01", description: "Demonstrates a student-controlled Portfolio item without storing a real file.", addedAt: now.toISOString(), sourceProvenance: "fictional_seed", originalBytesStored: false, revisionHistory: [], proposedDestinations: ["Experiences"], confirmedDestinations: [], shareWithAdvisor: false, sharingExpiresAt: null },
    ],
  };
}

export function isCheckInOpen(session: ProgramSession, now = new Date()) {
  const timestamp = now.getTime();
  return session.status === "active" && timestamp >= new Date(session.checkInOpensAt).getTime() && timestamp <= new Date(session.checkInClosesAt).getTime();
}

export function recordStudentCheckIn(state: PilotState, sessionId: string, now = new Date()) {
  const session = state.attendance.sessions.find((item) => item.id === sessionId);
  if (!session || !isCheckInOpen(session, now)) return { state, outcome: "window_closed" as const };
  if (state.attendance.records.some((item) => item.sessionId === sessionId && item.studentId === state.demoStudentId)) return { state, outcome: "duplicate" as const };
  const record: AttendanceRecord = { id: `attendance-${now.getTime()}`, sessionId, studentId: state.demoStudentId, status: "present", recordedAt: now.toISOString(), source: "student_check_in", administrativeNote: "" };
  return { state: { ...state, attendance: { ...state.attendance, records: [...state.attendance.records, record] } }, outcome: "recorded" as const };
}

export function correctAttendance(state: PilotState, recordId: string, newStatus: AttendanceStatus, changedBy: string, reason: string, now = new Date()) {
  const existing = state.attendance.records.find((item) => item.id === recordId);
  if (!existing) return state;
  const change: AttendanceChange = { id: `attendance-change-${now.getTime()}`, attendanceRecordId: recordId, changedBy, previousStatus: existing.status, newStatus, changedAt: now.toISOString(), reason };
  return { ...state, attendance: { ...state.attendance, records: state.attendance.records.map((item) => item.id === recordId ? { ...item, status: newStatus, source: "administrator", administrativeNote: reason } : item), changeLog: [...state.attendance.changeLog, change] } };
}

export function attendanceSummary(state: PilotState, studentId = state.demoStudentId, now = new Date()) {
  const expectedSessions = state.attendance.sessions.filter((session) => session.status === "active" && new Date(session.startsAt).getTime() <= now.getTime());
  const records = state.attendance.records.filter((record) => record.studentId === studentId && expectedSessions.some((session) => session.id === record.sessionId));
  const attended = records.filter((record) => record.status === "present").length;
  const percentage = expectedSessions.length ? Math.round((attended / expectedSessions.length) * 100) : 0;
  const virtualUnexcusedAbsences = records.filter((record) => record.status === "absent" && state.attendance.sessions.find((session) => session.id === record.sessionId)?.format === "virtual").length;
  return { attended, expected: expectedSessions.length, percentage, virtualUnexcusedAbsences, warning: expectedSessions.length > 0 && percentage < state.attendance.participationWarningThreshold };
}

export function isSurveyWaveAvailable(wave: SurveyWave, now = new Date()) {
  if (wave.status !== "available") return false;
  const timestamp = now.getTime();
  if (wave.opensAt && timestamp < new Date(wave.opensAt).getTime()) return false;
  if (wave.closesAt && timestamp > new Date(wave.closesAt).getTime()) return false;
  return true;
}

export function upsertSurveyResponseSet(state: PilotState, waveId: "pre" | "post", completedPlaceholderSteps: string[], submit = false, now = new Date()) {
  const wave = state.surveys.waves.find((item) => item.id === waveId);
  if (!wave || !isSurveyWaveAvailable(wave, now)) return state;
  const existing = state.surveys.responseSets.find((item) => item.studentId === state.demoStudentId && item.waveId === waveId);
  const responseSet: SurveyResponseSet = {
    id: existing?.id ?? `survey-${waveId}-${now.getTime()}`,
    studentId: state.demoStudentId,
    waveId,
    instrumentVersionIds: wave.instrumentIds.map((id) => `${id}:version-pending`),
    status: submit ? "complete" : "in_progress",
    completedPlaceholderSteps,
    startedAt: existing?.startedAt ?? now.toISOString(),
    submittedAt: submit ? now.toISOString() : null,
  };
  return { ...state, surveys: { ...state.surveys, responseSets: [...state.surveys.responseSets.filter((item) => item.id !== responseSet.id), responseSet] } };
}

export const acceptedPortfolioTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "application/rtf"];
export const portfolioSizeLimitBytes = 10 * 1024 * 1024;

export function validatePortfolioFile(file: { type: string; size: number }) {
  if (!acceptedPortfolioTypes.includes(file.type)) return "Use a PDF, DOCX, TXT, or RTF file.";
  if (file.size > portfolioSizeLimitBytes) return "Choose a file smaller than 10 MB.";
  return null;
}

export function advisorVisiblePortfolio(documents: PortfolioDocument[], packetActive: boolean, now = new Date()) {
  if (!packetActive) return [];
  return documents.filter((item) => item.shareWithAdvisor && (!item.sharingExpiresAt || new Date(item.sharingExpiresAt).getTime() > now.getTime()));
}

export type AdvisorPilotDemo = {
  attendance: { attended: number; expected: number; percentage: number };
  surveyStatus: { pre: string; post: string };
  referenceProgram: string;
  courseSnapshot: Array<{ course: string; status: string; question: string; source: "student_reported" | "published_curriculum" | "advisor_confirmed" }>;
  sharedDocuments: Array<{ title: string; type: string }>;
  packetHistory: string[];
};

export const advisorPilotDemoByStudent: Record<string, AdvisorPilotDemo> = {
  "student-jordan-lee": { attendance: { attended: 6, expected: 7, percentage: 86 }, surveyStatus: { pre: "Submitted", post: "Not available" }, referenceProgram: "Biology, B.S. reference", courseSnapshot: [{ course: "CH 241 Organic Chemistry I and Lab", status: "Reported planned", question: "What timing tradeoffs should I discuss?", source: "student_reported" }], sharedDocuments: [{ title: "Fictional experience summary", type: "Resume" }], packetHistory: ["Limited share opened", "Course question added"] },
  "student-maya-bennett": { attendance: { attended: 5, expected: 6, percentage: 83 }, surveyStatus: { pre: "In progress", post: "Not available" }, referenceProgram: "Chemistry, B.S. reference", courseSnapshot: [{ course: "CS 215", status: "Needs student confirmation", question: "Which published placement applies?", source: "published_curriculum" }], sharedDocuments: [], packetHistory: ["Limited share opened"] },
  "student-theo-morgan": { attendance: { attended: 0, expected: 0, percentage: 0 }, surveyStatus: { pre: "Hidden", post: "Hidden" }, referenceProgram: "Not visible", courseSnapshot: [], sharedDocuments: [], packetHistory: [] },
  "student-alex-rivera": { attendance: { attended: 0, expected: 0, percentage: 0 }, surveyStatus: { pre: "Hidden", post: "Hidden" }, referenceProgram: "Not visible", courseSnapshot: [], sharedDocuments: [], packetHistory: [] },
};
