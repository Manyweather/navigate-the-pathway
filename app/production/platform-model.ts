export type ExperienceKey = "pathway" | "oaca" | "genesis";
export type WorkspaceKey = "compass" | "pathway" | "impact";

export type ExperienceRole =
  | "student"
  | "advisor"
  | "faculty"
  | "staff"
  | "administrator"
  | "creator"
  | "principal_investigator"
  | "mentor"
  | "community_liaison";

export type ExperienceMembership = {
  experienceKey: ExperienceKey;
  experienceName: string;
  roles: ExperienceRole[];
  capabilities: string[];
  status: "active" | "invited" | "suspended" | "archived";
  featureEnabled: boolean;
  launchState?: "active" | "read_only" | "pending";
};

export const experiences: Record<ExperienceKey, {
  name: string;
  shortName: string;
  href: string;
  description: string;
  accent: "pathway" | "oaca" | "genesis";
}> = {
  pathway: {
    name: "Navigate the Pathway",
    shortName: "Pathway",
    href: "/app/pathway",
    description: "Build and document a thoughtful path toward medical school.",
    accent: "pathway",
  },
  oaca: {
    name: "Compass",
    shortName: "Compass",
    href: "/app/compass",
    description: "Schedule advising and tutoring, prepare for visits, and follow through on your goals.",
    accent: "oaca",
  },
  genesis: {
    name: "Impact Workspace",
    shortName: "Impact",
    href: "/app/compass/impact",
    description: "Develop a grounded, sustainable community initiative with coaching and a clear handoff.",
    accent: "genesis",
  },
};

export const workspaceToExperience: Record<WorkspaceKey, ExperienceKey> = {
  compass: "oaca",
  pathway: "pathway",
  impact: "genesis",
};

export const experienceToWorkspace: Record<ExperienceKey, WorkspaceKey> = {
  oaca: "compass",
  pathway: "pathway",
  genesis: "impact",
};

export function authorizedWorkspaceKeys(memberships: ExperienceMembership[]) {
  return memberships
    .filter((membership) => membership.status === "active" && membership.featureEnabled)
    .map((membership) => experienceToWorkspace[membership.experienceKey]);
}

export function defaultWorkspaceFor(memberships: ExperienceMembership[], preferred?: WorkspaceKey | null): WorkspaceKey | null {
  const authorized = authorizedWorkspaceKeys(memberships);
  const impactStudent = memberships.some((membership) => membership.experienceKey === "genesis" && membership.status === "active" && membership.featureEnabled && membership.roles.includes("student"));
  if (impactStudent && authorized.includes("impact")) return "impact";
  if (preferred && authorized.includes(preferred)) return preferred;
  if (authorized.includes("compass")) return "compass";
  if (authorized.length === 1) return authorized[0];
  if (authorized.includes("impact")) return "impact";
  return authorized[0] || null;
}

export const staffMfaRoles = new Set<ExperienceRole>([
  "advisor",
  "faculty",
  "staff",
  "administrator",
  "creator",
  "principal_investigator",
  "mentor",
  "community_liaison",
]);

export const oacaServiceLines = [
  {
    key: "academic_advising",
    name: "Academic advising",
    description: "Meet with your assigned academic advisor or request an academic drop-in.",
    providerRule: "assigned" as const,
    formats: ["individual"] as const,
  },
  {
    key: "career_advising",
    name: "Career advising",
    description: "Request time with OACA career advising.",
    providerRule: "choice_or_first" as const,
    formats: ["individual"] as const,
  },
  {
    key: "peer_tutoring",
    name: "Peer tutoring",
    description: "Choose a subject, tutor, and tutoring format.",
    providerRule: "choice" as const,
    formats: ["individual", "small_group", "drop_in"] as const,
  },
] as const;

export type OacaPolicyDocument = {
  key: string;
  title: string;
  versionLabel: string;
  effectiveDate: string | null;
  lastUpdatedOn: string | null;
  audience: "student" | "peer_tutor" | "student_and_peer_tutor";
  requiresAcknowledgment: boolean;
};

