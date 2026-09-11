"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { PilotApiClient } from "./api-client";
import { experiences, type ExperienceMembership } from "./platform-model";
import { organizationsForSelect } from "./student-organizations";
import type { AuthorizationContext } from "./types";

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

export const SYNTHETIC_PREVIEW_KEY = "navigate.synthetic-pilot-preview";

export const syntheticPreviewContext: AuthorizationContext = {
  userId: "synthetic-creator",
  authUserId: "synthetic-creator",
  displayName: "Creator preview",
  email: "preview@navigate.local",
  roles: ["administrator"],
  activeOrganizationId: "synthetic-rucom",
  activeProgramId: "synthetic-program",
  activeCohortId: "synthetic-cohort-2029",
  capabilities: ["platform.creator", "oaca.admin", "genesis.admin"],
  aal: "aal2",
  environment: "staging",
  principalType: "creator",
  principalAcknowledged: true,
};

export const syntheticPreviewMemberships: ExperienceMembership[] = [
  { experienceKey: "pathway", experienceName: experiences.pathway.name, roles: ["creator", "administrator", "advisor", "student"], capabilities: ["pathway.creator"], status: "active", featureEnabled: true },
  { experienceKey: "oaca", experienceName: experiences.oaca.name, roles: ["creator", "administrator", "staff", "faculty", "student"], capabilities: ["oaca.admin", "oaca.schedule", "oaca.records", "oaca.analytics", "oaca.import", "oaca.outreach"], status: "active", featureEnabled: true },
  { experienceKey: "genesis", experienceName: experiences.genesis.name, roles: ["creator", "administrator", "mentor", "community_liaison", "student"], capabilities: ["genesis.admin", "genesis.review", "genesis.portfolio.own", "genesis.snapshot.publish"], status: "active", featureEnabled: true },
];

syntheticPreviewContext.experienceMemberships = syntheticPreviewMemberships;

export const syntheticPreviewSession = {
  access_token: "synthetic-preview-only",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4102444800,
  refresh_token: "synthetic-preview-only",
  user: {
    id: "synthetic-creator",
    app_metadata: {},
    user_metadata: { display_name: "Creator preview" },
    aud: "authenticated",
    created_at: "2026-09-10T00:00:00.000Z",
    email: "preview@navigate.local",
  },
} as unknown as Session;

export const syntheticPreviewSupabase = {
  storage: {
    from: () => ({
      upload: async (path: string) => ({ data: { path }, error: null }),
    }),
  },
  auth: {
    getSession: async () => ({ data: { session: syntheticPreviewSession }, error: null }),
    signOut: async () => ({ error: null }),
  },
} as unknown as SupabaseClient;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isoAt = (dayOffset: number, hour: number, minute = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + dayOffset);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
};

const organizations = organizationsForSelect().map((organization) => ({ ...organization, id: organization.key }));
const medicineOrganization = organizations.find((organization) => organization.pilotAvailable) || organizations[0];

function oacaEvents() {
  return [
    { id: "event-today", title: "Learning Strategies Lab", description: "A practical, facilitated workshop for planning the next exam block. Bring your current study plan and leave with a focused weekly rhythm, accountability checkpoints, and a short list of questions for your advisor.", imageUrl: "/media/cohort-commons-poster.jpg", imageAlt: "Abstract Roseman event artwork with maroon points", hostName: "OACA Learning Support", startsAt: isoAt(0, 14), endsAt: isoAt(0, 15), modality: "in_person", location: "Discovery Room 214", capacity: 40, registrationCount: 24, registered: true, status: "published", audience: { includeAllStudents: true }, formId: null },
    { id: "event-upcoming", title: "Specialty Exploration Forum", description: "Meet clinicians representing several specialties, hear how they approached career decisions, and prepare useful questions for future career-advising conversations. Students may attend in person or through Teams.", imageUrl: "/media/reflection-studio-poster.jpg", imageAlt: "Abstract Roseman event artwork with a maroon letterform and grid", hostName: "OACA Career Advising", startsAt: isoAt(3, 16), endsAt: isoAt(3, 17, 30), modality: "hybrid", location: "Flagship Auditorium + Teams", capacity: null, registrationCount: 58, registered: true, status: "published", audience: { cohortLabels: ["Class of 2029"] }, formId: null },
    { id: "event-past", title: "Foundations Planning Session", description: "An interactive planning session focused on upcoming academic milestones, time management, and choosing the right advising support. This completed synthetic event demonstrates attendance history and follow-up.", imageUrl: "/assets/brand/oaca-emblem.png", imageAlt: "OACA emblem", hostName: "Office of Academic and Career Advising", startsAt: isoAt(-7, 12), endsAt: isoAt(-7, 13), modality: "in_person", location: "OACA Collaboration Room", capacity: 32, registrationCount: 21, registered: true, status: "completed", audience: { cohortLabels: ["Class of 2029"] }, formId: null },
  ];
}

