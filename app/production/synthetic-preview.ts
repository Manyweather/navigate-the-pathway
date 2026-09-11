"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { PilotApiClient } from "./api-client";
import { zonedLocalIso } from "./oaca-event-model";
import type { OacaAudience } from "./oaca-engagement-model";
import { experiences, type ExperienceMembership } from "./platform-model";
import { organizationsForSelect } from "./student-organizations";
import type { AuthorizationContext } from "./types";

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

export const SYNTHETIC_PREVIEW_KEY = "navigate.synthetic-pilot-preview";
export const SYNTHETIC_PERSONA_KEY = "navigate.synthetic-pilot-persona.v1";
export const SYNTHETIC_PREVIEW_SCOPE_KEY = "navigate.synthetic-pilot-scope.v1";

export type SyntheticPersonaKey =
  | "pathway_student"
  | "compass_student"
  | "compass_staff"
  | "academic_advisor"
  | "career_advisor"
  | "compass_director"
  | "impact_student"
  | "impact_administrator"
  | "community_liaison"
  | "platform_creator";

export const SYNTHETIC_PERSONAS: Array<{
  key: SyntheticPersonaKey;
  label: string;
  defaultPath: string;
}> = [
  {
    key: "pathway_student",
    label: "Pathway pre-med student",
    defaultPath: "/app/pathway",
  },
  {
    key: "compass_student",
    label: "Compass student",
    defaultPath: "/app/compass",
  },
  {
    key: "academic_advisor",
    label: "Academic Advisor",
    defaultPath: "/app/compass",
  },
  {
    key: "career_advisor",
    label: "Career Advisor",
    defaultPath: "/app/compass",
  },
  {
    key: "compass_director",
    label: "Compass Administrator / Director",
    defaultPath: "/app/compass",
  },
  {
    key: "impact_student",
    label: "Impact student",
    defaultPath: "/app/compass/impact",
  },
  {
    key: "impact_administrator",
    label: "Impact Administrator",
    defaultPath: "/app/compass/impact",
  },
  {
    key: "community_liaison",
    label: "Community Liaison",
    defaultPath: "/app/compass/impact",
  },
  {
    key: "platform_creator",
    label: "Platform Creator",
    defaultPath: "/app/compass",
  },
];

export function getSyntheticPreviewPersona(): SyntheticPersonaKey {
  if (typeof window === "undefined") return "platform_creator";
  const saved = window.localStorage.getItem(
    SYNTHETIC_PERSONA_KEY,
  ) as SyntheticPersonaKey | null;
  return SYNTHETIC_PERSONAS.some((item) => item.key === saved)
    ? saved!
    : "platform_creator";
}

export function setSyntheticPreviewPersona(persona: SyntheticPersonaKey) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SYNTHETIC_PERSONA_KEY, persona);
  window.dispatchEvent(
    new CustomEvent("navigate:preview-persona", { detail: persona }),
  );
}

export function isSyntheticPreviewActive() {
  return (
    typeof window !== "undefined" &&
    window.localStorage.getItem(SYNTHETIC_PREVIEW_KEY) === "true"
  );
}

export function clearSyntheticPreview() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SYNTHETIC_PREVIEW_KEY);
  window.localStorage.removeItem(SYNTHETIC_PERSONA_KEY);
  window.localStorage.removeItem(SYNTHETIC_PREVIEW_SCOPE_KEY);
}

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
  {
    experienceKey: "oaca",
    experienceName: experiences.oaca.name,
    roles: ["creator"],
    capabilities: [
      "oaca.admin",
      "oaca.schedule",
      "oaca.records",
      "oaca.analytics",
      "oaca.import",
      "oaca.outreach",
    ],
    status: "active",
    featureEnabled: true,
  },
  {
    experienceKey: "pathway",
    experienceName: experiences.pathway.name,
    roles: ["creator"],
    capabilities: ["pathway.creator"],
    status: "active",
    featureEnabled: true,
  },
  {
    experienceKey: "genesis",
    experienceName: experiences.genesis.name,
    roles: ["creator"],
    capabilities: [
      "genesis.admin",
      "genesis.review",
      "genesis.portfolio.own",
      "genesis.snapshot.publish",
    ],
    status: "active",
    featureEnabled: true,
  },
];

export function syntheticMembershipsForPersona(
  persona: SyntheticPersonaKey,
): ExperienceMembership[] {
  const membership = (
    experienceKey: "pathway" | "oaca" | "genesis",
    roles: ExperienceMembership["roles"],
    capabilities: string[] = [],
    launchState: ExperienceMembership["launchState"] = "active",
  ): ExperienceMembership => ({
    experienceKey,
    experienceName: experiences[experienceKey].name,
    roles,
    capabilities,
    status: "active",
    featureEnabled: true,
    launchState,
  });
  if (persona === "pathway_student")
    return [membership("pathway", ["student"])];
  if (persona === "compass_student")
    return [
      membership("oaca", ["student"], ["oaca.schedule", "oaca.portfolio.own"]),
    ];
  if (persona === "compass_staff" || persona === "academic_advisor")
    return [
      membership(
        "oaca",
        ["advisor"],
        [
          "oaca.advisor.academic",
          "oaca.schedule",
          "oaca.records",
          "oaca.outreach",
        ],
      ),
    ];
  if (persona === "career_advisor")
    return [
      membership(
        "oaca",
        ["advisor"],
        [
          "oaca.advisor.career",
          "oaca.schedule",
          "oaca.records",
          "oaca.outreach",
        ],
      ),
    ];
  if (persona === "compass_director")
    return [
      membership(
        "oaca",
        ["administrator"],
        [
          "oaca.advisor.academic",
          "oaca.advisor.career",
          "oaca.admin",
          "oaca.schedule",
          "oaca.records",
          "oaca.analytics",
          "oaca.import",
          "oaca.outreach",
        ],
      ),
    ];
  if (persona === "impact_student")
    return [
      membership("oaca", ["student"], ["oaca.schedule"]),
      membership(
        "genesis",
        ["student"],
        ["genesis.portfolio.own", "genesis.snapshot.publish"],
      ),
    ];
  if (persona === "impact_administrator")
    return [
      membership(
        "genesis",
        ["administrator"],
        ["genesis.admin", "genesis.review"],
      ),
    ];
  if (persona === "community_liaison")
    return [
      membership(
        "genesis",
        ["community_liaison"],
        ["genesis.review", "genesis.events.decide"],
      ),
    ];
  return clone(syntheticPreviewMemberships);
}

export function syntheticContextForPersona(
  persona: SyntheticPersonaKey,
): AuthorizationContext {
  const isStudent = [
    "pathway_student",
    "compass_student",
    "impact_student",
  ].includes(persona);
  const context = clone(syntheticPreviewContext);
  context.userId = isStudent
    ? `synthetic-${persona.replaceAll("_", "-")}`
    : `synthetic-${persona.replaceAll("_", "-")}`;
  context.authUserId = context.userId;
  context.displayName =
    persona === "pathway_student"
      ? "Jordan Premed"
      : persona === "impact_student"
        ? "Taylor Morgan"
        : persona === "compass_student"
          ? "Taylor Morgan"
          : persona === "community_liaison"
            ? "Community Liaison preview"
            : persona === "impact_administrator"
              ? "Impact Administrator preview"
              : persona === "career_advisor"
                ? "Art Avila, M.Ed."
                : persona === "compass_director"
                  ? "Director of Academic and Career Advising"
                  : persona === "compass_staff" ||
                      persona === "academic_advisor"
                    ? "Bucket L. Manyweather, Ph.D."
                    : "Creator preview";
  context.principalType = persona === "platform_creator" ? "creator" : null;
  context.capabilities = syntheticMembershipsForPersona(persona).flatMap(
    (item) => item.capabilities,
  );
  context.experienceMemberships = syntheticMembershipsForPersona(persona);
  return context;
}

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
    getSession: async () => ({
      data: { session: syntheticPreviewSession },
      error: null,
    }),
    signOut: async () => ({ error: null }),
  },
} as unknown as SupabaseClient;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isoAt = (dayOffset: number, hour: number, minute = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + dayOffset);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
};

const organizations = organizationsForSelect().map((organization) => ({
  ...organization,
  id: organization.key,
}));
const medicineOrganization =
  organizations.find((organization) => organization.pilotAvailable) ||
  organizations[0];

type SyntheticEvent = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  imageAlt: string | null;
  hostName: string;
  startsAt: string;
  endsAt: string | null;
  modality: string;
  location: string | null;
  capacity: number | null;
  registrationCount: number;
  registered: boolean;
  status: string;
  audience: OacaAudience;
  formId: string | null;
  timezone?: string;
  canManage?: boolean;
  presentCount?: number;
  absentCount?: number;
  notRecordedCount?: number;
  attendanceStatus?: "present" | "absent" | "not_recorded" | null;
  checkinOpen?: boolean;
  sourceSystem?: string | null;
};

type SyntheticAppointment = {
  id: string;
  studentId: string;
  studentName: string;
  serviceName: string;
  providerName: string | null;
  subject?: string | null;
  format?: string;
  startsAt: string | null;
  endsAt: string | null;
  modality: string;
  status: string;
  sandbox: boolean;
  requestOrigin: string;
  studentRecap?: string;
};

type SyntheticEncounterRecord = {
  appointmentId: string;
  workingNotes: string;
  studentRecap: string;
  structuredData: {
    categories: string[];
    interventions: string[];
    referrals: string[];
    followUp: string[];
  };
  revision: number;
  updatedAt: string;
  publishedAt: string | null;
};

const penjiOccurrenceRows = [
  [
    "Notetaking for Retention with Dr. van Tonder",
    "2026-09-03",
    "12:00",
    "13:00",
    "Innovation Hall Room 210",
    10,
    8,
    0,
  ],
  [
    "Bring Your Reset: Board Games",
    "2026-09-02",
    "12:00",
    "13:00",
    "Roadrunner Communities",
    18,
    18,
    0,
  ],
  [
    "From Burnout to Balance",
    "2026-08-20",
    "12:00",
    "13:00",
    "Innovation Hall Room 210",
    8,
    0,
    1,
  ],
  [
    "Ice Cream Social",
    "2026-08-17",
    "17:30",
    "18:30",
    "Student Affairs Suite",
    32,
    32,
    0,
  ],
  [
    "Bring Your Reset - Learn to Crochet",
    "2026-05-07",
    "12:00",
    "13:00",
    "Roadrunner Learning Communities",
    4,
    3,
    0,
  ],
  [
    "Drawing to Learn",
    "2026-05-06",
    "12:00",
    "13:00",
    "Innovation Hall Room 210",
    4,
    0,
    0,
  ],
  [
    "brAInstorm: Apps and AI",
    "2026-04-14",
    "12:00",
    "13:00",
    "Innovation Hall Room 210",
    9,
    9,
    0,
  ],
  [
    "Workshop Essential Word Formatting for MD Student Research",
    "2026-03-26",
    "08:00",
    "09:00",
    "Zoom",
    2,
    2,
    0,
  ],
  [
    "Coffee and Convo's",
    "2026-03-25",
    "15:45",
    "16:45",
    "Admissions Suite",
    1,
    0,
    0,
  ],
  [
    "Reading Skills for Medical School",
    "2026-03-05",
    "12:00",
    "13:00",
    "Innovation Hall Room 200",
    3,
    2,
    0,
  ],
  [
    "Academic and Social Empowerment with Dr. Wilson",
    "2026-02-16",
    "12:00",
    "13:00",
    "Innovation Hall Room 210",
    3,
    3,
    0,
  ],
  [
    "Made by Medicine",
    "2025-12-10",
    "12:00",
    "17:00",
    "Discovery 2nd Floor",
    30,
    30,
    0,
  ],
  [
    "Question Review Session - Biochemistry with Dr. Dilts",
    "2025-10-15",
    "16:00",
    "17:00",
    "Innovation Hall Classroom 210",
    13,
    13,
    0,
  ],
  [
    "Revisiting Goals",
    "2025-10-13",
    "11:00",
    "12:00",
    "Innovation 210",
    1,
    0,
    0,
  ],
  [
    "Reading Skills for Medical School",
    "2025-09-23",
    "16:00",
    "17:00",
    "Innovation Hall Room 210",
    2,
    0,
    0,
  ],
  [
    "Practical Practice Testing",
    "2025-09-09",
    "12:00",
    "13:00",
    "Innovation Hall Room 210",
    10,
    0,
    1,
  ],
  [
    "Plus Ones: Ice Cream Mixer",
    "2025-08-25",
    "17:30",
    "18:30",
    "Discovery Building- Student Affairs Suite",
    3,
    0,
    0,
  ],
  [
    "Coffee and Convos",
    "2025-08-20",
    "16:00",
    "17:00",
    "Innovation Hall Admissions Suite",
    1,
    0,
    0,
  ],
  [
    "Your Support Circle",
    "2025-08-19",
    "12:00",
    "13:00",
    "Auditorium",
    2,
    1,
    0,
  ],
  [
    "Stress Management and Wellness",
    "2025-08-12",
    "12:00",
    "13:00",
    "Auditorium",
    8,
    6,
    0,
  ],
  [
    "Notetaking for Retention",
    "2025-08-07",
    "12:00",
    "13:00",
    "Auditorium",
    12,
    9,
    3,
  ],
  ["Sit and Schedule", "2025-08-04", "09:00", "10:00", "Zoom", 2, 2, 0],
] as const;

