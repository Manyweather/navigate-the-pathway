import type { PilotRole } from "./catalog";

export type SurveyAssignmentStatus = "not_available" | "not_started" | "in_progress" | "submitted" | "closed";

export type AuthorizationContext = {
  userId: string;
  displayName: string;
  email: string;
  roles: PilotRole[];
  activeOrganizationId: string | null;
  activeProgramId: string | null;
  activeCohortId: string | null;
  capabilities: string[];
  aal: "aal1" | "aal2";
  environment: "staging" | "production";
};

export type SessionSummary = {
  id: string;
  title: string;
  topic: string;
  startsAt: string;
  endsAt: string;
  format: "virtual" | "in_person";
  attendanceStatus: "not_recorded" | "present" | "absent" | "excused";
  checkInAvailable: boolean;
};

export type SurveyAssignmentSummary = {
  id: string;
  instrumentSlug: string;
  instrumentName: string;
  itemCount: number;
  openResponseCount: number;
  waveLabel: string;
  required: boolean;
  opensAt: string | null;
  closesAt: string | null;
  status: SurveyAssignmentStatus;
  submittedAt: string | null;
};

export type StudentDashboard = {
  nextSession: SessionSummary | null;
  attendanceHistory: SessionSummary[];
  surveyAssignments: SurveyAssignmentSummary[];
  portfolio: Array<{ id: string; title: string; documentType: string; sharedWithAdvisor: boolean; updatedAt: string }>;
  advisingPackets: Array<{ id: string; title: string; status: string; expiresAt: string | null }>;
};

export type AdvisorStudentSummary = {
  id: string;
  displayName: string;
  cohortName: string;
  attendance: { present: number; expected: number };
  surveyCompletion: Array<{ instrumentName: string; status: SurveyAssignmentStatus; submittedAt: string | null }>;
  sharedPacketCount: number;
};

export type AdvisorDashboard = {
  assignedStudents: AdvisorStudentSummary[];
  mySurveys: SurveyAssignmentSummary[];
};

export type AdminDashboard = {
  counts: { invitedUsers: number; activeUsers: number; cohorts: number; sessions: number };
  surveyCompletion: Array<{ instrumentName: string; assigned: number; submitted: number }>;
  pendingCurriculumReviews: number;
  attendanceCorrections: number;
};

export type PilotDashboard = StudentDashboard | AdvisorDashboard | AdminDashboard;

export type SurveyItem = {
  id: string;
  position: number;
  prompt: string;
  responseType: "single_choice" | "text";
  required: boolean;
  options: Array<{ id: string; label: string; value: string; position: number }>;
};

export type SurveyAssignmentDetail = SurveyAssignmentSummary & {
  consentVersionId: string;
  consentTitle: string;
  consentBody: string;
  instrumentVersion: string;
  items: SurveyItem[];
  draft: Record<string, string>;
  lastSavedAt: string | null;
};