export const oacaPolicyDocuments: OacaPolicyDocument[] = [
  {
    key: "foundational_academic_advising_2026",
    title: "Foundational Phase Academic Advising Policy",
    versionLabel: "2026",
    effectiveDate: null,
    lastUpdatedOn: null,
    audience: "student",
    requiresAcknowledgment: false,
  },
  {
    key: "clerkship_advanced_academic_advising_2026",
    title: "Clerkship & Advanced Phase Academic Advising Policy",
    versionLabel: "2026",
    effectiveDate: null,
    lastUpdatedOn: null,
    audience: "student",
    requiresAcknowledgment: false,
  },
  {
    key: "career_advising_2026",
    title: "Career Advising Policy",
    versionLabel: "2026",
    effectiveDate: null,
    lastUpdatedOn: null,
    audience: "student",
    requiresAcknowledgment: false,
  },
  {
    key: "peer_tutor_handbook_2026_2027",
    title: "Peer Tutor Policy Handbook & Agreement",
    versionLabel: "2026-2027",
    effectiveDate: "2026-04-06",
    lastUpdatedOn: "2026-05-18",
    audience: "peer_tutor",
    requiresAcknowledgment: true,
  },
  {
    key: "peer_tutoring_student_agreement_2026_2027",
    title: "Peer Tutoring Services Student Acknowledgement & Agreement",
    versionLabel: "2026-2027",
    effectiveDate: null,
    lastUpdatedOn: null,
    audience: "student",
    requiresAcknowledgment: true,
  },
];

export type OacaMilestone = {
  key: string;
  serviceKey: "academic_advising" | "career_advising";
  phase: "foundations" | "clerkship" | "advanced" | "all";
  year: number | null;
  title: string;
  summary: string;
  timing: string;
  requiredProvider: "assigned_advisor" | "oaca_director" | "associate_director" | "specialty_advisor";
  required: boolean;
};

