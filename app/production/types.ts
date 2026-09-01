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
  principalType?: "creator" | "principal_investigator" | null;
  principalAcknowledged?: boolean;
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
  audience?: "student" | "advisor";
};

export type StudentDashboard = {
  nextSession: SessionSummary | null;
  attendanceHistory: SessionSummary[];
  surveyAssignments: SurveyAssignmentSummary[];
  portfolio: Array<{ id: string; title: string; documentType: string; sharedWithAdvisor: boolean; updatedAt: string }>;
  advisingPackets: Array<{ id: string; title: string; status: string; expiresAt: string | null }>;
};

export type StationId = "courses" | "evidence" | "service" | "cohort" | "reflection" | "application";

export type PathwayArtifact = {
  id: string;
  station: StationId;
  artifactType: string;
  title: string;
  content: {
    response?: string;
    prompt?: string;
    fields?: Record<string, string>;
  };
  createdAt: string;
  updatedAt: string;
};

export type AdvisingPacketDetail = {
  id: string;
  title: string;
  status: "active" | "revoked" | "expired" | "closed";
  advisorName: string;
  expiresAt: string | null;
  itemIds: string[];
  items: PathwayArtifact[];
  comments: Array<{ id: string; authorName: string; body: string; createdAt: string }>;
};

export type CohortPost = {
  id: string;
  authorName: string;
  body: string;
  participationMode: "question" | "resource" | "encouragement" | "reflection";
  parentId: string | null;
  createdAt: string;
};

export type EvaluationSummary = {
  instruments: Array<{
    instrumentSlug: string;
    instrumentName: string;
    submitted: number;
    scoreMean: number | null;
    scoreMin: number | null;
    scoreMax: number | null;
    audience: "student" | "advisor";
    smallSample: boolean;
  }>;
  submissions: Array<{
    userId: string;
    displayName: string;
    email: string;
    instrumentSlug: string;
    instrumentName: string;
    submittedAt: string;
    scores: Record<string, number>;
    audience: "student" | "advisor";
    waveLabel: string;
  }>;
  generatedAt: string;
};

export type AnalysisDepth = "descriptive" | "comparative" | "statistical";

export type AnalyticsConfiguration = {
  enabledDimensions: string[];
  sensitiveDimensions: string[];
  minimumGroupSize: number;
  smallSampleWarningBelow: number;
  enabledDepths: AnalysisDepth[];
  defaultDepth: AnalysisDepth;
  grantCheckpointsStatus: "disabled" | "pending_approval" | "enabled";
};

export type AnalyticsGroup = {
  key: string;
  label: string;
  count: number;
  suppressed: boolean;
  smallSample: boolean;
  mean: number | null;
  median: number | null;
  standardDeviation: number | null;
  interquartileRange: number | null;
  minimum: number | null;
  maximum: number | null;
};

export type AnalyticsInsight = {
  level: "information" | "attention" | "encouraging";
  title: string;
  body: string;
};

export type SurveyAnalytics = {
  audience: "student" | "advisor";
  instrumentSlug: string | null;
  instrumentName: string | null;
  depth: AnalysisDepth;
  dimension: string;
  submitted: number;
  assigned: number;
  completionPercent: number;
  groups: AnalyticsGroup[];
  pairedChange: {
    count: number;
    baselineMean: number | null;
    finalMean: number | null;
    meanChange: number | null;
    percentImproved: number | null;
    confidenceInterval: [number, number] | null;
    effectSize: number | null;
    pValue: number | null;
    adjustedPValue: number | null;
  } | null;
  attendanceAssociation: { count: number; spearmanRho: number | null; pValue: number | null; adjustedPValue: number | null } | null;
  insights: AnalyticsInsight[];
  itemResults: Array<{ itemKey: string; count: number; mean: number | null }>;
  availableInstruments: Array<{ slug: string; name: string; audience: "student" | "advisor" }>;
  availableDimensions: Array<{ key: string; label: string; enabled: boolean; sensitive: boolean }>;
  generatedAt: string;
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
  surveyCompletion: Array<{ instrumentSlug?: string; instrumentName: string; audience: "student" | "advisor"; assigned: number; submitted: number }>;
  pendingCurriculumReviews: number;
  attendanceCorrections: number;
};

export type UserAccessPerson = {
  userId: string;
  displayName: string;
  email: string;
  accountStatus: string;
  lastAuthSignInAt: string | null;
  emailConfirmedAt: string | null;
  lastInvitationSentAt: string | null;
  sessionCount: number;
  totalMinutes: number;
  roles: string[];
  principalType: "creator" | "principal_investigator" | null;
  deactivatedAt: string | null;
  purgeEligibleAt: string | null;
};

export type UserAccessSession = {
  userId: string;
  sessionId: string;
  displayName: string;
  email: string;
  signedInAt: string;
  lastActiveAt: string;
  signedOutAt: string | null;
  durationMinutes: number;
  status: "active" | "ended";
  role: string;
};

export type UserAccessLog = {
  students: UserAccessPerson[];
  people: UserAccessPerson[];
  sessions: UserAccessSession[];
  generatedAt: string;
};

export type PrincipalOverview = {
  principalType: "creator" | "principal_investigator" | null;
  acknowledged: boolean;
  creator: { userId: string; displayName: string; email: string } | null;
  principalInvestigator: { userId: string; displayName: string; email: string } | null;
  canInitiateDestructiveActions: boolean;
  canApproveGovernance: boolean;
};

export type GovernanceRequest = {
  id: string;
  requestType: "pilot_reset" | "account_purge" | "survey_publication" | "grant_checkpoints_activation";
  subjectId: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled" | "executed" | "expired";
  manifest: Record<string, number | string | boolean | null>;
  initiatedBy: string;
  approvedBy: string | null;
  expiresAt: string;
  createdAt: string;
};

export type QualitativeWorkspace = {
  responses: Array<{ responseSetId: string; participantId: string; itemKey: string; text: string; codes: string[] }>;
  codes: Array<{ id: string; label: string; description: string; color: string }>;
  suggestions: Array<{ id: string; label: string; keywords: string[]; responseCount: number; status: string; reviewedLabel: string | null }>;
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
  instructions?: string;
};