function oacaBootstrap() {
  const events = oacaEvents();
  return {
    services: [
      { id: "service-academic", key: "academic_advising", name: "Academic advising", providerRule: "assigned", policyStatus: "sandbox_approved", modalities: ["in_person", "phone", "teams"], durationMinutes: 30 },
      { id: "service-career", key: "career_advising", name: "Career advising", providerRule: "choice_or_first", policyStatus: "sandbox_approved", modalities: ["in_person", "phone", "teams"], durationMinutes: 30 },
      { id: "service-tutoring", key: "peer_tutoring", name: "Peer tutoring", providerRule: "choice", policyStatus: "sandbox_approved", modalities: ["in_person", "teams"], durationMinutes: 60 },
    ],
    providers: [
      { id: "provider-academic", displayName: "Dr. Morgan Lee", classification: "faculty", subjects: [], modalities: ["in_person", "phone", "teams"], serviceKeys: ["academic_advising"] },
      { id: "provider-dropin", displayName: "Dr. Morgan Patel", classification: "faculty", subjects: [], modalities: ["in_person", "phone", "teams"], serviceKeys: ["academic_advising"] },
      { id: "provider-career", displayName: "Jordan Rivera", classification: "staff", subjects: [], modalities: ["in_person", "teams"], serviceKeys: ["career_advising"] },
      { id: "provider-tutor", displayName: "Avery Chen", classification: "peer_tutor", subjects: ["Foundations", "Clinical skills"], modalities: ["in_person", "teams"], serviceKeys: ["peer_tutoring"] },
    ],
    appointments: [
      { id: "appointment-1", studentId: "synthetic-creator", studentName: "Creator preview", serviceName: "Academic advising", providerName: "Dr. Morgan Lee", startsAt: isoAt(1, 10), endsAt: isoAt(1, 10, 30), modality: "teams", status: "confirmed", sandbox: true, requestOrigin: "student", studentRecap: "Review the weekly study plan and return with two questions." },
      { id: "appointment-2", studentId: "student-2", studentName: "Riley Thompson", serviceName: "Peer tutoring", providerName: "Avery Chen", subject: "Foundations", format: "individual", startsAt: isoAt(2, 13), endsAt: isoAt(2, 14), modality: "in_person", status: "pending_approval", sandbox: true, requestOrigin: "student" },
    ],
    assignedAdvisor: { id: "provider-academic", displayName: "Dr. Morgan Lee", classification: "faculty", subjects: [], modalities: ["in_person", "phone", "teams"], serviceKeys: ["academic_advising"] },
    assignedStudents: [
      { id: "student-1", displayName: "Taylor Morgan" },
      { id: "student-2", displayName: "Riley Thompson" },
      { id: "student-3", displayName: "Cameron Ellis" },
    ],
    currentProvider: { id: "provider-academic", displayName: "Dr. Morgan Lee", classification: "faculty", subjects: [], modalities: ["in_person", "phone", "teams"], serviceKeys: ["academic_advising"] },
    policyDocuments: [],
    policyRules: [],
    acknowledgments: [],
    obligations: [
      { id: "obligation-1", studentId: "synthetic-creator", studentName: "Creator preview", ruleKey: "foundations_year_2_check_in", title: "Foundations 3 check-in", serviceKey: "academic_advising", requiredProvider: "assigned_advisor", triggeredAt: isoAt(-14, 9), dueAt: isoAt(21, 17), status: "open" },
    ],
    restrictions: [],
    tutorCompliance: { application_approved_at: isoAt(-90, 9), faculty_recommendation_at: isoAt(-84, 9), interview_completed_at: isoAt(-77, 9), workday_onboarding_at: isoAt(-70, 9), training_completed_at: isoAt(-63, 9), handbook_acknowledgment_id: "synthetic-ack", eligible_at: isoAt(-60, 9), suspended_at: null },
    liveScheduling: false,
    calendarConnected: false,
    canManageImports: true,
    canViewAnalytics: true,
    importBatches: [
      { id: "import-1", fileId: "synthetic-file", sourceSystem: "penji", datasetType: "penji_sessions", cohortLabel: "Class of 2029", periodStartsOn: "2025-08-01", periodEndsOn: "2026-09-10", containsRealStudentData: false, sourceHeaders: ["Student ID", "Event", "Start", "Status"], columnMapping: {}, status: "completed", totalRows: 178, validRows: 178, invalidRows: 0, matchedStudents: 76, qualitySummary: { note: "Illustrative aggregate only" }, requestedBy: "synthetic-creator", reviewedBy: "synthetic-reviewer", reviewedAt: isoAt(-2, 11), createdAt: isoAt(-3, 11), completedAt: isoAt(-2, 12), issues: [] },
    ],
    analytics: {
      minimumGroupSize: 10,
      coverageStart: "2025-08-01",
      coverageEnd: "2026-09-10",
      totals: { sessions: 178, studentCount: 76, hours: 142, completionRate: 88, noShowRate: 3, rescheduleRate: 9, averageWaitDays: 2.4 },
      services: [
        { serviceKey: "academic_advising", studentCount: 46, sessions: 92, hours: 46, suppressed: false },
        { serviceKey: "career_advising", studentCount: 31, sessions: 44, hours: 22, suppressed: false },
        { serviceKey: "peer_tutoring", studentCount: 38, sessions: 42, hours: 74, suppressed: false },
      ],
      cohorts: [{ cohortLabel: "Class of 2029", studentCount: 76, sessions: 178, hours: 142, noShowRate: 3, suppressed: false }],
    },
    canManageOutreach: true,
    canViewOutreachInsights: true,
    events,
    campaigns: [
      { id: "campaign-1", name: "Specialty forum invitation", subject: "Plan your specialty exploration", previewText: "Reserve a place and bring your questions.", status: "sent", audience: { cohortLabels: ["Class of 2029"] }, scheduledFor: null, sentAt: isoAt(-4, 9), content: { heading: "Explore specialties with intention" }, recipientCount: 76, deliveredCount: 73, openedCount: 52, clickedCount: 34, formSubmittedCount: 18, eventRegisteredCount: 24, appointmentRequestedCount: 11, minimumGroupSize: 10 },
    ],
    nudges: [{ id: "nudge-1", studentId: "synthetic-creator", studentName: "Creator preview", serviceKey: "career_advising", providerName: "Jordan Rivera", dueBy: isoAt(14, 17), status: "delivered", createdAt: isoAt(-2, 10) }],
    communications: [],
    forms: [],
    audienceOptions: { cohorts: ["Class of 2029"], phases: ["Foundations", "Clerkship", "Advanced"], years: ["M1", "M2", "M3", "M4"], campuses: ["Summerlin", "Henderson"] },
    eventNotificationUnreadCount: 2,
  };
}