export const oacaAdvisingMilestones: OacaMilestone[] = [
  { key: "foundations_year_1_check_in", serviceKey: "academic_advising", phase: "foundations", year: 1, title: "Foundations 1 check-in", summary: "Meet with your assigned Academic Advisor.", timing: "Within the first 4 weeks", requiredProvider: "assigned_advisor", required: true },
  { key: "foundations_year_2_check_in", serviceKey: "academic_advising", phase: "foundations", year: 2, title: "Foundations 3 check-in", summary: "Meet with your assigned Academic Advisor at least once.", timing: "By the conclusion of Foundations 3", requiredProvider: "assigned_advisor", required: true },
  { key: "exam_below_70_advisor", serviceKey: "academic_advising", phase: "foundations", year: null, title: "Exam score below 70", summary: "Meet with your Academic Advisor; if the course remains in progress, meet before the next scheduled examination.", timing: "Before the next exam when the course is in progress", requiredProvider: "assigned_advisor", required: true },
  { key: "exam_below_70_director", serviceKey: "academic_advising", phase: "foundations", year: null, title: "Exam score below 70 - director visit", summary: "Meet with the Director of Academic and Career Advising unless the course was ultimately passed.", timing: "Promptly after the examination result", requiredProvider: "oaca_director", required: true },
  { key: "exam_borderline_70_72", serviceKey: "academic_advising", phase: "foundations", year: null, title: "Borderline exam score", summary: "A score from 70% through 72% requires a meeting with your Academic Advisor.", timing: "Before the course concludes", requiredProvider: "assigned_advisor", required: true },
  { key: "two_consecutive_cba_reassessments", serviceKey: "academic_advising", phase: "foundations", year: null, title: "Two consecutive CBA reassessments", summary: "Meet with your Academic Advisor when two consecutive CBAs in the same course require reassessment.", timing: "After the second consecutive reassessment", requiredProvider: "assigned_advisor", required: true },
  { key: "failed_course_director", serviceKey: "academic_advising", phase: "foundations", year: null, title: "Failed course - director visit", summary: "Meet with the Director of Academic and Career Advising.", timing: "After the course outcome", requiredProvider: "oaca_director", required: true },
  { key: "failed_course_advisor", serviceKey: "academic_advising", phase: "foundations", year: null, title: "Failed course - remediation advising", summary: "Meet with your Academic Advisor at the beginning of the next course and monthly until remediation is complete.", timing: "Beginning of next course, then monthly", requiredProvider: "assigned_advisor", required: true },
  { key: "first_clerkship_check_in", serviceKey: "academic_advising", phase: "clerkship", year: null, title: "First clerkship check-in", summary: "Meet with your Academic Advisor.", timing: "Before the end of your first clinical clerkship", requiredProvider: "assigned_advisor", required: true },
  { key: "below_shelf_threshold", serviceKey: "academic_advising", phase: "clerkship", year: null, title: "Below shelf threshold", summary: "Meet with the Director of Academic and Career Advising.", timing: "Before reassessment", requiredProvider: "oaca_director", required: true },
  { key: "step_1_planning", serviceKey: "academic_advising", phase: "clerkship", year: null, title: "Step 1 planning", summary: "Complete an end-of-clerkship Step 1 planning meeting with your Academic Advisor.", timing: "By your final clerkship", requiredProvider: "assigned_advisor", required: true },
  { key: "step_2_planning", serviceKey: "academic_advising", phase: "advanced", year: null, title: "Step 2 planning", summary: "Meet with your Academic Advisor during the Advanced Phase.", timing: "Before registering for Step 2", requiredProvider: "assigned_advisor", required: true },
  { key: "residency_readiness", serviceKey: "academic_advising", phase: "advanced", year: 4, title: "Residency readiness", summary: "Complete residency readiness advising with your Academic Advisor.", timing: "By the start of your final year", requiredProvider: "assigned_advisor", required: true },
  { key: "clerkship_director_referral", serviceKey: "academic_advising", phase: "clerkship", year: null, title: "Clerkship Director referral", summary: "Meet with your Academic Advisor after a Clerkship Director referral.", timing: "Within 10 business days", requiredProvider: "assigned_advisor", required: true },
  { key: "repeat_clerkship", serviceKey: "academic_advising", phase: "clerkship", year: null, title: "Repeating a clerkship", summary: "Meet with the Director of Academic and Career Advising.", timing: "Before starting the repeat clerkship", requiredProvider: "oaca_director", required: true },
  { key: "career_year_1", serviceKey: "career_advising", phase: "foundations", year: 1, title: "Understand yourself", summary: "Complete the CIM activity and attend the presentation and working sessions.", timing: "Year 1", requiredProvider: "associate_director", required: true },
  { key: "career_year_2", serviceKey: "career_advising", phase: "foundations", year: 2, title: "Explore options", summary: "Meet with the Associate Director at least once, complete the CIM activity, and attend the presentation and working sessions.", timing: "Year 2", requiredProvider: "associate_director", required: true },
  { key: "career_year_3", serviceKey: "career_advising", phase: "clerkship", year: 3, title: "Choose your specialty", summary: "Complete the CIM activity and attend the presentation and working sessions.", timing: "Year 3", requiredProvider: "associate_director", required: true },
  { key: "career_year_4", serviceKey: "career_advising", phase: "advanced", year: 4, title: "Prepare for residency", summary: "Complete ERAS and NRMP preparation, the CIM activity, and the presentation and working sessions.", timing: "Year 4", requiredProvider: "associate_director", required: true },
];