function penjiHistoryEvents(): SyntheticEvent[] {
  return penjiOccurrenceRows.map(
    (
      [title, date, start, end, location, registered, present, absent],
      index,
    ) => ({
      id: `penji-occurrence-${index + 1}`,
      title,
      description:
        "Imported Penji occurrence. Student identities have been replaced with synthetic records in creator preview.",
      imageUrl: null,
      imageAlt: null,
      hostName: "Compass event team",
      startsAt: zonedLocalIso(date, start),
      endsAt: zonedLocalIso(date, end),
      modality: /zoom|teams/i.test(location) ? "teams" : "in_person",
      location,
      capacity: null,
      registrationCount: registered,
      registered: false,
      status: "completed",
      audience: { includeAllMembers: true },
      formId: null,
      timezone: "America/Los_Angeles",
      canManage: true,
      presentCount: present,
      absentCount: absent,
      notRecordedCount: registered - present - absent,
      attendanceStatus: null,
      checkinOpen: false,
      sourceSystem: "penji",
    }),
  );
}

function oacaEvents(): SyntheticEvent[] {
  return [
    {
      id: "event-practical-testing",
      title: "Practical Practice Testing",
      description:
        "Practice retrieval and testing strategies with the Compass academic-support team. This sandbox event uses the supplied Penji event schedule and fictional student participation.",
      imageUrl: "/media/cohort-commons-poster.jpg",
      imageAlt: "Abstract Roseman event artwork with maroon points",
      hostName:
        "Bucket L. Manyweather, Ph.D.; Cameron Mastin, M.Ed.; Michael O'Leary, M.Ed.",
      startsAt: zonedLocalIso("2026-09-15", "12:00"),
      endsAt: zonedLocalIso("2026-09-15", "13:00"),
      modality: "in_person",
      location: "Innovation Hall Room 210",
      capacity: 30,
      registrationCount: 1,
      registered: true,
      status: "published",
      audience: { cohortLabels: ["Class of 2029"] },
      formId: null,
    },
    {
      id: "event-research-identity",
      title: "Developing Your Research Identity",
      description:
        "A guided Compass session for students to identify research interests, strengths, and practical next steps.",
      imageUrl: "/media/reflection-studio-poster.jpg",
      imageAlt:
        "Abstract Roseman event artwork with a maroon letterform and grid",
      hostName: "Compass event team",
      startsAt: zonedLocalIso("2026-09-23", "12:00"),
      endsAt: zonedLocalIso("2026-09-23", "13:00"),
      modality: "in_person",
      location: "Innovation Hall Room 210",
      capacity: null,
      registrationCount: 0,
      registered: false,
      status: "published",
      audience: { includeAllStudents: true },
      formId: null,
    },
    {
      id: "event-faculty-author",
      title: "Inside the Specialty: A Faculty Author Conversation",
      description:
        "Join a faculty-led conversation about specialty exploration and the professional path behind published work.",
      imageUrl: null,
      imageAlt: null,
      hostName:
        "Art Avila, M.Ed.; Bucket L. Manyweather, Ph.D.; Cameron Mastin, M.Ed.; Michael O'Leary, M.Ed.",
      startsAt: zonedLocalIso("2026-10-01", "11:30"),
      endsAt: zonedLocalIso("2026-10-01", "13:00"),
      modality: "in_person",
      location: "Library",
      capacity: null,
      registrationCount: 0,
      registered: false,
      status: "published",
      audience: { includeAllStudents: true },
      formId: null,
    },
    {
      id: "event-reset-coloring",
      title: "Bring Your Reset: Coloring Utensils",
      description:
        "A low-pressure reset session for connection and restoration during the academic week.",
      imageUrl: null,
      imageAlt: null,
      hostName: "Compass event team",
      startsAt: zonedLocalIso("2026-10-07", "12:00"),
      endsAt: zonedLocalIso("2026-10-07", "13:00"),
      modality: "in_person",
      location: "Student Commons",
      capacity: 30,
      registrationCount: 0,
      registered: false,
      status: "published",
      audience: { includeAllStudents: true },
      formId: null,
    },
    {
      id: "event-reading-skills",
      title: "Reading Skills for Medical School with Dr. van Tonder",
      description:
        "Practice evidence-informed reading strategies for dense medical-school material.",
      imageUrl: null,
      imageAlt: null,
      hostName: "Compass event team",
      startsAt: zonedLocalIso("2026-10-13", "12:00"),
      endsAt: zonedLocalIso("2026-10-13", "13:00"),
      modality: "in_person",
      location: "Innovation Hall Room 210",
      capacity: 30,
      registrationCount: 0,
      registered: false,
      status: "published",
      audience: { phases: ["Foundations"] },
      formId: null,
    },
    {
      id: "event-level-up-ai",
      title: "Level Up with AI",
      description:
        "Explore practical and responsible uses of AI for learning, planning, and academic work.",
      imageUrl: null,
      imageAlt: null,
      hostName: "Compass event team",
      startsAt: zonedLocalIso("2026-11-05", "12:00"),
      endsAt: zonedLocalIso("2026-11-05", "13:00"),
      modality: "in_person",
      location: "Innovation Hall Room 210",
      capacity: 30,
      registrationCount: 0,
      registered: false,
      status: "published",
      audience: { includeAllStudents: true },
      formId: null,
    },
    {
      id: "event-clerkship-studying",
      title: "Clerkship Studying",
      description:
        "Build a practical study approach for clerkship learning and shelf preparation.",
      imageUrl: null,
      imageAlt: null,
      hostName: "Compass academic advising",
      startsAt: zonedLocalIso("2026-11-10", "12:00"),
      endsAt: zonedLocalIso("2026-11-10", "13:00"),
      modality: "in_person",
      location: "Innovation Hall Room 210",
      capacity: 30,
      registrationCount: 0,
      registered: false,
      status: "published",
      audience: { phases: ["Clerkship"] },
      formId: null,
    },
  ];
}

const syntheticStaff = [
  {
    userId: "synthetic-creator",
    displayName: "Creator preview",
    groupKey: "administration",
    groupLabel: "Administration",
  },
  {
    userId: "staff-director-1",
    displayName: "Kanee Lerwill, MD, MPH",
    groupKey: "administration",
    groupLabel: "OACA Leadership",
  },
  {
    userId: "staff-academic-1",
    displayName: "Bucket L. Manyweather, Ph.D.",
    groupKey: "academic_advising",
    groupLabel: "Academic Advisors",
  },
  {
    userId: "staff-academic-2",
    displayName: "Cameron Mastin, M.Ed.",
    groupKey: "academic_advising",
    groupLabel: "Academic Advisors",
  },
  {
    userId: "staff-academic-3",
    displayName: "Michael O'Leary, M.Ed.",
    groupKey: "academic_advising",
    groupLabel: "Academic Advisors",
  },
  {
    userId: "staff-career-1",
    displayName: "Art Avila, M.Ed.",
    groupKey: "career_advising",
    groupLabel: "Career Advising",
  },
  {
    userId: "staff-tutoring-1",
    displayName: "Dominique Rich, MAT",
    groupKey: "tutoring",
    groupLabel: "Tutoring Management",
  },
  {
    userId: "staff-student-affairs-1",
    displayName: "Adrian Jones, JD",
    groupKey: "administration",
    groupLabel: "Student Affairs Leadership",
  },
];

const syntheticPeople = [
  ...syntheticStaff.map((person) => ({
    userId: person.userId,
    displayName: person.displayName,
    role: person.groupLabel,
  })),
  {
    userId: "student-1",
    displayName: "Taylor Morgan",
    role: "Student · Class of 2029",
  },
  {
    userId: "student-2",
    displayName: "Riley Thompson",
    role: "Student · Class of 2029",
  },
  {
    userId: "student-3",
    displayName: "Cameron Ellis",
    role: "Student · Class of 2029",
  },
];

type SyntheticEventState = {
  events: SyntheticEvent[];
  hosts: Record<
    string,
    Array<{ userId: string; displayName: string; role: string }>
  >;
  notices: Array<{
    id: string;
    eventId: string | null;
    category: string;
    title: string;
    body: string;
    deepLink: string;
    readAt: string | null;
    dismissedAt: string | null;
    createdAt: string;
  }>;
  attendeeRules: Record<
    string,
    Array<{
      id: string;
      type: string;
      offsetMinutes: number | null;
      channels: string[];
      enabled: boolean;
      scheduledFor: string | null;
      generation: number;
    }>
  >;
  coordinatorRules: Record<
    string,
    Array<{
      activityType: string;
      deliveryMode: "immediate" | "hourly" | "off";
      channels: string[];
    }>
  >;
};

const syntheticEventStorageKey = "navigate.compass.synthetic-events.v3";
const syntheticImpactStorageKey = "navigate.compass.synthetic-impact.v1";
const syntheticEncounterStorageKey = "navigate.compass.synthetic-encounters.v1";

function defaultSyntheticEventState(): SyntheticEventState {
  const events = [...oacaEvents(), ...penjiHistoryEvents()].map((event) => ({
    ...event,
    timezone: "America/Los_Angeles",
    canManage: true,
    presentCount: event.presentCount ?? (event.id === "event-past" ? 18 : 2),
    absentCount: event.absentCount ?? (event.id === "event-past" ? 2 : 0),
    notRecordedCount:
      event.notRecordedCount ??
      (event.id === "event-past"
        ? 1
        : Math.max(0, event.registrationCount - 2)),
    attendanceStatus: event.id === "event-past" ? ("present" as const) : null,
    checkinOpen: false,
  }));
  const hosts = Object.fromEntries(
    events.map((event) => [
      event.id,
      [
        {
          userId: "staff-academic-1",
          displayName: "Bucket L. Manyweather, Ph.D.",
          role: "owner",
        },
      ],
    ]),
  );
  return {
    events,
    hosts,
    notices: [
      {
        id: "student-notice-registration",
        eventId: "event-practical-testing",
        category: "event_registration",
        title: "You are registered",
        body: "Practical Practice Testing is Tuesday, September 15 from 12:00 to 1:00 PM in Innovation Hall Room 210.",
        deepLink: "/app/compass?event=event-practical-testing",
        readAt: null,
        dismissedAt: null,
        createdAt: isoAt(0, 8),
      },
      {
        id: "student-notice-invitation",
        eventId: "event-research-identity",
        category: "event_invitation",
        title: "You are invited",
        body: "Developing Your Research Identity is open for registration on Wednesday, September 23 at noon.",
        deepLink: "/app/compass?event=event-research-identity",
        readAt: null,
        dismissedAt: null,
        createdAt: isoAt(-1, 15),
      },
      {
        id: "student-notice-appointment",
        eventId: null,
        category: "appointment_confirmed",
        title: "Your appointment is confirmed",
        body: "Academic advising with Bucket L. Manyweather, Ph.D. is confirmed for tomorrow at 10:00 AM in Teams.",
        deepLink: "/app/compass",
        readAt: null,
        dismissedAt: null,
        createdAt: isoAt(-1, 9),
      },
      {
        id: "staff-notice-message",
        eventId: "event-practical-testing",
        category: "event_staff_message",
        title: "New event message",
        body: "A student asked a question about Practical Practice Testing.",
        deepLink: "/app/compass?event=event-practical-testing",
        readAt: null,
        dismissedAt: null,
        createdAt: isoAt(0, 9),
      },
      {
        id: "staff-notice-rsvp",
        eventId: "event-research-identity",
        category: "event_staff_digest",
        title: "Developing Your Research Identity activity",
        body: "Registration and waitlist activity is ready for coordinator review.",
        deepLink: "/app/compass?event=event-research-identity",
        readAt: null,
        dismissedAt: null,
        createdAt: isoAt(-1, 11),
      },
    ],
    attendeeRules: Object.fromEntries(
      events.map((event) => [
        event.id,
        [
          {
            id: `${event.id}-24h`,
            type: "reminder",
            offsetMinutes: 1440,
            channels: ["in_app", "email"],
            enabled: true,
            scheduledFor: null,
            generation: 1,
          },
          {
            id: `${event.id}-1h`,
            type: "reminder",
            offsetMinutes: 60,
            channels: ["in_app", "email"],
            enabled: true,
            scheduledFor: null,
            generation: 1,
          },
        ],
      ]),
    ),
    coordinatorRules: Object.fromEntries(
      events.map((event) => [
        event.id,
        [
          {
            activityType: "rsvp",
            deliveryMode: "hourly",
            channels: ["in_app", "email"],
          },
          {
            activityType: "waitlist",
            deliveryMode: "hourly",
            channels: ["in_app", "email"],
          },
          {
            activityType: "event_message",
            deliveryMode: "immediate",
            channels: ["in_app", "email"],
          },
          {
            activityType: "checkin",
            deliveryMode: "hourly",
            channels: ["in_app"],
          },
          {
            activityType: "correction",
            deliveryMode: "immediate",
            channels: ["in_app", "email"],
          },
          {
            activityType: "delivery_failure",
            deliveryMode: "immediate",
            channels: ["in_app"],
          },
          {
            activityType: "event_change",
            deliveryMode: "immediate",
            channels: ["in_app", "email"],
          },
        ],
      ]),
    ),
  };
}