function eventWorkspace() {
  const events = oacaEvents().map((event) => ({ ...event, timezone: "America/Los_Angeles", canManage: true, presentCount: event.id === "event-past" ? 18 : 2, absentCount: event.id === "event-past" ? 2 : 0, notRecordedCount: event.id === "event-past" ? 1 : Math.max(0, event.registrationCount - 2), attendanceStatus: event.id === "event-past" ? "present" : null, checkinOpen: false }));
  return {
    events,
    roster: [
      { studentId: "student-1", displayName: "Taylor Morgan", registrationStatus: "registered", registrationSource: "self", attendanceStatus: "present", attendanceSource: "staff", version: 2, updatedAt: isoAt(0, 13, 55) },
      { studentId: "student-2", displayName: "Riley Thompson", registrationStatus: "registered", registrationSource: "campaign", attendanceStatus: "present", attendanceSource: "self_checkin", version: 1, updatedAt: isoAt(0, 13, 57) },
      { studentId: "student-3", displayName: "Cameron Ellis", registrationStatus: "registered", registrationSource: "self", attendanceStatus: "not_recorded", attendanceSource: null, version: 0, updatedAt: isoAt(0, 9) },
    ],
    hosts: [{ userId: "synthetic-creator", displayName: "Creator preview", role: "owner" }],
    staffOptions: [{ userId: "synthetic-creator", displayName: "Creator preview" }, { userId: "staff-2", displayName: "Morgan Patel" }],
    corrections: [{ id: "correction-1", eventId: "event-past", studentId: "student-2", displayName: "Riley Thompson", requestedStatus: "present", explanation: "I checked in with event staff at the door.", status: "open", createdAt: isoAt(-1, 9) }],
    notifications: [
      { id: "notice-1", eventId: "event-today", category: "reminder", title: "Learning Strategies Lab today", body: "The event begins at 2:00 PM in Discovery Room 214.", deepLink: "/app/oaca", readAt: null, dismissedAt: null, createdAt: isoAt(0, 8) },
      { id: "notice-2", eventId: "event-upcoming", category: "publication", title: "Specialty Exploration Forum", body: "Registration is open in Compass.", deepLink: "/app/oaca", readAt: null, dismissedAt: null, createdAt: isoAt(-1, 11) },
    ],
    preferences: { emailEnabled: true, smsEnabled: false, phoneVerified: false, quietHoursStart: "21:00:00", quietHoursEnd: "07:00:00", timezone: "America/Los_Angeles" },
    pushSubscriptions: [],
    notificationRules: [
      { id: "rule-24h", type: "reminder", offsetMinutes: 1440, channels: ["in_app", "email"], enabled: true, scheduledFor: isoAt(2, 16), generation: 1 },
      { id: "rule-1h", type: "reminder", offsetMinutes: 60, channels: ["in_app", "email"], enabled: true, scheduledFor: isoAt(3, 15), generation: 1 },
    ],
    deliveries: { queued: 3, suppressed: 2, sent: 72, delivered: 70, failed: 2, opened: 46, clicked: 21, replied: 4 },
    threads: [{ id: "thread-1", studentId: "student-1", studentName: "Taylor Morgan", messages: [{ id: "message-1", senderId: "student-1", body: "Is the workshop room near the library?", direction: "inbound", channel: "sms", createdAt: isoAt(0, 9) }] }],
    unreadCount: 2,
  };
}