export const oacaTutoringPolicy = {
  studentWeeklyMinutes: 120,
  individualSessionMinutes: 60,
  individualSuggestedMinutes: [45, 60] as const,
  examBlockMinutes: 240,
  reviewAfterSessions: 3,
  examBlockSessionCap: 4,
  bookingHorizonDays: 7,
  cancellationNoticeHours: 24,
  noShowsBeforeRestriction: 2,
  individualCapacity: [1, 3] as const,
  groupCapacity: [3, 8] as const,
  tutorRecommendedWeeklyHours: [4, 6] as const,
  tutorHardWeeklyHours: 8,
  reviewPrepMinutesPerTutoringHour: 30,
  reviewPrepWeeklyMinutes: 180,
} as const;

export const oacaAppointmentStates = [
  "draft",
  "pending_approval",
  "counterproposed",
  "confirmed",
  "declined",
  "cancelled",
  "completed",
  "no_show",
] as const;
export type OacaAppointmentState = typeof oacaAppointmentStates[number];

export const oacaAppointmentTransitions: Record<OacaAppointmentState, readonly OacaAppointmentState[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["counterproposed", "confirmed", "declined", "cancelled"],
  counterproposed: ["pending_approval", "confirmed", "declined", "cancelled"],
  confirmed: ["counterproposed", "cancelled", "completed", "no_show"],
  declined: [],
  cancelled: [],
  completed: [],
  no_show: [],
};

export function canTransitionOacaAppointment(from: OacaAppointmentState, to: OacaAppointmentState) {
  return oacaAppointmentTransitions[from].includes(to);
}

export const genesisJourneySteps = [
  { key: "point_of_view", label: "Point of view", prompt: "What draws you to this community and what assumptions are you carrying?" },
  { key: "problem_of_practice", label: "Problem of practice", prompt: "Name the problem or health statistic, then ground it in a dated and geographically relevant source." },
  { key: "community_context", label: "Community context", prompt: "What assets, stakeholders, listening evidence, existing efforts, root causes, and potential harms matter?" },
  { key: "theory_of_change", label: "Theory of change", prompt: "Connect goals, activities, equity considerations, responsibilities, measures, and evidence." },
  { key: "sustainability", label: "Sustainability", prompt: "Plan for partners, resources, budget, risks, documentation, ownership, and continuation after graduation." },
] as const;

export const genesisEventStates = [
  "draft",
  "submitted",
  "changes_requested",
  "mentor_approved",
  "liaison_approved",
  "published",
  "completed",
  "cancelled",
  "archived",
] as const;
export type GenesisEventState = typeof genesisEventStates[number];

export function genesisEventCanPublish(mentorApprovedAt: string | null, liaisonApprovedAt: string | null) {
  return Boolean(mentorApprovedAt && liaisonApprovedAt);
}

export type UploadKind = "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "image/jpeg" | "image/png" | "text/csv" | "application/csv" | "application/vnd.ms-excel";
export const acceptedUploadTypes = new Set<UploadKind>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
]);
export const maximumUploadBytes = 25 * 1024 * 1024;

export function validateUpload(file: Pick<File, "size" | "type">) {
  if (!acceptedUploadTypes.has(file.type as UploadKind)) return "Use a PDF, DOCX, XLSX, PPTX, JPEG, or PNG file.";
  if (file.size > maximumUploadBytes) return "Choose a file no larger than 25 MB.";
  return null;
}

export function suppressSmallGroup<T extends { count: number }>(row: T, minimum = 10) {
  return row.count < minimum ? { ...row, suppressed: true, value: null } : { ...row, suppressed: false };
}

export const syntheticPilotMemberships: ExperienceMembership[] = [
  { experienceKey: "pathway", experienceName: experiences.pathway.name, roles: ["student"], capabilities: [], status: "active", featureEnabled: true },
  { experienceKey: "oaca", experienceName: experiences.oaca.name, roles: ["student"], capabilities: ["oaca.schedule", "oaca.portfolio.own"], status: "active", featureEnabled: true },
  { experienceKey: "genesis", experienceName: experiences.genesis.name, roles: ["student"], capabilities: ["genesis.portfolio.own", "genesis.snapshot.publish"], status: "active", featureEnabled: true },
];