function oacaBootstrap() {
  const events = oacaEvents();
  return {
    services: [
      {
        id: "service-academic",
        key: "academic_advising",
        name: "Academic advising",
        providerRule: "assigned",
        policyStatus: "sandbox_approved",
        modalities: ["in_person", "phone", "teams"],
        durationMinutes: 30,
      },
      {
        id: "service-career",
        key: "career_advising",
        name: "Career advising",
        providerRule: "choice_or_first",
        policyStatus: "sandbox_approved",
        modalities: ["in_person", "phone", "teams"],
        durationMinutes: 30,
      },
      {
        id: "service-tutoring",
        key: "peer_tutoring",
        name: "Peer tutoring",
        providerRule: "choice",
        policyStatus: "sandbox_approved",
        modalities: ["in_person", "teams"],
        durationMinutes: 60,
      },
    ],
    providers: [
      {
        id: "provider-academic",
        displayName: "Bucket L. Manyweather, Ph.D.",
        classification: "staff",
        subjects: [],
        modalities: ["in_person", "phone", "teams"],
        serviceKeys: ["academic_advising"],
      },
      {
        id: "provider-dropin",
        displayName: "Cameron Mastin, M.Ed.",
        classification: "staff",
        subjects: [],
        modalities: ["in_person", "phone", "teams"],
        serviceKeys: ["academic_advising"],
      },
      {
        id: "provider-dropin-2",
        displayName: "Michael O'Leary, M.Ed.",
        classification: "staff",
        subjects: [],
        modalities: ["in_person", "phone", "teams"],
        serviceKeys: ["academic_advising"],
      },
      {
        id: "provider-career",
        displayName: "Art Avila, M.Ed.",
        classification: "staff",
        subjects: [],
        modalities: ["in_person", "teams"],
        serviceKeys: ["career_advising"],
      },
      {
        id: "provider-tutoring-manager",
        displayName: "Dominique Rich, MAT",
        classification: "staff",
        subjects: ["Peer tutor program"],
        modalities: ["in_person", "teams"],
        serviceKeys: ["peer_tutoring"],
      },
      {
        id: "provider-tutor",
        displayName: "Fictional peer tutor",
        classification: "peer_tutor",
        subjects: ["General", "Clinical skills"],
        modalities: ["in_person", "teams"],
        serviceKeys: ["peer_tutoring"],
      },
    ],
    appointments: [
      {
        id: "appointment-completed-1",
        studentId: "student-1",
        studentName: "Taylor Morgan",
        serviceName: "Academic advising",
        providerName: "Bucket L. Manyweather, Ph.D.",
        subject: "Study strategy and weekly planning",
        startsAt: isoAt(-4, 11),
        endsAt: isoAt(-4, 11, 30),
        modality: "in_person",
        status: "completed",
        sandbox: true,
        requestOrigin: "student",
        studentRecap:
          "For the next seven days, use a short retrieval-practice block before reviewing notes, protect two focused study periods, and bring the updated weekly plan to the next check-in.",
      },
      {
        id: "appointment-1",
        studentId: "student-1",
        studentName: "Taylor Morgan",
        serviceName: "Academic advising",
        providerName: "Bucket L. Manyweather, Ph.D.",
        subject: "Foundations 3 check-in",
        startsAt: isoAt(1, 10),
        endsAt: isoAt(1, 10, 30),
        modality: "teams",
        status: "confirmed",
        sandbox: true,
        requestOrigin: "student",
        studentRecap:
          "Review the weekly study plan and return with two questions.",
      },
      {
        id: "appointment-academic-request",
        studentId: "student-2",
        studentName: "Riley Thompson",
        serviceName: "Academic advising",
        providerName: "Bucket L. Manyweather, Ph.D.",
        subject: "Adjusting my study plan",
        startsAt: isoAt(0, 14),
        endsAt: isoAt(0, 14, 30),
        modality: "in_person",
        status: "pending_approval",
        sandbox: true,
        requestOrigin: "student",
      },
      {
        id: "appointment-career-completed",
        studentId: "student-3",
        studentName: "Cameron Ellis",
        serviceName: "Career advising",
        providerName: "Art Avila, M.Ed.",
        subject: "Career exploration and CiM reflection",
        startsAt: isoAt(-8, 15),
        endsAt: isoAt(-8, 15, 30),
        modality: "teams",
        status: "completed",
        sandbox: true,
        requestOrigin: "advisor",
        studentRecap:
          "Complete the CiM interest inventory and bring two specialty questions to the next visit.",
      },
      {
        id: "appointment-career-request",
        studentId: "student-1",
        studentName: "Taylor Morgan",
        serviceName: "Career advising",
        providerName: "Art Avila, M.Ed.",
        subject: "Planning career exploration activities",
        startsAt: isoAt(2, 9),
        endsAt: isoAt(2, 9, 30),
        modality: "teams",
        status: "pending_approval",
        sandbox: true,
        requestOrigin: "student",
      },
      {
        id: "appointment-2",
        studentId: "student-2",
        studentName: "Riley Thompson",
        serviceName: "Peer tutoring",
        providerName: "Fictional peer tutor",
        subject: "General",
        format: "individual",
        startsAt: isoAt(2, 13),
        endsAt: isoAt(2, 14),
        modality: "in_person",
        status: "pending_approval",
        sandbox: true,
        requestOrigin: "student",
      },
    ],
    encounterRecords: [
      {
        appointmentId: "appointment-completed-1",
        workingNotes:
          "Reviewed the student's weekly study schedule and recent use of practice questions. The student identified that review was crowding out retrieval practice. We reorganized the week around two protected study blocks and a brief daily question set. Student was engaged and selected the next actions.",
        studentRecap:
          "For the next seven days, use a short retrieval-practice block before reviewing notes, protect two focused study periods, and bring the updated weekly plan to the next check-in.",
        structuredData: {
          categories: ["learning_strategy"],
          interventions: [
            "Weekly schedule review",
            "Retrieval-practice planning",
          ],
          referrals: [],
          followUp: [
            "Review the updated weekly plan at the next advising visit",
          ],
        },
        revision: 1,
        updatedAt: isoAt(-4, 11, 45),
        publishedAt: isoAt(-4, 11, 45),
      },
      {
        appointmentId: "appointment-career-completed",
        workingNotes:
          "Student reviewed CiM reflection results and identified two areas for further exploration. Discussed informational interviews and ways to compare day-to-day specialty practice without prematurely narrowing options.",
        studentRecap:
          "Complete the CiM interest inventory and bring two specialty questions to the next visit.",
        structuredData: {
          categories: ["career_exploration"],
          interventions: ["CiM reflection", "Specialty exploration planning"],
          referrals: [],
          followUp: ["Review two specialty profiles before the next visit"],
        },
        revision: 1,
        updatedAt: isoAt(-8, 15, 45),
        publishedAt: isoAt(-8, 15, 45),
      },
    ] satisfies SyntheticEncounterRecord[],
    assignedAdvisor: {
      id: "provider-academic",
      displayName: "Bucket L. Manyweather, Ph.D.",
      classification: "staff",
      subjects: [],
      modalities: ["in_person", "phone", "teams"],
      serviceKeys: ["academic_advising"],
    },
    assignedStudents: [
      { id: "student-1", displayName: "Taylor Morgan" },
      { id: "student-2", displayName: "Riley Thompson" },
      { id: "student-3", displayName: "Cameron Ellis" },
    ],
    currentProvider: {
      id: "provider-academic",
      displayName: "Bucket L. Manyweather, Ph.D.",
      classification: "staff",
      subjects: [],
      modalities: ["in_person", "phone", "teams"],
      serviceKeys: ["academic_advising"],
    },
    policyDocuments: [],
    policyRules: [],
    acknowledgments: [],
    obligations: [
      {
        id: "obligation-1",
        studentId: "student-1",
        studentName: "Taylor Morgan",
        ruleKey: "foundations_year_2_check_in",
        title: "Foundations 3 check-in",
        serviceKey: "academic_advising",
        requiredProvider: "assigned_advisor",
        triggeredAt: isoAt(-14, 9),
        dueAt: isoAt(21, 17),
        status: "open",
      },
    ],
    restrictions: [],
    tutorCompliance: {
      application_approved_at: isoAt(-90, 9),
      faculty_recommendation_at: isoAt(-84, 9),
      interview_completed_at: isoAt(-77, 9),
      workday_onboarding_at: isoAt(-70, 9),
      training_completed_at: isoAt(-63, 9),
      handbook_acknowledgment_id: "synthetic-ack",
      eligible_at: isoAt(-60, 9),
      suspended_at: null,
    },
    liveScheduling: false,
    calendarConnected: false,
    canManageImports: true,
    canViewAnalytics: true,
    importBatches: [
      {
        id: "import-1",
        fileId: "synthetic-file",
        sourceSystem: "penji",
        datasetType: "penji_sessions",
        cohortLabel: "Class of 2029",
        periodStartsOn: "2025-08-01",
        periodEndsOn: "2026-09-10",
        containsRealStudentData: false,
        sourceHeaders: ["Student ID", "Event", "Start", "Status"],
        columnMapping: {},
        status: "completed",
        totalRows: 178,
        validRows: 178,
        invalidRows: 0,
        matchedStudents: 76,
        qualitySummary: { note: "Illustrative aggregate only" },
        requestedBy: "synthetic-creator",
        reviewedBy: "synthetic-reviewer",
        reviewedAt: isoAt(-2, 11),
        createdAt: isoAt(-3, 11),
        completedAt: isoAt(-2, 12),
        issues: [],
      },
    ],
    analytics: {
      minimumGroupSize: 10,
      coverageStart: "2025-08-01",
      coverageEnd: "2026-09-10",
      totals: {
        sessions: 178,
        studentCount: 76,
        hours: 142,
        completionRate: 88,
        noShowRate: 3,
        rescheduleRate: 9,
        averageWaitDays: 2.4,
      },
      services: [
        {
          serviceKey: "academic_advising",
          studentCount: 46,
          sessions: 92,
          hours: 46,
          suppressed: false,
        },
        {
          serviceKey: "career_advising",
          studentCount: 31,
          sessions: 44,
          hours: 22,
          suppressed: false,
        },
        {
          serviceKey: "peer_tutoring",
          studentCount: 38,
          sessions: 42,
          hours: 74,
          suppressed: false,
        },
      ],
      cohorts: [
        {
          cohortLabel: "Class of 2029",
          studentCount: 76,
          sessions: 178,
          hours: 142,
          noShowRate: 3,
          suppressed: false,
        },
      ],
    },
    canManageOutreach: true,
    canViewOutreachInsights: true,
    events,
    campaigns: [
      {
        id: "campaign-1",
        name: "Research identity invitation",
        subject: "Develop your research identity",
        previewText: "Reserve a place and bring your questions.",
        status: "sent",
        audience: { cohortLabels: ["Class of 2029"] },
        scheduledFor: null,
        sentAt: isoAt(-4, 9),
        content: { heading: "Develop your research identity" },
        deliveryChannel: "email",
        recipientCount: 76,
        deliveredCount: 73,
        openedCount: 52,
        clickedCount: 34,
        formSubmittedCount: 18,
        eventRegisteredCount: 24,
        appointmentRequestedCount: 11,
        minimumGroupSize: 10,
      },
      {
        id: "campaign-sms-1",
        name: "Practical testing reminder",
        subject: "Practical testing reminder",
        previewText:
          "Practical Practice Testing begins tomorrow at noon in Innovation Hall 210.",
        status: "sent",
        audience: { cohortLabels: ["Class of 2029"] },
        scheduledFor: null,
        sentAt: isoAt(-1, 12),
        content: {
          heading: "Practical testing reminder",
          body: "Practical Practice Testing begins tomorrow at noon in Innovation Hall 210.",
          deliveryChannel: "sms",
        },
        deliveryChannel: "sms",
        recipientCount: 76,
        deliveredCount: 61,
        openedCount: 0,
        clickedCount: 0,
        formSubmittedCount: 0,
        eventRegisteredCount: 0,
        appointmentRequestedCount: 0,
        minimumGroupSize: 10,
      },
    ],
    nudges: [
      {
        id: "nudge-1",
        studentId: "student-1",
        studentName: "Taylor Morgan",
        serviceKey: "career_advising",
        providerName: "Art Avila, M.Ed.",
        dueBy: isoAt(14, 17),
        status: "delivered",
        createdAt: isoAt(-2, 10),
      },
    ],
    communications: [],
    forms: [],
    audienceOptions: {
      cohorts: ["Class of 2029"],
      phases: ["Foundations", "Clerkship", "Advanced"],
      years: ["M1", "M2", "M3", "M4"],
      campuses: ["Summerlin", "Henderson"],
    },
    eventNotificationUnreadCount: 3,
  };
}