function genesisBootstrap() {
  const organizationName = medicineOrganization?.name || "College of Medicine student organization";
  const organizationId = medicineOrganization?.id || "medicine-organization";
  const portfolio = {
    id: "portfolio-1",
    title: "Neighborhood blood-pressure access initiative",
    organizationId,
    organizationName,
    currentVersion: 4,
    status: "mentor_review",
    content: {
      point_of_view: "I want to understand barriers before proposing a service, and I need residents to define what useful access means.",
      problem_of_practice: "Residents in the selected Nevada neighborhood report inconsistent access to blood-pressure screening and follow-up.",
      community_context: "Local clinics, libraries, faith communities, and resident leaders are assets. Listening must precede program design.",
      theory_of_change: "If partners co-design accessible screening and referral touchpoints, more residents can connect to sustained primary care.",
      sustainability: "Document partner roles, recurring costs, referral ownership, and a student-to-student succession rhythm.",
    },
  };
  return {
    organizations,
    portfolios: [portfolio],
    reviews: [portfolio],
    snapshots: [{ id: "snapshot-1", title: "Community listening summary · version 3", publishedAt: isoAt(-12, 10), authorName: "Taylor Morgan" }],
    handoffs: [{ id: "handoff-1", title: "Spring continuation package", status: "offered", nextSteward: "Riley Thompson" }],
    events: [{ id: "genesis-event-1", title: "Community listening circle", status: "mentor_approved", startsAt: isoAt(10, 17) }],
  };
}

class SyntheticPilotApi {
  private affiliationIds = medicineOrganization ? [medicineOrganization.id] : [];
  private studentCouncil = true;
  private appointments = oacaBootstrap().appointments;

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (path === "/api/platform/experiences") return clone({ context: syntheticPreviewContext, memberships: syntheticPreviewMemberships }) as T;
    if (path === "/api/platform/affiliations") {
      if ((options.method || "GET").toUpperCase() === "POST") {
        const body = options.body as { organizationIds?: string[]; studentCouncil?: boolean } | undefined;
        this.affiliationIds = body?.organizationIds || [];
        this.studentCouncil = Boolean(body?.studentCouncil);
      }
      return clone({ isStudent: true, organizations: organizations.map(({ id, key, name, college, campus, aliases }) => ({ id, key, name, college, campus, aliases })), organizationIds: this.affiliationIds, studentCouncil: this.studentCouncil }) as T;
    }
    if (path === "/api/oaca/bootstrap") return clone({ ...oacaBootstrap(), appointments: this.appointments }) as T;
    if (path.startsWith("/api/oaca/events/workspace")) return clone(eventWorkspace()) as T;
    if (path === "/api/oaca/event-imports" && (!options.method || options.method === "GET")) return clone([{ id: "event-import-1", status: "completed", source_event_rows: 48, source_attendance_rows: 178, occurrence_count: 22, matched_students: 76, merged_duplicates: 3, quality_summary: { note: "Illustrative aggregate only" }, requested_by: "synthetic-creator", reviewed_by: "synthetic-reviewer", reviewed_at: isoAt(-2, 11), completed_at: isoAt(-2, 12), created_at: isoAt(-3, 11) }]) as T;
    if (path === "/api/genesis/bootstrap") return clone(genesisBootstrap()) as T;
    if (path === "/api/platform/files") return { id: "synthetic-file" } as T;
    if (path === "/api/platform/notification-preferences") return { smsEnabled: false } as T;
    if (path === "/api/oaca/events/attendance") return { version: 3 } as T;
    if (path === "/api/oaca/events/check-in") return { open: true, token: "synthetic-event-token", closesAt: isoAt(0, 16), deepLink: "/app/oaca?checkin=synthetic-event-token" } as T;
    if (path === "/api/oaca/events/check-in/student-token") return { token: "synthetic-permanent-student-qr", permanent: true } as T;
    if (path === "/api/oaca/events/check-in/self") return { title: "Learning Strategies Lab" } as T;
    if (path === "/api/oaca/appointments/cancel") {
      const body = options.body as { appointmentId?: string } | undefined;
      const appointment = this.appointments.find((item) => item.id === body?.appointmentId);
      if (appointment) appointment.status = "cancelled";
      return clone({ id: appointment?.id, status: appointment?.status || "cancelled" }) as T;
    }
    if (path === "/api/oaca/appointments" && (options.method || "GET").toUpperCase() === "POST") {
      const body = options.body as { serviceLineId?: string; providerId?: string | null; startsAt?: string; modality?: string; format?: string; topic?: string } | undefined;
      const seed = oacaBootstrap(); const service = seed.services.find((item) => item.id === body?.serviceLineId); const provider = seed.providers.find((item) => item.id === body?.providerId);
      const appointment = { id: `appointment-${crypto.randomUUID()}`, studentId: "synthetic-creator", studentName: "Creator preview", serviceName: service?.name || "OACA appointment", providerName: provider?.displayName || (service?.key === "academic_advising" ? seed.assignedAdvisor.displayName : null), subject: body?.topic || null, format: body?.format || "individual", startsAt: body?.startsAt || null, endsAt: null, modality: body?.modality || "teams", status: "pending_approval", sandbox: true, requestOrigin: "student" as const };
      this.appointments = [appointment, ...this.appointments];
      return clone({ id: appointment.id, status: appointment.status, sandbox: true }) as T;
    }
    if (path === "/api/oaca/campaigns") return { id: "synthetic-campaign" } as T;
    return { id: "synthetic-record", ok: true } as T;
  }

  async download() {
    return { blob: new Blob(["Synthetic preview export. No production records were accessed."], { type: "text/plain" }), filename: "navigate-synthetic-preview.txt" };
  }
}

export const syntheticPreviewApi = new SyntheticPilotApi() as unknown as PilotApiClient;