type SyntheticAdvisorState = {
  tasks: Array<{
    id: string;
    studentId: string;
    studentName: string;
    title: string;
    assignedTo: "student" | "advisor" | "staff";
    dueAt: string | null;
    status: "open" | "completed";
    appointmentId?: string | null;
  }>;
  messages: Array<{
    id: string;
    studentId: string;
    studentName: string;
    senderName: string;
    body: string;
    createdAt: string;
    assignedToName: string | null;
    unread: boolean;
  }>;
  addenda: Array<{
    id: string;
    appointmentId: string;
    authorName: string;
    body: string;
    createdAt: string;
  }>;
  roadmapCompletions: Array<{
    studentId: string;
    itemKey: string;
    completedAt: string;
    completedByName: string;
  }>;
  templates: Array<{
    id: string;
    name: string;
    kind: "form" | "note" | "study_plan";
    version: number;
    authorName: string;
  }>;
  savedReports: Array<{
    id: string;
    name: string;
    workspace: "academic" | "career";
    createdAt: string;
  }>;
  plans: Array<{
    id: string;
    studentId: string;
    title: string;
    content: string;
    version: number;
    createdAt: string;
  }>;
  availability: Record<string, unknown>;
  completedObligationIds: string[];
  attentionFlags: Array<{
    id: string;
    studentId: string;
    label: string;
    createdAt: string;
  }>;
};

const syntheticAdvisorStorageKey = "navigate.compass.synthetic-advisor.v1";

function defaultSyntheticAdvisorState(): SyntheticAdvisorState {
  return {
    tasks: [
      {
        id: "task-1",
        studentId: "student-1",
        studentName: "Taylor Morgan",
        title: "Upload revised weekly study plan",
        assignedTo: "student",
        dueAt: isoAt(3, 12).slice(0, 10),
        status: "open",
        appointmentId: "appointment-completed-1",
      },
      {
        id: "task-2",
        studentId: "student-3",
        studentName: "Cameron Ellis",
        title: "Review CiM interest inventory before follow-up",
        assignedTo: "student",
        dueAt: isoAt(7, 12).slice(0, 10),
        status: "open",
        appointmentId: "appointment-career-completed",
      },
      {
        id: "task-3",
        studentId: "student-2",
        studentName: "Riley Thompson",
        title: "Send learning-strategy worksheet",
        assignedTo: "advisor",
        dueAt: isoAt(0, 12).slice(0, 10),
        status: "open",
      },
    ],
    messages: [
      {
        id: "advisor-message-1",
        studentId: "student-1",
        studentName: "Taylor Morgan",
        senderName: "Taylor Morgan",
        body: "I updated the weekly plan. Could we review whether the practice-question blocks are spaced well?",
        createdAt: isoAt(0, 8),
        assignedToName: "Bucket L. Manyweather, Ph.D.",
        unread: true,
      },
      {
        id: "advisor-message-2",
        studentId: "student-2",
        studentName: "Riley Thompson",
        senderName: "Riley Thompson",
        body: "Would the in-person appointment location be the Student Affairs suite?",
        createdAt: isoAt(-1, 16),
        assignedToName: "Bucket L. Manyweather, Ph.D.",
        unread: true,
      },
      {
        id: "advisor-message-3",
        studentId: "student-3",
        studentName: "Cameron Ellis",
        senderName: "Art Avila, M.Ed.",
        body: "Your career exploration recap is published. Bring two questions when we meet next.",
        createdAt: isoAt(-7, 10),
        assignedToName: "Art Avila, M.Ed.",
        unread: false,
      },
    ],
    addenda: [
      {
        id: "addendum-1",
        appointmentId: "appointment-completed-1",
        authorName: "Cameron Mastin, M.Ed.",
        body: "Student later attended a drop-in and confirmed that the revised schedule is workable for this block.",
        createdAt: isoAt(-2, 15),
      },
    ],
    roadmapCompletions: [
      {
        studentId: "student-3",
        itemKey: "career_y1_cim_understand",
        completedAt: isoAt(-30, 12),
        completedByName: "Art Avila, M.Ed.",
      },
      {
        studentId: "student-3",
        itemKey: "career_y1_sessions",
        completedAt: isoAt(-14, 12),
        completedByName: "Art Avila, M.Ed.",
      },
    ],
    templates: [
      {
        id: "template-study-1",
        name: "Weekly learning plan",
        kind: "study_plan",
        version: 3,
        authorName: "Bucket L. Manyweather, Ph.D.",
      },
      {
        id: "template-note-1",
        name: "Advising visit note",
        kind: "note",
        version: 2,
        authorName: "Cameron Mastin, M.Ed.",
      },
      {
        id: "template-form-1",
        name: "Career exploration reflection",
        kind: "form",
        version: 1,
        authorName: "Art Avila, M.Ed.",
      },
    ],
    savedReports: [
      {
        id: "report-1",
        name: "Current academic advising demand",
        workspace: "academic",
        createdAt: isoAt(-3, 9),
      },
    ],
    plans: [
      {
        id: "plan-1",
        studentId: "student-1",
        title: "Weekly learning plan",
        content:
          "Retrieval practice, protected study blocks, and a Friday reflection.",
        version: 2,
        createdAt: isoAt(-4, 12),
      },
    ],
    availability: {
      weekdays: [1, 2, 3, 4, 5],
      startsAt: "09:00",
      endsAt: "16:30",
      bufferMinutes: 10,
      modalities: ["in_person", "teams", "phone"],
    },
    completedObligationIds: [],
    attentionFlags: [
      {
        id: "private-flag-1",
        studentId: "student-2",
        label: "Ask about preferred follow-up format",
        createdAt: isoAt(-1, 11),
      },
    ],
  };
}

function advisorPreviewBootstrap(
  persona: SyntheticPersonaKey,
  workspace: "academic" | "career",
  state: SyntheticAdvisorState,
  appointments: SyntheticAppointment[],
  records: SyntheticEncounterRecord[] = oacaBootstrap().encounterRecords,
) {
  const source = oacaBootstrap();
  const allowedWorkspaces: ("academic" | "career")[] =
    persona === "career_advisor"
      ? ["career"]
      : persona === "academic_advisor" || persona === "compass_staff"
        ? ["academic"]
        : ["academic", "career"];
  const activeWorkspace = allowedWorkspaces.includes(workspace)
    ? workspace
    : allowedWorkspaces[0];
  const currentAdvisorName =
    persona === "career_advisor"
      ? "Art Avila, M.Ed."
      : persona === "compass_director"
        ? "Director of Academic and Career Advising"
        : persona === "platform_creator"
          ? "Creator preview"
          : "Bucket L. Manyweather, Ph.D.";
  const students = [
    {
      id: "student-1",
      displayName: "Taylor Morgan",
      cohortLabel: "Class of 2029",
      phase: "Foundational phase",
      year: "M2",
      campus: "Summerlin",
      assignedAdvisorName: "Bucket L. Manyweather, Ph.D.",
    },
    {
      id: "student-2",
      displayName: "Riley Thompson",
      cohortLabel: "Class of 2029",
      phase: "Foundational phase",
      year: "M2",
      campus: "Summerlin",
      assignedAdvisorName: "Bucket L. Manyweather, Ph.D.",
    },
    {
      id: "student-3",
      displayName: "Cameron Ellis",
      cohortLabel: "Class of 2029",
      phase: "Foundational phase",
      year: "M2",
      campus: "Summerlin",
      assignedAdvisorName: "Michael O'Leary, M.Ed.",
    },
    {
      id: "student-4",
      displayName: "Alexis Nguyen",
      cohortLabel: "Class of 2030",
      phase: "Foundational phase",
      year: "M1",
      campus: "Summerlin",
      assignedAdvisorName: "Cameron Mastin, M.Ed.",
    },
  ].map((student, index) => {
    const visits = appointments.filter((item) => item.studentId === student.id);
    const relationship =
      activeWorkspace === "career"
        ? "career_service"
        : index < 2
          ? "assigned"
          : index === 2
            ? "drop_in"
            : "outside_caseload";
    return {
      ...student,
      relationship,
      lastVisitAt:
        visits.find((item) => item.status === "completed")?.startsAt || null,
      nextVisitAt:
        visits.find((item) => item.status === "confirmed")?.startsAt || null,
      openMilestones: student.id === "student-1" ? 1 : 0,
      openTasks: state.tasks.filter(
        (item) => item.studentId === student.id && item.status === "open",
      ).length,
      noShows: student.id === "student-4" ? 1 : 0,
    };
  });
  const serviceName =
    activeWorkspace === "academic" ? "Academic advising" : "Career advising";
  const pending = appointments.filter(
    (item) =>
      item.serviceName === serviceName &&
      ["pending_approval", "counterproposed"].includes(item.status),
  ).length;
  return {
    allowedWorkspaces,
    activeWorkspace,
    currentAdvisorName,
    students,
    tasks: state.tasks,
    messages: state.messages,
    addenda: state.addenda,
    roadmapCompletions: state.roadmapCompletions,
    templates: state.templates,
    savedReports: state.savedReports,
    minimumGroupSize: 10,
    appointments: appointments.filter((item) =>
      item.serviceName.toLowerCase().includes(activeWorkspace),
    ),
    encounterRecords: records.filter((item) =>
      appointments.some(
        (appointment) =>
          appointment.id === item.appointmentId &&
          appointment.serviceName.toLowerCase().includes(activeWorkspace),
      ),
    ),
    obligations: source.obligations.map((item) => ({
      ...item,
      status: state.completedObligationIds.includes(item.id)
        ? "completed"
        : item.status,
    })),
    attentionFlags: state.attentionFlags,
    attention: [
      {
        key: "pending_request",
        label: "Appointment requests awaiting a decision",
        count: pending,
      },
      ...(activeWorkspace === "academic"
        ? [
            {
              key: "milestone_due",
              label: "Required milestone steps due soon",
              count: 1,
            },
          ]
        : []),
      {
        key: "task_due",
        label: "Open actions due today or overdue",
        count: state.tasks.filter(
          (item) =>
            item.status === "open" && item.dueAt <= isoAt(0, 12).slice(0, 10),
        ).length,
      },
      {
        key: "no_show",
        label: "No-shows awaiting a follow-up choice",
        count: 1,
      },
      {
        key: "unread_message",
        label: "Unread student messages",
        count: state.messages.filter((item) => item.unread).length,
      },
    ],
  };
}

function syntheticRoster(event?: SyntheticEvent) {
  const total = Math.min(event?.registrationCount || 3, 76);
  const present = event?.presentCount ?? 2;
  const absent = event?.absentCount ?? 0;
  return Array.from({ length: total }, (_, index) => ({
    studentId: `synthetic-student-${String(index + 1).padStart(2, "0")}`,
    displayName: `Synthetic student ${String(index + 1).padStart(2, "0")}`,
    registrationStatus:
      index < present
        ? "attended"
        : index < present + absent
          ? "no_show"
          : "registered",
    registrationSource: event?.sourceSystem === "penji" ? "import" : "self",
    attendanceStatus:
      index < present
        ? "present"
        : index < present + absent
          ? "absent"
          : "not_recorded",
    attendanceSource:
      event?.sourceSystem === "penji"
        ? "import"
        : index < present
          ? "staff"
          : null,
    version: index < present + absent ? 1 : 0,
    updatedAt: event?.endsAt || new Date().toISOString(),
  }));
}

function eventWorkspace(state: SyntheticEventState, selectedId = "") {
  const selected = state.events.find((event) => event.id === selectedId);
  return {
    events: state.events,
    roster: selected ? syntheticRoster(selected) : [],
    hosts: selected ? state.hosts[selected.id] || [] : [],
    staffOptions: syntheticStaff,
    audienceOptions: {
      cohorts: ["Class of 2029", "Class of 2030"],
      phases: ["Foundations", "Clerkship", "Advanced"],
      years: ["M1", "M2", "M3", "M4"],
      campuses: ["Summerlin", "Henderson"],
      organizations: organizations
        .slice(0, 18)
        .map((item) => ({
          id: item.id,
          name: item.name,
          college: item.college,
        })),
      memberRoles: [
        { key: "student", label: "Students" },
        { key: "faculty", label: "Faculty" },
        { key: "staff", label: "Staff" },
        { key: "administrator", label: "Administrators" },
      ],
      people: syntheticPeople,
      providers: [
        {
          id: "provider-academic",
          displayName: "Bucket L. Manyweather, Ph.D.",
        },
        { id: "provider-dropin", displayName: "Cameron Mastin, M.Ed." },
        { id: "provider-dropin-2", displayName: "Michael O'Leary, M.Ed." },
      ],
    },
    recipientVersion: selected?.status === "published" ? 1 : 0,
    recipientCount: selected?.audience?.includeAllMembers
      ? 126
      : selected?.registrationCount || 0,
    coordinatorAlertRules: selected
      ? state.coordinatorRules[selected.id] || []
      : [],
    activity: selected
      ? [
          {
            id: "activity-1",
            eventId: selected.id,
            activityType: "rsvp",
            summary:
              "Registration activity is available to event coordinators.",
            createdAt: isoAt(-1, 10),
          },
        ]
      : [],
    corrections: selected
      ? [
          {
            id: "correction-1",
            eventId: selected.id,
            studentId: "synthetic-student-02",
            displayName: "Synthetic student 02",
            requestedStatus: "present",
            explanation: "I checked in with event staff at the door.",
            status: "open",
            createdAt: isoAt(-1, 9),
          },
        ]
      : [],
    notifications: state.notices.filter((notice) => !notice.dismissedAt),
    preferences: {
      emailEnabled: true,
      smsEnabled: false,
      phoneVerified: false,
      quietHoursStart: "21:00:00",
      quietHoursEnd: "07:00:00",
      timezone: "America/Los_Angeles",
    },
    pushSubscriptions: [],
    notificationRules: selected ? state.attendeeRules[selected.id] || [] : [],
    deliveries: {
      queued: 3,
      suppressed: 2,
      sent: 72,
      delivered: 70,
      failed: 2,
      opened: 46,
      clicked: 21,
      replied: 4,
    },
    threads: selected
      ? [
          {
            id: `thread-${selected.id}`,
            studentId: "synthetic-student-01",
            studentName: "Synthetic student 01",
            messages: [
              {
                id: `message-${selected.id}`,
                senderId: "synthetic-student-01",
                body: "Where should I check in?",
                direction: "inbound",
                channel: "sms",
                createdAt: isoAt(0, 9),
              },
            ],
          },
        ]
      : [],
    unreadCount: state.notices.filter(
      (notice) => !notice.readAt && !notice.dismissedAt,
    ).length,
  };
}

type SyntheticAffiliation = {
  id: string;
  studentId: string;
  studentName: string;
  organizationId: string;
  organizationName: string;
  status: "pending" | "approved" | "declined" | "ended";
  requestedAt: string;
  reviewedAt: string | null;
  reviewerName: string | null;
  reviewNote: string | null;
  requestContext: string;
};
type SyntheticImpactEvent = {
  id: string;
  title: string;
  objective: string;
  organizationId: string;
  organizationName: string;
  status: string;
  startsAt: string | null;
  mentorApprovedAt: string | null;
  liaisonApprovedAt: string | null;
  submittedAt: string | null;
  reviewerFeedback: string | null;
};
type SyntheticImpactNotification = {
  id: string;
  title: string;
  body: string;
  eventId: string;
  readAt: string | null;
  createdAt: string;
};

function defaultSyntheticAffiliations(): SyntheticAffiliation[] {
  const organizationId = medicineOrganization?.id || "medicine-organization";
  const organizationName =
    medicineOrganization?.name || "College of Medicine student organization";
  return [
    {
      id: "affiliation-pending",
      studentId: "synthetic-compass-student",
      studentName: "Taylor Morgan",
      organizationId,
      organizationName,
      status: "pending",
      requestedAt: isoAt(-2, 10),
      reviewedAt: null,
      reviewerName: null,
      reviewNote: null,
      requestContext:
        "I participate in the group and want to develop a community initiative.",
    },
    {
      id: "affiliation-approved",
      studentId: "synthetic-impact-student",
      studentName: "Taylor Morgan",
      organizationId,
      organizationName,
      status: "approved",
      requestedAt: isoAt(-40, 10),
      reviewedAt: isoAt(-38, 14),
      reviewerName: "Cameron Brooks",
      reviewNote: "Verified against the organization roster.",
      requestContext: "Active member for the current academic year.",
    },
  ];
}

function defaultSyntheticImpactEvents(): SyntheticImpactEvent[] {
  const organizationId = medicineOrganization?.id || "medicine-organization";
  const organizationName =
    medicineOrganization?.name || "College of Medicine student organization";
  return [
    {
      id: "impact-event-1",
      title: "Community listening circle",
      objective: "Listen before defining the next screening initiative.",
      organizationId,
      organizationName,
      status: "mentor_approved",
      startsAt: isoAt(10, 17),
      mentorApprovedAt: isoAt(-1, 13),
      liaisonApprovedAt: null,
      submittedAt: isoAt(-2, 10),
      reviewerFeedback:
        "Mentor review complete; Community Liaison decision is pending.",
    },
    {
      id: "impact-event-2",
      title: "Neighborhood health resource exchange",
      objective: "Share community-defined referral resources.",
      organizationId,
      organizationName,
      status: "published",
      startsAt: isoAt(21, 11),
      mentorApprovedAt: isoAt(-8, 10),
      liaisonApprovedAt: isoAt(-7, 15),
      submittedAt: isoAt(-10, 10),
      reviewerFeedback: null,
    },
  ];
}

function genesisBootstrap(
  persona: SyntheticPersonaKey,
  affiliations: SyntheticAffiliation[],
  impactEvents: SyntheticImpactEvent[],
  impactNotifications: SyntheticImpactNotification[],
) {
  const organizationName =
    medicineOrganization?.name || "College of Medicine student organization";
  const organizationId = medicineOrganization?.id || "medicine-organization";
  const portfolio = {
    id: "portfolio-1",
    title: "Neighborhood blood-pressure access initiative",
    organizationId,
    organizationName,
    currentVersion: 4,
    status: "mentor_review",
    content: {
      point_of_view:
        "I want to understand barriers before proposing a service, and I need residents to define what useful access means.",
      problem_of_practice:
        "Residents in the selected Nevada neighborhood report inconsistent access to blood-pressure screening and follow-up.",
      community_context:
        "Local clinics, libraries, faith communities, and resident leaders are assets. Listening must precede program design.",
      theory_of_change:
        "If partners co-design accessible screening and referral touchpoints, more residents can connect to sustained primary care.",
      sustainability:
        "Document partner roles, recurring costs, referral ownership, and a student-to-student succession rhythm.",
    },
  };
  const context = syntheticContextForPersona(persona);
  const staff = [
    "impact_administrator",
    "community_liaison",
    "platform_creator",
  ].includes(persona);
  const ownAffiliations = affiliations.filter(
    (item) => item.studentId === context.userId,
  );
  const approved = ownAffiliations.filter((item) => item.status === "approved");
  return {
    organizations,
    portfolios: staff || persona === "impact_student" ? [portfolio] : [],
    reviews: staff ? [portfolio] : [],
    snapshots:
      staff || persona === "impact_student"
        ? [
            {
              id: "snapshot-1",
              title: "Community listening summary · version 3",
              publishedAt: isoAt(-12, 10),
              authorName: "Taylor Morgan",
            },
          ]
        : [],
    handoffs:
      staff || persona === "impact_student"
        ? [
            {
              id: "handoff-1",
              title: "Spring continuation package",
              status: "offered",
              nextSteward: "Riley Thompson",
            },
          ]
        : [],
    events: impactEvents,
    calendarEvents: impactEvents.filter((item) => item.status === "published"),
    affiliations: ownAffiliations,
    approvedOrganizationIds: approved.map((item) => item.organizationId),
    accessStatus: approved.length
      ? "active"
      : ownAffiliations.some((item) => item.status !== "ended")
        ? "pending"
        : "read_only",
    canEdit: approved.length > 0 || staff,
    accessQueue: staff
      ? affiliations.filter((item) => item.status === "pending")
      : [],
    notifications: [
      "community_liaison",
      "impact_administrator",
      "platform_creator",
    ].includes(persona)
      ? impactNotifications
      : [],
  };
}

class SyntheticPilotApi {
  private affiliations = defaultSyntheticAffiliations();
  private studentCouncilByPersona: Record<string, boolean> = {
    compass_student: true,
    impact_student: false,
  };
  private impactEvents = defaultSyntheticImpactEvents();
  private impactNotifications: SyntheticImpactNotification[] = [
    {
      id: "impact-notice-1",
      title: "Impact event needs a Liaison decision",
      body: "Community listening circle completed mentor review.",
      eventId: "impact-event-1",
      readAt: null,
      createdAt: isoAt(-1, 13),
    },
  ];
  private impactLoaded = false;
  private appointments: SyntheticAppointment[] = oacaBootstrap().appointments;
  private encounterRecords: SyntheticEncounterRecord[] =
    oacaBootstrap().encounterRecords;
  private encountersLoaded = false;
  private advisorState: SyntheticAdvisorState = defaultSyntheticAdvisorState();
  private advisorLoaded = false;
  private eventState: SyntheticEventState = defaultSyntheticEventState();
  private eventsLoaded = false;

  private ensureEncountersLoaded() {
    if (this.encountersLoaded) return;
    this.encountersLoaded = true;
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(syntheticEncounterStorageKey) || "null",
      ) as SyntheticEncounterRecord[] | null;
      if (Array.isArray(saved)) this.encounterRecords = saved;
    } catch {
      this.encounterRecords = oacaBootstrap().encounterRecords;
    }
  }

  private saveEncounters() {
    if (typeof window !== "undefined")
      window.localStorage.setItem(
        syntheticEncounterStorageKey,
        JSON.stringify(this.encounterRecords),
      );
  }

  private ensureAdvisorLoaded() {
    if (this.advisorLoaded) return;
    this.advisorLoaded = true;
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(syntheticAdvisorStorageKey) || "null",
      ) as
        | (Partial<SyntheticAdvisorState> & {
            appointments?: SyntheticAppointment[];
          })
        | null;
      if (saved) {
        const defaults = defaultSyntheticAdvisorState();
        this.advisorState = {
          ...defaults,
          ...saved,
          tasks: Array.isArray(saved.tasks) ? saved.tasks : defaults.tasks,
          messages: Array.isArray(saved.messages)
            ? saved.messages
            : defaults.messages,
          addenda: Array.isArray(saved.addenda)
            ? saved.addenda
            : defaults.addenda,
          roadmapCompletions: Array.isArray(saved.roadmapCompletions)
            ? saved.roadmapCompletions
            : defaults.roadmapCompletions,
          templates: Array.isArray(saved.templates)
            ? saved.templates
            : defaults.templates,
          savedReports: Array.isArray(saved.savedReports)
            ? saved.savedReports
            : defaults.savedReports,
          plans: Array.isArray(saved.plans) ? saved.plans : defaults.plans,
        };
        if (Array.isArray(saved.appointments))
          this.appointments = saved.appointments;
      }
    } catch {
      this.advisorState = defaultSyntheticAdvisorState();
    }
  }

  private saveAdvisor() {
    if (typeof window !== "undefined")
      window.localStorage.setItem(
        syntheticAdvisorStorageKey,
        JSON.stringify({
          ...this.advisorState,
          appointments: this.appointments,
        }),
      );
  }

  private ensureEventsLoaded() {
    if (this.eventsLoaded) return;
    this.eventsLoaded = true;
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(syntheticEventStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<SyntheticEventState>;
        const defaults = defaultSyntheticEventState();
        const savedEvents = Array.isArray(parsed.events)
          ? parsed.events.filter((event): event is SyntheticEvent =>
              Boolean(
                event &&
                  typeof event.id === "string" &&
                  typeof event.title === "string",
              ),
            )
          : [];
        const savedIds = new Set(savedEvents.map((event) => event.id));
        const requiredHistory = defaults.events.filter(
          (event) => event.sourceSystem === "penji" && !savedIds.has(event.id),
        );
        this.eventState = {
          events: [...savedEvents, ...requiredHistory],
          hosts: { ...defaults.hosts, ...(parsed.hosts || {}) },
          notices: Array.isArray(parsed.notices)
            ? parsed.notices
            : defaults.notices,
          attendeeRules: {
            ...defaults.attendeeRules,
            ...(parsed.attendeeRules || {}),
          },
          coordinatorRules: {
            ...defaults.coordinatorRules,
            ...(parsed.coordinatorRules || {}),
          },
        };
      }
    } catch {
      this.eventState = defaultSyntheticEventState();
    }
  }

  private saveEvents() {
    if (typeof window !== "undefined")
      window.localStorage.setItem(
        syntheticEventStorageKey,
        JSON.stringify(this.eventState),
      );
  }

  private ensureImpactLoaded() {
    if (this.impactLoaded) return;
    this.impactLoaded = true;
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(syntheticImpactStorageKey) || "null",
      ) as {
        affiliations?: SyntheticAffiliation[];
        events?: SyntheticImpactEvent[];
        notifications?: SyntheticImpactNotification[];
        studentCouncil?: Record<string, boolean>;
      } | null;
      if (saved?.affiliations) this.affiliations = saved.affiliations;
      if (saved?.events) this.impactEvents = saved.events;
      if (saved?.notifications) this.impactNotifications = saved.notifications;
      if (saved?.studentCouncil)
        this.studentCouncilByPersona = saved.studentCouncil;
    } catch {
      /* Invalid local preview state falls back to known fictional records. */
    }
  }

  private saveImpact() {
    if (typeof window !== "undefined")
      window.localStorage.setItem(
        syntheticImpactStorageKey,
        JSON.stringify({
          affiliations: this.affiliations,
          events: this.impactEvents,
          notifications: this.impactNotifications,
          studentCouncil: this.studentCouncilByPersona,
        }),
      );
  }

  private previewAudience(audience: OacaAudience) {
    const exclusions = new Set(audience.excludeUserIds || []);
    let count = audience.includeAllMembers ? 126 : 0;
    if (!count) {
      count +=
        (audience.includeAllStudents ? 91 : 0) +
        (audience.cohortLabels?.length || 0) * 46 +
        (audience.phases?.length || 0) * 34 +
        (audience.years?.length || 0) * 24 +
        (audience.campuses?.length || 0) * 60;
      count +=
        (audience.organizationIds?.length || 0) * 12 +
        (audience.studentCouncil ? 9 : 0) +
        (audience.memberRoles?.length || 0) * 14 +
        (audience.assignedProviderIds?.length || 0) * 28;
      count +=
        (audience.studentIds?.length || 0) + (audience.userIds?.length || 0);
      count = Math.min(126, count);
    }
    count = Math.max(0, count - exclusions.size);
    return {
      count,
      sample: syntheticPeople
        .filter((person) => !exclusions.has(person.userId))
        .slice(0, 6),
      excludedCount: exclusions.size,
    };
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    this.ensureEventsLoaded();
    this.ensureImpactLoaded();
    this.ensureAdvisorLoaded();
    const route = path.split("?")[0];
    const method = (options.method || "GET").toUpperCase();
    const persona = getSyntheticPreviewPersona();
    const context = syntheticContextForPersona(persona);
    const personaMemberships = syntheticMembershipsForPersona(persona);
    const requiredExperience = route.startsWith("/api/oaca/")
      ? "oaca"
      : route.startsWith("/api/genesis/")
        ? "genesis"
        : null;
    if (
      requiredExperience &&
      !personaMemberships.some(
        (item) => item.experienceKey === requiredExperience,
      )
    )
      throw new Error(
        "This preview role is not authorized for that workspace.",
      );
    const oacaRoles =
      personaMemberships.find((item) => item.experienceKey === "oaca")?.roles ||
      [];
    const oacaStudentOnly =
      oacaRoles.length > 0 && oacaRoles.every((role) => role === "student");
    const staffOnlyOacaRoutes = [
      "/api/oaca/advisor",
      "/api/oaca/events/audience-preview",
      "/api/oaca/events/recipients/refresh",
      "/api/oaca/events/update",
      "/api/oaca/events/publish",
      "/api/oaca/events/hosts",
      "/api/oaca/event-imports",
      "/api/oaca/event-notification-rules",
      "/api/oaca/event-coordinator-alert-rules",
      "/api/oaca/campaigns",
      "/api/oaca/imports",
      "/api/oaca/analytics",
      "/api/oaca/appointments/on-behalf",
      "/api/oaca/appointment-decisions",
      "/api/oaca/records",
    ];
    if (
      oacaStudentOnly &&
      staffOnlyOacaRoutes.some((prefix) => route.startsWith(prefix))
    )
      throw new Error(
        "Student preview responses cannot access staff records or actions.",
      );
    if (path === "/api/platform/experiences")
      return clone({ context, memberships: personaMemberships }) as T;
    if (route === "/api/platform/workspace-preference") {
      const key = "navigate.last-workspace";
      if (method === "POST" && typeof window !== "undefined")
        window.localStorage.setItem(
          key,
          String(
            (options.body as { lastWorkspaceKey?: string })?.lastWorkspaceKey ||
              "compass",
          ),
        );
      return {
        lastWorkspaceKey:
          typeof window !== "undefined"
            ? window.localStorage.getItem(key)
            : null,
      } as T;
    }
    if (path === "/api/platform/affiliations") {
      if (!personaMemberships.some((item) => item.roles.includes("student")))
        return clone({
          isStudent: false,
          organizations: [],
          affiliations: [],
          studentCouncil: false,
          impactAccessStatus: "locked",
          impactHref: null,
        }) as T;
      if (method === "POST") {
        const body = options.body as
          | { organizationIds?: string[]; studentCouncil?: boolean }
          | undefined;
        const selected = new Set(body?.organizationIds || []);
        const current = this.affiliations.filter(
          (item) => item.studentId === context.userId,
        );
        for (const item of current)
          if (
            !selected.has(item.organizationId) &&
            ["pending", "approved"].includes(item.status)
          )
            item.status = "ended";
        for (const organizationId of selected)
          if (
            !current.some(
              (item) =>
                item.organizationId === organizationId &&
                ["pending", "approved"].includes(item.status),
            )
          ) {
            const organization = organizations.find(
              (item) => item.id === organizationId,
            );
            this.affiliations.push({
              id: `affiliation-${crypto.randomUUID()}`,
              studentId: context.userId,
              studentName: context.displayName,
              organizationId,
              organizationName: organization?.name || "Student organization",
              status: "pending",
              requestedAt: new Date().toISOString(),
              reviewedAt: null,
              reviewerName: null,
              reviewNote: null,
              requestContext: "Submitted through the Compass student profile.",
            });
          }
        this.studentCouncilByPersona[persona] = Boolean(body?.studentCouncil);
        this.saveImpact();
      }
      const own = this.affiliations.filter(
        (item) => item.studentId === context.userId,
      );
      const hasApproved = own.some((item) => item.status === "approved");
      const hasEndedApproval = own.some(
        (item) => item.status === "ended" && item.reviewedAt,
      );
      return clone({
        isStudent: true,
        organizations: organizations.map(
          ({ id, key, name, college, campus, aliases }) => ({
            id,
            key,
            name,
            college,
            campus,
            aliases,
          }),
        ),
        affiliations: own,
        studentCouncil: Boolean(this.studentCouncilByPersona[persona]),
        impactAccessStatus: hasApproved
          ? "active"
          : hasEndedApproval
            ? "read_only"
            : "locked",
        impactHref:
          hasApproved || hasEndedApproval ? "/app/compass/impact" : null,
      }) as T;
    }
    if (route === "/api/oaca/advisor/bootstrap") {
      const requested =
        new URL(path, "https://preview.local").searchParams.get("workspace") ===
        "career"
          ? "career"
          : "academic";
      return clone(
        advisorPreviewBootstrap(
          persona,
          requested,
          this.advisorState,
          this.appointments,
          this.encounterRecords,
        ),
      ) as T;
    }
    if (route === "/api/oaca/advisor/appointments" && method === "POST") {
      const body = options.body as {
        workspace?: "academic" | "career";
        studentId?: string;
        startsAt?: string;
        modality?: string;
        topic?: string;
        confirmationMode?: "confirmed" | "student_confirmation";
        recurrence?: "none" | "weekly" | "monthly";
        recurrenceCount?: number;
      };
      const workspace = body.workspace === "career" ? "career" : "academic";
      const bootstrap = advisorPreviewBootstrap(
        persona,
        workspace,
        this.advisorState,
        this.appointments,
      );
      const student = bootstrap.students.find(
        (item) => item.id === body.studentId,
      );
      if (!student || !body.startsAt)
        throw new Error("Choose a student and appointment time.");
      const count =
        body.recurrence && body.recurrence !== "none"
          ? Math.min(24, Math.max(2, Number(body.recurrenceCount) || 2))
          : 1;
      const seed = new Date(body.startsAt);
      const created: SyntheticAppointment[] = [];
      for (let index = 0; index < count; index += 1) {
        const starts = new Date(seed);
        if (body.recurrence === "weekly")
          starts.setDate(starts.getDate() + index * 7);
        if (body.recurrence === "monthly")
          starts.setMonth(starts.getMonth() + index);
        const ends = new Date(starts.getTime() + 30 * 60 * 1000);
        created.push({
          id: `advisor-appointment-${crypto.randomUUID()}`,
          studentId: student.id,
          studentName: student.displayName,
          serviceName:
            workspace === "career" ? "Career advising" : "Academic advising",
          providerName:
            workspace === "career"
              ? "Art Avila, M.Ed."
              : "Bucket L. Manyweather, Ph.D.",
          subject: body.topic || "Advisor-created visit",
          startsAt: starts.toISOString(),
          endsAt: ends.toISOString(),
          modality: body.modality || "teams",
          status:
            body.confirmationMode === "student_confirmation"
              ? "pending_approval"
              : "confirmed",
          sandbox: true,
          requestOrigin: "advisor",
        });
      }
      this.appointments = [...created, ...this.appointments];
      this.saveAdvisor();
      return clone({
        id: created[0].id,
        status: created[0].status,
        occurrenceCount: created.length,
      }) as T;
    }
    if (route === "/api/oaca/advisor/student-timeline" && method === "POST")
      return clone({
        studentId: (options.body as { studentId?: string })?.studentId,
        audited: true,
        recordsScoped: true,
      }) as T;
    if (route === "/api/oaca/advisor/attention-flags" && method === "POST") {
      const body = options.body as { studentId?: string; label?: string };
      if (!body.studentId || !body.label?.trim())
        throw new Error("Choose a student and enter a private reminder.");
      const item = {
        id: `private-flag-${crypto.randomUUID()}`,
        studentId: body.studentId,
        label: body.label.trim(),
        createdAt: new Date().toISOString(),
      };
      this.advisorState.attentionFlags.unshift(item);
      this.saveAdvisor();
      return clone(item) as T;
    }
    if (route === "/api/oaca/appointment-decisions" && method === "POST") {
      const body = options.body as {
        appointmentId?: string;
        decision?: string;
      };
      const appointment = this.appointments.find(
        (item) => item.id === body.appointmentId,
      );
      if (!appointment)
        throw new Error("That appointment is no longer available.");
      appointment.status =
        body.decision === "confirm"
          ? "confirmed"
          : body.decision === "decline"
            ? "declined"
            : body.decision === "complete"
              ? "completed"
              : body.decision === "no_show"
                ? "no_show"
                : appointment.status;
      this.saveAdvisor();
      return clone(appointment) as T;
    }
    if (route === "/api/oaca/advisor/quick-encounters" && method === "POST") {
      const body = options.body as {
        workspace?: "academic" | "career";
        studentId?: string;
        occurredAt?: string;
        topic?: string;
        modality?: string;
      };
      const bootstrap = advisorPreviewBootstrap(
        persona,
        body.workspace === "career" ? "career" : "academic",
        this.advisorState,
        this.appointments,
      );
      const student = bootstrap.students.find(
        (item) => item.id === body.studentId,
      );
      if (!student)
        throw new Error("Choose a student for the quick encounter.");
      const appointment: SyntheticAppointment = {
        id: `quick-encounter-${crypto.randomUUID()}`,
        studentId: student.id,
        studentName: student.displayName,
        serviceName:
          body.workspace === "career" ? "Career advising" : "Academic advising",
        providerName: context.displayName,
        subject: body.topic || "Quick encounter",
        startsAt: body.occurredAt
          ? new Date(body.occurredAt).toISOString()
          : new Date().toISOString(),
        endsAt: null,
        modality: body.modality || "in_person",
        status: "completed",
        sandbox: true,
        requestOrigin: "advisor",
      };
      this.appointments = [appointment, ...this.appointments];
      this.saveAdvisor();
      return clone(appointment) as T;
    }
    if (route === "/api/oaca/advisor/reschedule" && method === "POST") {
      const body = options.body as {
        appointmentId?: string;
        startsAt?: string;
      };
      const appointment = this.appointments.find(
        (item) => item.id === body.appointmentId,
      );
      if (!appointment || !body.startsAt)
        throw new Error("Choose an appointment and replacement time.");
      const prior = appointment.startsAt;
      appointment.startsAt = new Date(body.startsAt).toISOString();
      appointment.endsAt = new Date(
        new Date(body.startsAt).getTime() + 30 * 60 * 1000,
      ).toISOString();
      appointment.status = "confirmed";
      this.eventState.notices.unshift({
        id: `appointment-change-${crypto.randomUUID()}`,
        eventId: null,
        category: "appointment_changed",
        title: "Your appointment was rescheduled",
        body: `${appointment.serviceName} moved from ${prior ? new Date(prior).toLocaleString() : "the prior time"} to ${new Date(appointment.startsAt).toLocaleString()}.`,
        deepLink: "/app/compass",
        readAt: null,
        dismissedAt: null,
        createdAt: new Date().toISOString(),
      });
      this.saveAdvisor();
      this.saveEvents();
      return clone(appointment) as T;
    }
    if (route === "/api/oaca/advisor/cancel" && method === "POST") {
      const body = options.body as {
        appointmentId?: string;
        category?: string;
        note?: string;
      };
      const appointment = this.appointments.find(
        (item) => item.id === body.appointmentId,
      );
      if (!appointment) throw new Error("Appointment not found.");
      appointment.status = "cancelled";
      this.eventState.notices.unshift({
        id: `appointment-cancel-${crypto.randomUUID()}`,
        eventId: null,
        category: "appointment_cancelled",
        title: "Your appointment was cancelled",
        body: `${appointment.serviceName} was cancelled. Open Compass when you are ready to rebook.`,
        deepLink: "/app/compass",
        readAt: null,
        dismissedAt: null,
        createdAt: new Date().toISOString(),
      });
      this.saveAdvisor();
      this.saveEvents();
      return clone({
        ...appointment,
        cancellationCategory: body.category || null,
        cancellationNote: body.note || null,
      }) as T;
    }
    if (route === "/api/oaca/advisor/addenda" && method === "POST") {
      const body = options.body as { appointmentId?: string; body?: string };
      if (!body.appointmentId || !body.body?.trim())
        throw new Error("Addendum text is required.");
      const item = {
        id: `addendum-${crypto.randomUUID()}`,
        appointmentId: body.appointmentId,
        authorName: context.displayName,
        body: body.body.trim(),
        createdAt: new Date().toISOString(),
      };
      this.advisorState.addenda.unshift(item);
      this.saveAdvisor();
      return clone(item) as T;
    }
    if (route === "/api/oaca/advisor/tasks" && method === "POST") {
      const body = options.body as {
        studentId?: string;
        appointmentId?: string;
        title?: string;
        assignedTo?: "student" | "advisor" | "staff";
        dueAt?: string | null;
      };
      const student = advisorPreviewBootstrap(
        persona,
        "academic",
        this.advisorState,
        this.appointments,
      ).students.find((item) => item.id === body.studentId);
      if (!student || !body.title?.trim())
        throw new Error("Choose a student and enter an action.");
      const item = {
        id: `task-${crypto.randomUUID()}`,
        studentId: student.id,
        studentName: student.displayName,
        title: body.title.trim(),
        assignedTo: body.assignedTo || "student",
        dueAt: body.dueAt || null,
        status: "open" as const,
        appointmentId: body.appointmentId || null,
      };
      this.advisorState.tasks.unshift(item);
      this.saveAdvisor();
      return clone(item) as T;
    }
    if (
      ["/api/oaca/advisor/tasks/action", "/api/oaca/tasks/action"].includes(
        route,
      ) &&
      method === "POST"
    ) {
      const body = options.body as { taskId?: string; action?: string };
      const item = this.advisorState.tasks.find(
        (task) => task.id === body.taskId,
      );
      if (!item) throw new Error("Task not found.");
      item.status = body.action === "reopen" ? "open" : "completed";
      this.saveAdvisor();
      return clone(item) as T;
    }
    if (route === "/api/oaca/advisor/messages" && method === "POST") {
      const body = options.body as { studentId?: string; body?: string };
      const student = advisorPreviewBootstrap(
        persona,
        "academic",
        this.advisorState,
        this.appointments,
      ).students.find((item) => item.id === body.studentId);
      if (!student || !body.body?.trim())
        throw new Error("Choose a student and enter a message.");
      const item = {
        id: `advisor-message-${crypto.randomUUID()}`,
        studentId: student.id,
        studentName: student.displayName,
        senderName: context.displayName,
        body: body.body.trim(),
        createdAt: new Date().toISOString(),
        assignedToName: student.assignedAdvisorName,
        unread: false,
      };
      this.advisorState.messages.push(item);
      this.saveAdvisor();
      return clone(item) as T;
    }
    if (route === "/api/oaca/advisor/milestone-steps" && method === "POST") {
      const body = options.body as { obligationId?: string };
      if (
        body.obligationId &&
        !this.advisorState.completedObligationIds.includes(body.obligationId)
      )
        this.advisorState.completedObligationIds.push(body.obligationId);
      this.saveAdvisor();
      return clone({ id: body.obligationId, status: "completed" }) as T;
    }
    if (route === "/api/oaca/advisor/plans" && method === "POST") {
      const body = options.body as {
        studentId?: string;
        title?: string;
        content?: string;
      };
      if (!body.studentId || !body.title?.trim() || !body.content?.trim())
        throw new Error("Student, title, and plan are required.");
      const prior = this.advisorState.plans.filter(
        (item) =>
          item.studentId === body.studentId && item.title === body.title,
      );
      const item = {
        id: `plan-${crypto.randomUUID()}`,
        studentId: body.studentId,
        title: body.title.trim(),
        content: body.content.trim(),
        version: prior.length + 1,
        createdAt: new Date().toISOString(),
      };
      this.advisorState.plans.unshift(item);
      this.saveAdvisor();
      return clone(item) as T;
    }
    if (route === "/api/oaca/advisor/career-roadmap" && method === "POST") {
      const body = options.body as {
        studentId?: string;
        itemKey?: string;
        completed?: boolean;
      };
      if (!body.studentId || !body.itemKey)
        throw new Error("Choose a student and roadmap item.");
      this.advisorState.roadmapCompletions =
        this.advisorState.roadmapCompletions.filter(
          (item) =>
            !(
              item.studentId === body.studentId && item.itemKey === body.itemKey
            ),
        );
      if (body.completed)
        this.advisorState.roadmapCompletions.push({
          studentId: body.studentId,
          itemKey: body.itemKey,
          completedAt: new Date().toISOString(),
          completedByName: context.displayName,
        });
      this.saveAdvisor();
      return clone({
        studentId: body.studentId,
        itemKey: body.itemKey,
        completed: Boolean(body.completed),
      }) as T;
    }
    if (route === "/api/oaca/advisor/reports" && method === "POST") {
      const body = options.body as {
        name?: string;
        workspace?: "academic" | "career";
      };
      if (!body.name?.trim()) throw new Error("Report name is required.");
      const item = {
        id: `report-${crypto.randomUUID()}`,
        name: body.name.trim(),
        workspace:
          body.workspace === "career"
            ? ("career" as const)
            : ("academic" as const),
        createdAt: new Date().toISOString(),
      };
      this.advisorState.savedReports.unshift(item);
      this.saveAdvisor();
      return clone(item) as T;
    }
    if (route === "/api/oaca/advisor/reports/export" && method === "POST")
      return clone({
        status: "ready",
        format: (options.body as { format?: string })?.format || "csv",
        minimumGroupSize: 10,
        audited: true,
      }) as T;
    if (route === "/api/oaca/advisor/availability" && method === "POST") {
      this.advisorState.availability = (options.body || {}) as Record<
        string,
        unknown
      >;
      this.saveAdvisor();
      return clone({ status: "saved", ...this.advisorState.availability }) as T;
    }
    if (route === "/api/oaca/advisor/templates" && method === "POST") {
      const body = options.body as {
        name?: string;
        kind?: "form" | "note" | "study_plan";
      };
      if (!body.name?.trim()) throw new Error("Template name is required.");
      const prior = this.advisorState.templates.filter(
        (item) => item.name === body.name,
      );
      const item = {
        id: `template-${crypto.randomUUID()}`,
        name: body.name.trim(),
        kind: body.kind || "study_plan",
        version: prior.length + 1,
        authorName: context.displayName,
      };
      this.advisorState.templates.unshift(item);
      this.saveAdvisor();
      return clone(item) as T;
    }
    if (path === "/api/oaca/bootstrap") {
      this.ensureEncountersLoaded();
      const source = oacaBootstrap();
      const isStudent = personaMemberships
        .find((item) => item.experienceKey === "oaca")
        ?.roles.includes("student");
      const ownStudentRecord = (studentId: string) => studentId === "student-1";
      const base = {
        ...source,
        appointments: this.appointments.map((item) =>
          isStudent && ownStudentRecord(item.studentId)
            ? {
                ...item,
                studentId: context.userId,
                studentName: context.displayName,
              }
            : item,
        ),
        obligations: source.obligations.map((item) => ({
          ...(isStudent && ownStudentRecord(item.studentId)
            ? {
                ...item,
                studentId: context.userId,
                studentName: context.displayName,
              }
            : item),
          status: this.advisorState.completedObligationIds.includes(item.id)
            ? "completed"
            : item.status,
        })),
        nudges: source.nudges.map((item) =>
          isStudent && ownStudentRecord(item.studentId)
            ? {
                ...item,
                studentId: context.userId,
                studentName: context.displayName,
              }
            : item,
        ),
        encounterRecords: this.encounterRecords,
        events: this.eventState.events,
      };
      return clone(
        isStudent
          ? {
              ...base,
              appointments: base.appointments.filter(
                (item) => item.studentId === context.userId,
              ),
              encounterRecords: [],
              assignedStudents: [],
              currentProvider: null,
              canManageImports: false,
              canViewAnalytics: false,
              importBatches: [],
              analytics: null,
              canManageOutreach: false,
              canViewOutreachInsights: false,
              campaigns: [],
              nudges: base.nudges.filter(
                (item) => item.studentId === context.userId,
              ),
            }
          : base,
      ) as T;
    }
    if (route === "/api/oaca/events/workspace") {
      const eventId =
        new URL(path, "https://preview.local").searchParams.get("eventId") ||
        "";
      const workspace = eventWorkspace(this.eventState, eventId);
      const studentOnly = personaMemberships
        .find((item) => item.experienceKey === "oaca")
        ?.roles.every((role) => role === "student");
      if (studentOnly) {
        const notifications = workspace.notifications.filter(
          (notice) => !notice.category.startsWith("event_staff_"),
        );
        return clone({
          ...workspace,
          notifications,
          unreadCount: notifications.filter(
            (notice) => !notice.readAt && !notice.dismissedAt,
          ).length,
          roster: [],
          hosts: [],
          staffOptions: [],
          coordinatorAlertRules: [],
          activity: [],
          corrections: [],
          deliveries: null,
          threads: [],
        }) as T;
      }
      return clone(workspace) as T;
    }
    if (route === "/api/oaca/events/audience-preview" && method === "POST") {
      const body = options.body as { audience?: OacaAudience } | undefined;
      return clone(this.previewAudience(body?.audience || {})) as T;
    }
    if (route === "/api/oaca/events/recipients/refresh" && method === "POST") {
      const body = options.body as
        | { eventId?: string; audience?: OacaAudience; commit?: boolean }
        | undefined;
      const preview = this.previewAudience(body?.audience || {});
      if (body?.commit && body.eventId) {
        const event = this.eventState.events.find(
          (item) => item.id === body.eventId,
        );
        if (event) event.audience = body.audience || {};
        this.saveEvents();
      }
      return clone({
        ...preview,
        additions: Math.max(0, preview.count - 24),
        removals: 2,
        version: body?.commit ? 2 : 1,
      }) as T;
    }
    if (route === "/api/oaca/events" && method === "POST") {
      const body = (options.body || {}) as Record<string, unknown> & {
        audience?: OacaAudience;
        coordinatorUserIds?: string[];
        attendeeNotificationRules?: SyntheticEventState["attendeeRules"][string];
        coordinatorAlertRules?: SyntheticEventState["coordinatorRules"][string];
      };
      const id = `synthetic-event-${crypto.randomUUID()}`;
      const publish = body.action === "publish";
      const coordinators = [
        ...new Set(["synthetic-creator", ...(body.coordinatorUserIds || [])]),
      ];
      const record: SyntheticEvent = {
        id,
        title: String(body.title || "Untitled event"),
        description: String(body.description || ""),
        imageUrl: null,
        imageAlt: null,
        hostName: coordinators
          .map(
            (userId) =>
              syntheticStaff.find((person) => person.userId === userId)
                ?.displayName,
          )
          .filter(Boolean)
          .join(", "),
        startsAt: String(body.startsAt),
        endsAt: String(body.endsAt || body.startsAt),
        modality: String(body.modality || "in_person"),
        location: String(body.location || ""),
        capacity: body.capacity ? Number(body.capacity) : null,
        registrationCount: 0,
        registered: false,
        status: publish ? "published" : "draft",
        audience: body.audience || { includeAllMembers: true },
        formId: null,
        timezone: "America/Los_Angeles",
        canManage: true,
        presentCount: 0,
        absentCount: 0,
        notRecordedCount: 0,
        attendanceStatus: null,
        checkinOpen: false,
        sourceSystem: null,
      };
      this.eventState.events = [record, ...this.eventState.events];
      this.eventState.hosts[id] = coordinators.map((userId) => ({
        userId,
        displayName:
          syntheticStaff.find((person) => person.userId === userId)
            ?.displayName || "Compass staff",
        role: "owner",
      }));
      this.eventState.attendeeRules[id] = body.attendeeNotificationRules || [];
      this.eventState.coordinatorRules[id] = body.coordinatorAlertRules || [];
      if (publish)
        this.eventState.notices.unshift({
          id: `notice-${id}`,
          eventId: id,
          category: "event_staff_change",
          title: `Published: ${record.title}`,
          body: `${this.previewAudience(record.audience).count} invitation recipients resolved.`,
          deepLink: `/app/compass?event=${id}`,
          readAt: null,
          dismissedAt: null,
          createdAt: new Date().toISOString(),
        });
      this.saveEvents();
      return clone({
        id,
        status: record.status,
        recipientCount: publish
          ? this.previewAudience(record.audience).count
          : 0,
      }) as T;
    }
    if (route === "/api/oaca/events/update" && method === "POST") {
      const body = options.body as Record<string, unknown> & {
        eventId: string;
      };
      const event = this.eventState.events.find(
        (item) => item.id === body.eventId,
      );
      if (event)
        Object.assign(event, {
          title: body.title ?? event.title,
          description: body.description ?? event.description,
          startsAt: body.startsAt ?? event.startsAt,
          endsAt: body.endsAt ?? event.endsAt,
          location: body.location ?? event.location,
          modality: body.modality ?? event.modality,
          capacity: body.capacity ? Number(body.capacity) : null,
        });
      this.saveEvents();
      return clone(event || { ok: true }) as T;
    }
    if (route === "/api/oaca/events/publish" && method === "POST") {
      const body = options.body as { eventId: string };
      const event = this.eventState.events.find(
        (item) => item.id === body.eventId,
      );
      if (event) event.status = "published";
      this.saveEvents();
      return clone(event || { ok: true }) as T;
    }
    if (route === "/api/oaca/events/cancel" && method === "POST") {
      const body = options.body as { eventId: string };
      const event = this.eventState.events.find(
        (item) => item.id === body.eventId,
      );
      if (event) event.status = "cancelled";
      this.saveEvents();
      return clone(event || { ok: true }) as T;
    }
    if (route === "/api/oaca/events/hosts" && method === "POST") {
      const body = options.body as { eventId: string; userId: string };
      const person = syntheticStaff.find((item) => item.userId === body.userId);
      if (
        person &&
        !this.eventState.hosts[body.eventId]?.some(
          (item) => item.userId === body.userId,
        )
      )
        this.eventState.hosts[body.eventId] = [
          ...(this.eventState.hosts[body.eventId] || []),
          {
            userId: body.userId,
            displayName: person.displayName,
            role: "owner",
          },
        ];
      this.saveEvents();
      return { ok: true } as T;
    }
    if (route === "/api/oaca/events/hosts" && method === "DELETE") {
      const body = options.body as { eventId: string; userId: string };
      this.eventState.hosts[body.eventId] = (
        this.eventState.hosts[body.eventId] || []
      ).filter((item) => item.userId !== body.userId);
      this.saveEvents();
      return { ok: true } as T;
    }
    if (route === "/api/oaca/event-notification-rules" && method === "POST") {
      const body = options.body as {
        eventId: string;
        type: string;
        offsetMinutes: number | null;
        enabled: boolean;
        channels: string[];
      };
      const rules = this.eventState.attendeeRules[body.eventId] || [];
      const index = rules.findIndex(
        (item) =>
          item.type === body.type && item.offsetMinutes === body.offsetMinutes,
      );
      const next = {
        id: index >= 0 ? rules[index].id : `rule-${crypto.randomUUID()}`,
        type: body.type,
        offsetMinutes: body.offsetMinutes,
        enabled: body.enabled,
        channels: body.channels,
        scheduledFor: null,
        generation: index >= 0 ? rules[index].generation + 1 : 1,
      };
      if (index >= 0) rules[index] = next;
      else rules.push(next);
      this.eventState.attendeeRules[body.eventId] = rules;
      this.saveEvents();
      return clone(next) as T;
    }
    if (
      route === "/api/oaca/event-coordinator-alert-rules" &&
      method === "POST"
    ) {
      const body = options.body as {
        eventId: string;
        rules: SyntheticEventState["coordinatorRules"][string];
      };
      this.eventState.coordinatorRules[body.eventId] = body.rules;
      this.saveEvents();
      return { ok: true } as T;
    }
    if (route === "/api/platform/notifications/action" && method === "POST") {
      const body = options.body as {
        notificationId: string;
        action: "read" | "dismiss";
      };
      const notice = this.eventState.notices.find(
        (item) => item.id === body.notificationId,
      );
      if (notice) {
        if (body.action === "read") notice.readAt = new Date().toISOString();
        else notice.dismissedAt = new Date().toISOString();
        this.saveEvents();
      }
      return { ok: true } as T;
    }
    if (route === "/api/oaca/synthetic/reset" && method === "POST") {
      const compass = oacaBootstrap();
      this.eventState = defaultSyntheticEventState();
      this.appointments = compass.appointments;
      this.encounterRecords = compass.encounterRecords;
      this.advisorState = defaultSyntheticAdvisorState();
      this.affiliations = defaultSyntheticAffiliations();
      this.impactEvents = defaultSyntheticImpactEvents();
      this.impactNotifications = [
        {
          id: "impact-notice-1",
          title: "Impact event needs a Liaison decision",
          body: "Community listening circle completed mentor review.",
          eventId: "impact-event-1",
          readAt: null,
          createdAt: isoAt(-1, 13),
        },
      ];
      this.saveEvents();
      this.saveEncounters();
      this.saveAdvisor();
      this.saveImpact();
      return { ok: true } as T;
    }
    if (
      path === "/api/oaca/event-imports" &&
      (!options.method || options.method === "GET")
    )
      return clone([
        {
          id: "event-import-1",
          status: "completed",
          source_event_rows: 48,
          source_attendance_rows: 178,
          occurrence_count: 22,
          matched_students: 76,
          merged_duplicates: 3,
          quality_summary: { note: "Illustrative aggregate only" },
          requested_by: "synthetic-creator",
          reviewed_by: "synthetic-reviewer",
          reviewed_at: isoAt(-2, 11),
          completed_at: isoAt(-2, 12),
          created_at: isoAt(-3, 11),
        },
      ]) as T;
    if (path === "/api/genesis/bootstrap")
      return clone(
        genesisBootstrap(
          persona,
          this.affiliations,
          this.impactEvents,
          this.impactNotifications,
        ),
      ) as T;
    if (path === "/api/genesis/access-requests/decide" && method === "POST") {
      if (
        ![
          "impact_administrator",
          "community_liaison",
          "platform_creator",
        ].includes(persona)
      )
        throw new Error(
          "Only an Impact Administrator or Community Liaison may verify an affiliation.",
        );
      const body = options.body as {
        affiliationId?: string;
        decision?: "approved" | "declined";
        reviewNote?: string;
      };
      const item = this.affiliations.find(
        (candidate) => candidate.id === body.affiliationId,
      );
      if (!item || item.status !== "pending")
        throw new Error("This request has already been reviewed.");
      item.status = body.decision === "approved" ? "approved" : "declined";
      item.reviewedAt = new Date().toISOString();
      item.reviewerName = context.displayName;
      item.reviewNote = body.reviewNote || null;
      this.saveImpact();
      return clone(item) as T;
    }
    if (path === "/api/genesis/events" && method === "POST") {
      if (persona !== "impact_student" && persona !== "platform_creator")
        throw new Error(
          "Only an approved Impact student may create an event draft.",
        );
      const body = options.body as Record<string, unknown>;
      const id = `impact-event-${crypto.randomUUID()}`;
      const event: SyntheticImpactEvent = {
        id,
        title: String(body.title || "Untitled Impact event"),
        objective: String(body.objective || ""),
        organizationId: String(
          body.organizationId ||
            medicineOrganization?.id ||
            "medicine-organization",
        ),
        organizationName: medicineOrganization?.name || "Student organization",
        status: "draft",
        startsAt: body.startsAt ? String(body.startsAt) : null,
        mentorApprovedAt: null,
        liaisonApprovedAt: null,
        submittedAt: null,
        reviewerFeedback: null,
      };
      this.impactEvents.unshift(event);
      this.saveImpact();
      return clone(event) as T;
    }
    if (path === "/api/genesis/events/submit" && method === "POST") {
      const event = this.impactEvents.find(
        (item) => item.id === (options.body as { eventId?: string })?.eventId,
      );
      if (!event || event.status !== "draft")
        throw new Error("Only a draft event can be submitted.");
      event.status = "submitted";
      event.submittedAt = new Date().toISOString();
      this.impactNotifications.unshift({
        id: `impact-notice-${event.id}`,
        title: "Impact event submitted",
        body: `${event.title} needs mentor and Community Liaison review.`,
        eventId: event.id,
        readAt: null,
        createdAt: new Date().toISOString(),
      });
      this.saveImpact();
      return clone(event) as T;
    }
    if (path === "/api/genesis/events/decision" && method === "POST") {
      const body = options.body as {
        eventId?: string;
        reviewerType?: "mentor" | "liaison";
        decision?: "approve" | "changes_requested";
        feedback?: string;
      };
      const event = this.impactEvents.find((item) => item.id === body.eventId);
      if (!event) throw new Error("Event not found.");
      if (body.decision === "changes_requested") {
        event.status = "changes_requested";
        event.reviewerFeedback = body.feedback || null;
        this.saveImpact();
        return clone(event) as T;
      }
      if (body.reviewerType === "mentor") {
        if (!["submitted", "changes_requested"].includes(event.status))
          throw new Error("This mentor decision is no longer pending.");
        event.mentorApprovedAt = new Date().toISOString();
        event.status = "mentor_approved";
      } else {
        if (!event.mentorApprovedAt || event.liaisonApprovedAt)
          throw new Error("The Liaison decision is no longer pending.");
        event.liaisonApprovedAt = new Date().toISOString();
        event.status = "published";
      }
      this.saveImpact();
      return clone(event) as T;
    }
    if (path === "/api/genesis/events/change" && method === "POST") {
      const body = options.body as {
        eventId?: string;
        title?: string;
        startsAt?: string;
      };
      const event = this.impactEvents.find((item) => item.id === body.eventId);
      if (!event) throw new Error("Event not found.");
      if (body.title) event.title = body.title;
      if (body.startsAt) event.startsAt = body.startsAt;
      if (event.status === "published")
        this.impactNotifications.unshift({
          id: `impact-change-${event.id}-${Date.now()}`,
          title: "Published Impact event changed",
          body: `${event.title} has updated details.`,
          eventId: event.id,
          readAt: null,
          createdAt: new Date().toISOString(),
        });
      this.saveImpact();
      return clone(event) as T;
    }
    if (path === "/api/genesis/events/cancel" && method === "POST") {
      const event = this.impactEvents.find(
        (item) => item.id === (options.body as { eventId?: string })?.eventId,
      );
      if (!event) throw new Error("Event not found.");
      event.status = "cancelled";
      this.impactNotifications.unshift({
        id: `impact-cancel-${event.id}`,
        title: "Impact event cancelled",
        body: `${event.title} was cancelled.`,
        eventId: event.id,
        readAt: null,
        createdAt: new Date().toISOString(),
      });
      this.saveImpact();
      return clone(event) as T;
    }
    if (path === "/api/genesis/calendar" && method === "GET")
      return clone(
        this.impactEvents.filter((item) => item.status === "published"),
      ) as T;
    if (path === "/api/platform/files") return { id: "synthetic-file" } as T;
    if (path === "/api/platform/notification-preferences")
      return { smsEnabled: false } as T;
    if (path === "/api/oaca/events/attendance") return { version: 3 } as T;
    if (path === "/api/oaca/events/check-in")
      return {
        open: true,
        token: "synthetic-event-token",
        closesAt: isoAt(0, 16),
        deepLink: "/app/compass?checkin=synthetic-event-token",
      } as T;
    if (path === "/api/oaca/events/check-in/student-token")
      return { token: "synthetic-permanent-student-qr", permanent: true } as T;
    if (path === "/api/oaca/events/check-in/self")
      return { title: "Practical Practice Testing" } as T;
    if (path === "/api/oaca/appointments/cancel") {
      const body = options.body as { appointmentId?: string } | undefined;
      const appointment = this.appointments.find(
        (item) => item.id === body?.appointmentId,
      );
      if (appointment) appointment.status = "cancelled";
      return clone({
        id: appointment?.id,
        status: appointment?.status || "cancelled",
      }) as T;
    }
    if (
      path === "/api/oaca/appointments" &&
      (options.method || "GET").toUpperCase() === "POST"
    ) {
      const body = options.body as
        | {
            serviceLineId?: string;
            providerId?: string | null;
            startsAt?: string;
            modality?: string;
            format?: string;
            topic?: string;
          }
        | undefined;
      const seed = oacaBootstrap();
      const service = seed.services.find(
        (item) => item.id === body?.serviceLineId,
      );
      const provider = seed.providers.find(
        (item) => item.id === body?.providerId,
      );
      const appointment: SyntheticAppointment = {
        id: `appointment-${crypto.randomUUID()}`,
        studentId: context.userId,
        studentName: context.displayName,
        serviceName: service?.name || "Compass appointment",
        providerName:
          provider?.displayName ||
          (service?.key === "academic_advising"
            ? seed.assignedAdvisor.displayName
            : null),
        subject: body?.topic || null,
        format: body?.format || "individual",
        startsAt: body?.startsAt || null,
        endsAt: null,
        modality: body?.modality || "teams",
        status: "pending_approval",
        sandbox: true,
        requestOrigin: "student",
      };
      this.appointments = [appointment, ...this.appointments];
      return clone({
        id: appointment.id,
        status: appointment.status,
        sandbox: true,
      }) as T;
    }
    if (path === "/api/oaca/records" && method === "POST") {
      this.ensureEncountersLoaded();
      const body = options.body as {
        appointmentId?: string;
        workingNotes?: string;
        studentRecap?: string;
        structuredData?: SyntheticEncounterRecord["structuredData"];
        publishRecap?: boolean;
      };
      const appointment = this.appointments.find(
        (item) => item.id === body.appointmentId,
      );
      if (!appointment)
        throw new Error("Choose an appointment in your authorized scope.");
      const index = this.encounterRecords.findIndex(
        (item) => item.appointmentId === appointment.id,
      );
      const previous = index >= 0 ? this.encounterRecords[index] : null;
      const now = new Date().toISOString();
      const record: SyntheticEncounterRecord = {
        appointmentId: appointment.id,
        workingNotes: body.workingNotes || "",
        studentRecap: body.studentRecap || "",
        structuredData: body.structuredData || {
          categories: [],
          interventions: [],
          referrals: [],
          followUp: [],
        },
        revision: (previous?.revision || 0) + 1,
        updatedAt: now,
        publishedAt: body.publishRecap ? now : previous?.publishedAt || null,
      };
      if (index >= 0) this.encounterRecords[index] = record;
      else this.encounterRecords.unshift(record);
      if (body.publishRecap) appointment.studentRecap = record.studentRecap;
      this.saveEncounters();
      return clone(record) as T;
    }
    if (path === "/api/oaca/campaigns")
      return { id: "synthetic-campaign" } as T;
    return { id: "synthetic-record", ok: true } as T;
  }

  async download() {
    return {
      blob: new Blob(
        ["Synthetic preview export. No production records were accessed."],
        { type: "text/plain" },
      ),
      filename: "navigate-synthetic-preview.txt",
    };
  }
}

export const syntheticPreviewApi =
  new SyntheticPilotApi() as unknown as PilotApiClient;
