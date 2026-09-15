"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { SyntheticPersonaKey } from "./synthetic-preview";

export type DemoTutorialWorkspace = "compass" | "impact" | "pathway" | "facilities";
export type DemoTutorialAudience = "learn" | "leadership";

export type TutorialStep = {
  id: string;
  chapterId: string;
  title: string;
  body: string;
  leadershipTitle: string;
  leadershipBody: string;
  selector: string;
};

export type TutorialChapter = { id: string; title: string; minutes: number; steps: TutorialStep[] };

type SavedRoleProgress = {
  audience: DemoTutorialAudience;
  currentChapterId: string;
  currentStepIndex: number;
  completedChapterIds: string[];
  completedAt?: string;
};

type TutorialMetric = {
  workspace: DemoTutorialWorkspace;
  persona: SyntheticPersonaKey;
  starts: number;
  completions: number;
  skips: number;
  activeSeconds: number;
  lastStepId?: string;
  updatedAt: string;
};

type TutorialStore = { roles: Record<string, SavedRoleProgress>; metrics: Record<string, TutorialMetric> };
const storageKey = "navigate.demo-tutorial.v2";

const step = (chapterId: string, id: string, title: string, body: string, leadershipTitle: string, leadershipBody: string, selector: string): TutorialStep => ({ chapterId, id, title, body, leadershipTitle, leadershipBody, selector });

const orientation = (workspace: DemoTutorialWorkspace): TutorialChapter => ({
  id: "orientation",
  title: "Orientation",
  minutes: 1,
  steps: [
    step("orientation", "role-boundary", "Learn this role safely", "Viewing as changes the fictional records and tools delivered to the dashboard. Restricted views never receive administrative queues, inventory controls, or protected records.", "Demonstrate permission boundaries", "Use the role selector to show leaders that the same Compass shell returns a different, role-scoped response instead of hiding protected data only with styling.", "[data-demo-guide='role-switcher']"),
    step("orientation", "workspace-boundary", "Open only assigned workspaces", `The workspace control lists only destinations this ${workspace} role is allowed to use. Switching never grants another membership.`, "Explain the parent-platform model", "Compass is the account gateway. Pathway and Impact remain permission-isolated workspaces, while shared identity and communication services avoid duplicate accounts.", "[data-demo-guide='workspace-switcher']"),
  ],
});

const compassStudentChapters: TutorialChapter[] = [
  orientation("compass"),
  {
    id: "student-start", title: "Start here", minutes: 1,
    steps: [
      step("student-start", "student-home", "Your student home", "This welcome keeps the page calm while placing support, events, and your next steps directly beneath it.", "Student self-service", "The home surface prioritizes the highest-frequency mobile tasks without carrying staff controls into the student response.", ".compass-student-hero"),
      step("student-start", "student-actions", "Use your everyday tools", "Notifications, Events, Check-In, and My Visits stay in the header. On a phone, Notifications remains visible and the other tools move into More.", "Persistent, role-scoped navigation", "These controls render only for the Compass Student role. Staff, Peer Tutor, Manager, and Impact previews receive their own navigation and data scopes.", ".platform-header--oaca"),
    ],
  },
  {
    id: "student-support", title: "Appointments and support", minutes: 1,
    steps: [
      step("student-support", "student-department", "Choose the right department", "Start with Academic Advising, Career Advising, or Peer Tutoring. Switching departments clears incompatible selections before showing new times.", "One scheduling entry point", "The same server-backed scheduling contract applies assignment, qualification, duration, format, buffer, and conflict rules for each service.", ".home-service-choice"),
      step("student-support", "student-availability", "Choose a time block", "Use the weekly chart to pick a published time. Academic Advising shows only your assigned advisor; Career Advising is routed automatically; Peer Tutoring starts with a subject.", "Availability respects assignment", "The student response excludes other Academic Advisors’ calendars. Every selected block is revalidated by the server before a request can be submitted.", "[data-tutorial-id='student-availability']"),
      step("student-support", "student-next", "See what comes next", "Your next visit, next registered event, open requirements, and published action plans stay together below the scheduler.", "Reduce missed connections", "Status and follow-through information is surfaced without exposing protected working notes or peer comparisons.", ".student-next-steps"),
    ],
  },
  {
    id: "student-events", title: "Events", minutes: 1,
    steps: [
      step("student-events", "student-upcoming-events", "Discover upcoming events", "The next three eligible events appear here, with registered and waitlisted events first. Open a card for the full description, accessibility details, and your own status.", "Purposeful event discovery", "Audience eligibility and the signed-in student’s RSVP state shape this row; no roster or another student’s attendance is returned.", "[data-tutorial-id='student-upcoming-events']"),
      step("student-events", "student-rsvp", "Manage your RSVP on the event page", "Open Events to register, join a waitlist, see your position, or cancel before an event begins. The tutorial stops before any of those actions are submitted.", "Complete RSVP lifecycle", "Capacity changes promote the earliest eligible waitlisted student through an idempotent, audited server operation. Public history exposes summary data only.", "[data-tutorial-id='student-upcoming-events']"),
    ],
  },
  {
    id: "student-impact", title: "Affiliations and Impact", minutes: 1,
    steps: [
      step("student-impact", "student-materials", "Keep your work together", "Portfolio, policies, affiliations, and optional Peer Tutor access remain available as supporting tools instead of competing with scheduling.", "Longitudinal student record", "The student-facing record combines support history without exposing protected working notes, staff analytics, or peer comparisons.", ".student-supporting-tools"),
      step("student-impact", "student-affiliations", "Request an affiliation", "Declare an interest-group affiliation here. Impact appears only after an Impact Administrator or Community Liaison verifies it.", "Verified nested access", "Affiliation states are audited. Student Council is useful profile metadata but does not unlock Impact by itself.", ".hub-affiliations"),
    ],
  },
];

const peerTutorChapters: TutorialChapter[] = [
  orientation("compass"),
  {
    id: "tutor-today", title: "Today", minutes: 1,
    steps: [
      step("tutor-today", "tutor-home", "Your Peer Tutor workspace", "Tutor mode is separate from your student dashboard. It includes only tutoring work and the limited student context needed for each session.", "A secondary student role", "Peer Tutors retain student access while the tutor response is separately scoped. Advising notes, grades, portfolios, and unrelated records are removed before the tutor dashboard loads.", "[data-tutorial-id='tutor-home']"),
      step("tutor-today", "tutor-availability", "Publish your bookable time first", "Add a single day when your schedule changes or create a weekly pattern with a start time, end time, session length, format, and location.", "Tutor-controlled availability", "Students receive only slots that also pass qualification, buffer, commitment, and appointment-limit checks.", "[data-tutorial-id='tutor-home-availability']"),
      step("tutor-today", "tutor-priorities", "Work tasks, then your agenda", "Unanswered requests and due logs appear before upcoming sessions, followed by the wider workload summary.", "Operational accountability", "Response and documentation clocks produce explainable work queues. They never create a predictive student or tutor score.", "[data-tutorial-id='tutor-home-tasks']"),
    ],
  },
  {
    id: "tutor-session", title: "Requests and sessions", minutes: 1,
    steps: [
      step("tutor-session", "tutor-requests", "Respond to requests", "Confirm, decline, or propose another time. Unanswered requests remind you and alert the Tutoring Manager after 12 hours.", "Managed response workflow", "Requests never auto-decline. Escalation lets the Manager reassign or resolve them before students lose access to support.", "[data-tutorial-id='tutor-requests']"),
      step("tutor-session", "tutor-sessions", "Run the whole session here", "Open the preparation note, start the session, scan the student’s permanent Compass QR, record attendance, and close the session.", "Protected tutoring context", "The session surface exposes only same-course published tutoring recaps. Operational notes and the separately published student recap remain distinct.", "[data-tutorial-id='tutor-sessions']"),
      step("tutor-session", "tutor-dropin", "Open a drop-in queue", "Check in to your assigned room before students enter the live queue. Call, start, complete, or skip each entry with an accessible manual fallback.", "Coordinated drop-in operations", "Manager-configured rooms separate coverage from appointment availability and prevent conflicting commitments.", "[data-tutorial-id='tutor-dropin']"),
    ],
  },
  {
    id: "tutor-finish", title: "Document and improve", minutes: 1,
    steps: [
      step("tutor-finish", "tutor-logs", "Complete the operational log", "A log becomes due after the session ends and is expected within 24 hours. Workday remains the official payroll record.", "Versioned documentation", "Tutor revisions and attributed Manager corrections preserve the original record. Session closure is never blocked by unfinished documentation.", "[data-tutorial-id='tutor-logs']"),
      step("tutor-finish", "tutor-feedback", "Use private feedback aggregates", "See coaching indicators only after at least three responses. Student names, raw comments, and peer rankings are excluded.", "Coaching without ranking", "Managers retain individual response and concern review while tutors receive only privacy-protected aggregates.", "[data-tutorial-id='tutor-feedback']"),
    ],
  },
];

const tutoringManagerChapters: TutorialChapter[] = [
  orientation("compass"),
  {
    id: "manager-today", title: "Program operations", minutes: 1,
    steps: [
      step("manager-today", "manager-home", "Your Tutoring Manager workspace", "One operational home collects tutor readiness, unanswered requests, attendance exceptions, overdue documentation, rooms, and service results.", "Supervise the tutoring service", "The Manager capability is separate from advising roles and uses MFA through the existing Compass staff policy.", "[data-tutorial-id='manager-home']"),
      step("manager-today", "manager-exceptions", "Resolve explainable exceptions", "Review the exact request, session, attendance, or documentation item requiring action.", "No hidden scoring", "Every exception is traceable to a policy clock or missing operational record; no predictive risk score or peer ranking is used.", "[data-tutorial-id='manager-today']"),
    ],
  },
  {
    id: "manager-service", title: "Tutors and offerings", minutes: 1,
    steps: [
      step("manager-service", "manager-tutors", "Manage tutor readiness", "Activate or suspend tutors, confirm current handbook acknowledgment, and set subjects, modalities, and effective dates.", "Staff-controlled eligibility", "Compass does not accept tutor applications. Manager-created provider records and completed onboarding determine access.", "[data-tutorial-id='manager-tutors']"),
      step("manager-service", "manager-offerings", "Publish group support", "Create group or review offerings for three to eight students, assign a qualified tutor, and manage registration and waitlists.", "Separate individual and group models", "Student-requested appointments remain one-to-one. Only Managers create multi-student offerings.", "[data-tutorial-id='manager-offerings']"),
      step("manager-service", "manager-dropin", "Coordinate drop-in coverage", "Configure rooms and coverage, then monitor live queues after assigned tutors check in.", "Conflict-safe coverage", "Appointment, group, and drop-in commitments share the same availability conflict rules.", "[data-tutorial-id='manager-dropin']"),
    ],
  },
  {
    id: "manager-quality", title: "Quality and privacy", minutes: 1,
    steps: [
      step("manager-quality", "manager-feedback", "Version the feedback form", "Publish Manager-defined questions, review responses and concerns, and release aggregate coaching results after the privacy threshold.", "Govern the instrument", "Every response stays tied to its form version. Tutors never receive raw comments or identifiable responses.", "[data-tutorial-id='manager-feedback']"),
      step("manager-quality", "manager-reports", "Review service results", "Monitor demand, hours, response time, attendance, log completion, capacity, and drop-in wait time without ranking tutors.", "Operational insight with limits", "Exports are permission-scoped and audited; small feedback aggregates remain suppressed.", "[data-tutorial-id='manager-reports']"),
    ],
  },
];

function advisorChapters(persona: SyntheticPersonaKey): TutorialChapter[] {
  const career = persona === "career_advisor";
  const director = persona === "compass_director" || persona === "platform_creator";
  return [
    orientation("compass"),
    {
      id: "advisor-today", title: "Today", minutes: 1,
      steps: [
        step("advisor-today", "advisor-home", career ? "Your Career Advisor workspace" : "Your Academic Advisor workspace", career ? "Focus on the four-year roadmap, career visits, artifacts, and follow-through." : "Focus on permanent caseloads, drop-ins, milestones, plans, and shared advising history.", "Service-specific workspaces", career ? "Career tools are separated from academic caseload controls while both contribute to the shared student record." : "Academic tools reflect assignment and drop-in rules while allowing authorized cross-caseload continuity.", ".advisor-workspace-hero"),
        step("advisor-today", "advisor-availability-home", "Start with appointment availability", "Add one day when your schedule changes or create a recurring weekly block. Set the visit length and format before publishing the time.", "Compass-managed schedule", "Students see only the blocks permitted for their service and assigned advisor. Outlook can later refine these rules without becoming the system of record.", "[data-tutorial-id='advisor-home-availability']"),
        step("advisor-today", "advisor-review-queue", "Review requests and cancellations", "Open students awaiting an appointment decision or follow-up after a cancellation. The queue keeps time-sensitive work directly beneath availability.", "Decision-ready context", "Each item opens the appointment record; student details and advising history remain permission-scoped.", "[data-tutorial-id='advisor-home-review-queue']"),
        step("advisor-today", "advisor-options-menu", "Choose your next advisor action", "Use the Advisor options menu to move directly to appointments, students, session records, messages, tasks, events, outreach, reports, availability, or templates.", "One controlled entry point", "The menu exposes only tools assigned to this advisor workspace and role.", "[data-tutorial-id='advisor-home-options']"),
        step("advisor-today", "advisor-agenda", "Work tasks, then the agenda", "Due follow-through appears first, followed by today’s appointments and the wider workload summary.", "Traceable attention", "Every item links to its source work queue, supporting operational review without ranking students.", "[data-tutorial-id='advisor-home-tasks']"),
      ],
    },
    {
      id: "advisor-records", title: "Students and sessions", minutes: 1,
      steps: [
        step("advisor-records", "advisor-tools", "Open the advisor tools", career ? "Appointments, calendar, students, records, messages, tasks, events, outreach, the Career roadmap, reports, availability, and templates are organized here." : "Appointments, calendar, students, records, messages, tasks, events, outreach, milestones, plans, reports, availability, and templates are organized here.", "Permission-scoped toolset", "Each tile maps to a bounded service capability. Cross-caseload access is labeled and automatically audited.", ".advisor-tile-grid"),
        step("advisor-records", "advisor-session", "Document without blocking care", "The session record keeps working notes, a separately published student recap, attachments, and action items together. Other advisors add attributed addenda.", "Shared record, separated layers", "Working notes remain advisor-only. Recaps require an explicit publish action, and completion never fabricates or requires notes.", "[data-tutorial-id='advisor-tile-session']"),
      ],
    },
    {
      id: "advisor-availability", title: "Availability", minutes: 1,
      steps: [
        step("advisor-availability", "advisor-availability", "Fine-tune all bookable time", "Open the full availability workspace to review, remove, or adjust one-day and recurring blocks, formats, locations, buffers, and appointment lengths.", "Scheduling without Outlook", "These blocks power the synthetic student booking chart now and form the platform source rules that Outlook free/busy can later refine.", "[data-tutorial-id='advisor-tile-availability']"),
        ...(director ? [step("advisor-availability", "director-controls", "Use Director controls", "Open policy, import, requirement, handoff, and aggregate reporting controls without leaving the advisor workspace.", "Govern the full service", "Director access adds configuration and aggregate operations while protected conversations and records retain their own access rules.", ".advisor-director-strip")] : []),
      ],
    },
  ];
}

const impactStudentChapters: TutorialChapter[] = [
  orientation("impact"),
  {
    id: "impact-build", title: "Build the initiative", minutes: 2,
    steps: [
      step("impact-build", "impact-home", "A focused Impact home", "Impact students land directly in this workspace. Advising tools remain in Compass because Impact access is an additional verified membership.", "Nested, not duplicated", "Impact shares identity and platform services with Compass without mixing initiative records into advising views.", ".experience-hero--genesis"),
      step("impact-build", "impact-journey", "Build a durable initiative", "The journey captures reflection, sources, listening, theory of change, equity, sustainability, and succession in a versioned portfolio.", "Structured community work", "The guided journey preserves student reasoning and evidence so mentors can coach the work and successors can continue it.", "[data-tutorial-id='impact-journey']"),
      step("impact-build", "impact-sharing", "Share without losing authorship", "Publish immutable snapshots, link related work, and create explicit handoffs rather than co-editing the canonical portfolio.", "Durable attribution", "Snapshots and accepted handoffs preserve authorship, reviewed versions, open decisions, and continuation responsibilities.", "[data-tutorial-id='impact-snapshots']"),
    ],
  },
  { id: "impact-events", title: "Programs and events", minutes: 1, steps: [step("impact-events", "impact-calendar", "Follow Impact events", "Draft, submit, review, and track events in a calendar shared with the relevant organization and Community Liaisons.", "Dual approval protects publication", "Nothing reaches the shared calendar or future Outlook synchronization until both mentor and Liaison approval are recorded.", "[data-tutorial-id='impact-events']")] },
];

const impactAdministratorChapters: TutorialChapter[] = [
  orientation("impact"),
  {
    id: "impact-admin-review", title: "Access and portfolio review", minutes: 2,
    steps: [
      step("impact-admin-review", "impact-admin-home", "Oversee the Impact workspace", "The Administrator home gathers affiliation verification, submitted portfolio review, and event oversight without changing student authorship.", "Impact governance overview", "Administrative tools coordinate access and program operations while student portfolios remain versioned and student-owned.", ".experience-hero--genesis"),
      step("impact-admin-review", "impact-admin-access", "Verify affiliation access", "Approve or decline each organization affiliation using the context supplied by the student.", "Least-privilege workspace access", "The first approved interest-group affiliation unlocks Impact; publishing remains limited to each separately verified organization.", "[data-tutorial-id='impact-access']"),
      step("impact-admin-review", "impact-admin-portfolio", "Review a preserved submission", "Read the exact submitted portfolio version and return coaching without overwriting later student revisions.", "Version-safe review", "Feedback remains attached to its source version so program leaders can trace decisions and preserve the student’s voice.", "[data-tutorial-id='impact-review']"),
    ],
  },
  { id: "impact-admin-events", title: "Program and event oversight", minutes: 1, steps: [step("impact-admin-events", "impact-admin-event-oversight", "Monitor event progress", "Review event evidence, approval state, reviewer feedback, and published activity from one workspace. This tour stops before any decision.", "Govern the approval path", "Administrators can oversee the workflow while the Community Liaison decision remains a distinct, attributed publication gate.", "[data-tutorial-id='impact-events']")] },
];

const impactLiaisonChapters: TutorialChapter[] = [
  orientation("impact"),
  {
    id: "impact-liaison-coordination", title: "Community coordination", minutes: 2,
    steps: [
      step("impact-liaison-coordination", "impact-liaison-home", "Coordinate community-facing work", "The Liaison home brings verified affiliations, event alerts, and decisions into one community-focused workspace.", "Community stewardship overview", "Liaisons see the items that need community coordination without gaining control of the student’s canonical portfolio.", ".experience-hero--genesis"),
      step("impact-liaison-coordination", "impact-liaison-access", "Verify an organization relationship", "Review the student’s affiliation context and approve or decline the request before organization publishing is allowed.", "Confirm accountable participation", "Every decision is attributed and shared with other authorized reviewers so duplicate or conflicting decisions can be prevented.", "[data-tutorial-id='impact-access']"),
      step("impact-liaison-coordination", "impact-liaison-review", "Read the preserved initiative", "Review the submitted work and its community context before making an event decision or returning feedback.", "Connect evidence to implementation", "Preserved versions let Liaisons evaluate the exact rationale, partners, sustainability plan, and open decisions supporting the proposed work.", "[data-tutorial-id='impact-review']"),
    ],
  },
  {
    id: "impact-liaison-events", title: "Event decisions and calendar", minutes: 1,
    steps: [
      step("impact-liaison-events", "impact-liaison-alerts", "Respond to Liaison alerts", "Submitted events and material changes appear with the decision context needed for coordinated follow-up.", "Route community decisions", "Every active Community Liaison receives the alert; once one records a decision, all reviewers see the updated state.", "[data-tutorial-id='impact-events']"),
      step("impact-liaison-events", "impact-liaison-publish", "Complete the publication gate", "Approve a mentor-reviewed event or request changes. This tutorial stops before the action is recorded.", "Protect the shared calendar", "Only dual-approved events publish to the Impact calendar, and later changes remain idempotent and attributed.", "[data-tutorial-id='impact-events']"),
    ],
  },
];

const pathwayChapters: TutorialChapter[] = [
  orientation("pathway"),
  {
    id: "pathway-core", title: "Pathway essentials", minutes: 2,
    steps: [
      step("pathway-core", "pathway-home", "Your Pathway home", "External and Roseman pre-med participants see only the Pathway experience assigned to their account.", "A shared account with isolated access", "Invitation-only Pathway roles can use the same Compass sign-in without receiving Compass advising or Impact permissions.", ".production-welcome"),
      step("pathway-core", "pathway-session", "Prepare for the next session", "Open upcoming pathway sessions, review timing and modality, and follow attendance status from one place.", "Program participation", "Session data supports operations and evaluation while the participant dashboard remains limited to that person’s records.", "[data-tutorial-id='pathway-session']"),
      step("pathway-core", "pathway-portfolio", "Build a private portfolio", "Collect reflections and artifacts, then share selected items with an advisor when you choose.", "Student-controlled sharing", "Portfolio artifacts remain private until the participant explicitly creates an advising share.", "[data-tutorial-id='pathway-portfolio']"),
    ],
  },
];

const pathwayCreatorChapters: TutorialChapter[] = [
  orientation("pathway"),
  {
    id: "pathway-governance", title: "Pathway governance", minutes: 2,
    steps: [
      step("pathway-governance", "pathway-creator-home", "Review Pathway as Creator", "Creator access provides platform-wide synthetic insight while Pathway records remain isolated from Compass and Impact.", "See the Pathway boundary", "This view demonstrates shared identity and platform governance without turning Creator access into an end-user record shortcut.", ".production-welcome"),
      step("pathway-governance", "pathway-creator-controls", "Use synthetic controls", "Review fictional configuration and reporting, then switch to the pre-med student role to inspect the student-safe experience.", "Validate configuration safely", "Creator controls support demonstration and acceptance testing without activating production integrations or changing real participant records.", ".production-grid"),
      step("pathway-governance", "pathway-permissions", "Verify the permission boundary", "The student role receives only its sessions, portfolio, cohort spaces, and advising shares.", "Confirm least privilege", "Role switching is a synthetic API boundary test: restricted data is removed before the student dashboard response is created.", ".production-grid"),
    ],
  },
];

const facilitiesAdminChapters: TutorialChapter[] = [
  orientation("facilities"),
  {
    id: "facilities-control", title: "Daily operations", minutes: 1,
    steps: [
      step("facilities-control", "facilities-priorities", "Start with explainable priorities", "See urgent work, low stock, license gaps, and recurring-use signals with the source rule visible beside every recommendation.", "Proactive, accountable operations", "The insight layer uses readable thresholds and trends rather than an unexplained score, so staff can verify why each item needs attention.", "[data-tutorial-id='facilities-priorities']"),
      step("facilities-control", "facilities-workflow", "Move work through one connected flow", "Requests move from New request through Approvals, Prep, In progress, and Complete. Preparation can include checklists, parts, messages, and a linked reservation.", "One operational record", "Keeping approval, preparation, fulfillment, stock use, and communication together prevents duplicate tracking and makes bottlenecks visible.", "[data-tutorial-id='facilities-workflow']"),
    ],
  },
  {
    id: "facilities-resources", title: "Space, warehouse, and reports", minutes: 2,
    steps: [
      step("facilities-resources", "facilities-space", "Coordinate space and setup", "Approve room requests, check conflicts, track liquor-license status, and automatically create the preparation work order.", "Connect reservations to execution", "The room calendar remains authoritative in this demo while preserving a future synchronization boundary for Outlook.", "[data-tutorial-id='facilities-spaces']"),
      step("facilities-resources", "facilities-stock", "Balance stock and custody", "Track on-hand quantities and reorder thresholds, then use lightweight check-out records for durable furniture or equipment.", "Avoid over- and under-buying", "Usage rates, reservations, open preparation, and current custody make future purchasing recommendations traceable.", "[data-tutorial-id='facilities-warehouse']"),
      step("facilities-resources", "facilities-map", "Use the operations map", "Select a room to see its reservation, work-order, capacity, and assigned-asset context together.", "A shared location model", "Floor-plan rooms connect records by stable location rather than relying on inconsistent free text.", "[data-tutorial-id='facilities-floor-plan']"),
    ],
  },
];

const facilitiesRequesterChapters: TutorialChapter[] = [
  orientation("facilities"),
  {
    id: "facilities-request", title: "Request and follow work", minutes: 2,
    steps: [
      step("facilities-request", "facilities-request-home", "Your department request home", "Submit a work order, office-supply request, or room reservation, then follow its current status and Facilities updates.", "Requester self-service", "Requesters see only their own department-facing records and do not receive approval queues, warehouse controls, or administrative reports.", "[data-tutorial-id='facilities-requester-home']"),
      step("facilities-request", "facilities-new-request", "Give Facilities the right details", "Choose the request type, location, timing, priority, and description. The confirmation becomes the one record you follow through completion.", "Structured intake", "Consistent fields support routing and trend analysis while keeping the form quick enough for routine use.", "[data-tutorial-id='facilities-new-request']"),
      step("facilities-request", "facilities-follow", "Follow approval and preparation", "Status, linked preparation, and messages stay together so you do not need to search a separate event or work-order inbox.", "Visible service status", "Every transition and notification is retained on the request without exposing other departments’ work.", "[data-tutorial-id='facilities-my-requests']"),
    ],
  },
];

function tutorialChapters(workspace: DemoTutorialWorkspace, persona: SyntheticPersonaKey): TutorialChapter[] {
  if (workspace === "pathway") return persona === "pathway_student" ? pathwayChapters : pathwayCreatorChapters;
  if (workspace === "facilities") return persona === "facilities_requester" ? facilitiesRequesterChapters : facilitiesAdminChapters;
  if (workspace === "impact") {
    if (persona === "impact_student") return impactStudentChapters;
    if (persona === "community_liaison") return impactLiaisonChapters;
    return impactAdministratorChapters;
  }
  if (persona === "compass_student") return compassStudentChapters;
  if (persona === "peer_tutor") return peerTutorChapters;
  if (persona === "tutoring_manager") return tutoringManagerChapters;
  return advisorChapters(persona);
}

export function demoTutorialChapters(workspace: DemoTutorialWorkspace, persona: SyntheticPersonaKey) { return tutorialChapters(workspace, persona); }
export function demoTutorialSteps(workspace: DemoTutorialWorkspace, persona: SyntheticPersonaKey) { return tutorialChapters(workspace, persona).flatMap((chapter) => chapter.steps); }

function loadStore(): TutorialStore {
  if (typeof window === "undefined") return { roles: {}, metrics: {} };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "{}") as Partial<TutorialStore>;
    return { roles: parsed.roles || {}, metrics: parsed.metrics || {} };
  } catch { return { roles: {}, metrics: {} }; }
}

function saveStore(store: TutorialStore) {
  window.localStorage.setItem(storageKey, JSON.stringify(store));
  window.dispatchEvent(new Event("navigate:tutorial-progress"));
}

function roleKey(workspace: DemoTutorialWorkspace, persona: SyntheticPersonaKey) { return `${workspace}:${persona}`; }
const pendingTutorialKey = "navigate.demo-tutorial.pending-role.v1";

type TutorialRoleOption = {
  key: SyntheticPersonaKey;
  label: string;
  description: string;
};

export function DemoWorkspaceTutorial({ workspace, persona, roleOptions, onPersona }: { workspace: DemoTutorialWorkspace; persona: SyntheticPersonaKey; roleOptions?: TutorialRoleOption[]; onPersona?: (persona: SyntheticPersonaKey) => void }) {
  const chapters = useMemo(() => tutorialChapters(workspace, persona), [persona, workspace]);
  const key = roleKey(workspace, persona);
  const storedAtMount = useMemo(() => loadStore().roles[key], [key]);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [audience, setAudience] = useState<DemoTutorialAudience>(storedAtMount?.audience || "learn");
  const [chapterId, setChapterId] = useState(storedAtMount?.currentChapterId || chapters[0].id);
  const [stepIndex, setStepIndex] = useState(storedAtMount?.currentStepIndex || 0);
  const [completed, setCompleted] = useState<string[]>(storedAtMount?.completedChapterIds || []);
  const [metrics, setMetrics] = useState<Record<string, TutorialMetric>>(() => loadStore().metrics);
  const titleId = useId();
  const bodyId = useId();
  const launchButton = useRef<HTMLButtonElement>(null);
  const firstRoleButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const openedAt = useRef(0);
  const chapter = chapters.find((item) => item.id === chapterId) || chapters[0];
  const safeIndex = Math.min(stepIndex, Math.max(0, chapter.steps.length - 1));
  const currentStep = chapter.steps[safeIndex];
  const totalSteps = chapters.reduce((sum, item) => sum + item.steps.length, 0);
  const completedSteps = chapters.reduce((sum, item) => sum + (completed.includes(item.id) ? item.steps.length : item.id === chapter.id ? safeIndex : 0), 0);
  const completePercent = Math.round((completedSteps / totalSteps) * 100);
  const isCreator = persona === "platform_creator";
  const hasProgress = Boolean(storedAtMount) || completed.length > 0 || stepIndex > 0;
  const roleQuestion = workspace === "facilities" ? "Which Facilities role would you like to explore?" : "Which Impact role would you like to explore?";

  const persist = useCallback((next?: Partial<SavedRoleProgress>, metricUpdate?: (metric: TutorialMetric) => TutorialMetric) => {
    const store = loadStore();
    const priorRole = store.roles[key];
    store.roles[key] = { ...priorRole, audience, currentChapterId: chapter.id, currentStepIndex: safeIndex, completedChapterIds: completed, ...next };
    if (metricUpdate) {
      const priorMetric = store.metrics[key] || { workspace, persona, starts: 0, completions: 0, skips: 0, activeSeconds: 0, updatedAt: new Date().toISOString() };
      store.metrics[key] = metricUpdate(priorMetric);
    }
    saveStore(store);
    setMetrics(store.metrics);
  }, [audience, chapter.id, completed, key, persona, safeIndex, workspace]);

  const recordElapsed = useCallback((skipped = false, completedTour = false) => {
    if (!openedAt.current) return;
    const seconds = Math.max(1, Math.round((Date.now() - openedAt.current) / 1000));
    openedAt.current = Date.now();
    persist(undefined, (metric) => ({ ...metric, activeSeconds: metric.activeSeconds + seconds, skips: metric.skips + (skipped ? 1 : 0), completions: metric.completions + (completedTour ? 1 : 0), lastStepId: currentStep.id, updatedAt: new Date().toISOString() }));
  }, [currentStep.id, persist]);

  const close = useCallback((skipped = true) => {
    recordElapsed(skipped);
    setOpen(false); setMenu(false); openedAt.current = 0;
    window.setTimeout(() => launchButton.current?.focus(), 0);
  }, [recordElapsed]);

  const start = useCallback(() => {
    const stored = loadStore().roles[key];
    const storedChapter = chapters.find((item) => item.id === stored?.currentChapterId);
    setAudience(stored?.audience || "learn");
    setChapterId(storedChapter?.id || chapters[0].id);
    setStepIndex(Math.min(stored?.currentStepIndex || 0, Math.max(0, (storedChapter || chapters[0]).steps.length - 1)));
    setCompleted(stored?.completedChapterIds || []);
    setMenu(false); setOpen(true); openedAt.current = Date.now();
    persist(undefined, (metric) => ({ ...metric, starts: metric.starts + 1, updatedAt: new Date().toISOString() }));
  }, [chapters, key, persist]);

  const launch = () => {
    if ((workspace === "impact" || workspace === "facilities") && roleOptions?.length && onPersona) {
      setRoleMenuOpen(true);
      window.setTimeout(() => firstRoleButton.current?.focus(), 0);
      return;
    }
    start();
  };

  const closeRoleMenu = () => {
    setRoleMenuOpen(false);
    window.setTimeout(() => launchButton.current?.focus(), 0);
  };

  const chooseTutorialRole = (nextPersona: SyntheticPersonaKey) => {
    setRoleMenuOpen(false);
    window.sessionStorage.setItem(pendingTutorialKey, roleKey(workspace, nextPersona));
    onPersona?.(nextPersona);
  };

  useEffect(() => {
    if (typeof window === "undefined" || window.sessionStorage.getItem(pendingTutorialKey) !== key) return;
    window.sessionStorage.removeItem(pendingTutorialKey);
    const task = window.setTimeout(start, 0);
    return () => window.clearTimeout(task);
  }, [key, start]);

  useEffect(() => {
    if (!roleMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeRoleMenu(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [roleMenuOpen]);

  const selectChapter = (nextChapterId: string, restart = false) => {
    recordElapsed(false);
    setChapterId(nextChapterId); setStepIndex(0); setMenu(false);
    const nextCompleted = restart ? completed.filter((id) => id !== nextChapterId) : completed;
    if (restart) setCompleted(nextCompleted);
    persist({ currentChapterId: nextChapterId, currentStepIndex: 0, completedChapterIds: nextCompleted });
  };

  const next = useCallback(() => {
    if (safeIndex < chapter.steps.length - 1) {
      const value = safeIndex + 1; setStepIndex(value); persist({ currentStepIndex: value }); return;
    }
    const nextCompleted = completed.includes(chapter.id) ? completed : [...completed, chapter.id];
    const chapterIndex = chapters.findIndex((item) => item.id === chapter.id);
    if (chapterIndex < chapters.length - 1) {
      const nextChapter = chapters[chapterIndex + 1];
      setCompleted(nextCompleted); setChapterId(nextChapter.id); setStepIndex(0);
      persist({ completedChapterIds: nextCompleted, currentChapterId: nextChapter.id, currentStepIndex: 0 }); return;
    }
    setCompleted(nextCompleted); recordElapsed(false, true);
    persist({ completedChapterIds: nextCompleted, currentStepIndex: 0, currentChapterId: chapters[0].id, completedAt: new Date().toISOString() });
    setOpen(false); openedAt.current = 0;
    window.setTimeout(() => launchButton.current?.focus(), 0);
  }, [chapter.id, chapter.steps.length, chapters, completed, persist, recordElapsed, safeIndex]);

  const back = useCallback(() => {
    if (safeIndex > 0) { const value = safeIndex - 1; setStepIndex(value); persist({ currentStepIndex: value }); return; }
    const chapterIndex = chapters.findIndex((item) => item.id === chapter.id);
    if (chapterIndex > 0) {
      const previous = chapters[chapterIndex - 1]; const previousIndex = previous.steps.length - 1;
      setChapterId(previous.id); setStepIndex(previousIndex); persist({ currentChapterId: previous.id, currentStepIndex: previousIndex });
    }
  }, [chapter.id, chapters, persist, safeIndex]);

  const restartAll = () => {
    const store = loadStore(); delete store.roles[key]; saveStore(store);
    setCompleted([]); setChapterId(chapters[0].id); setStepIndex(0); setMenu(false);
  };

  const changeAudience = (nextAudience: DemoTutorialAudience) => {
    setAudience(nextAudience);
    persist({ audience: nextAudience });
  };

  useEffect(() => {
    if (!open || menu) return;
    const target = document.querySelector<HTMLElement>(currentStep.selector);
    target?.setAttribute("data-demo-tutorial-highlight", "true");
    target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    nextButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); if (event.key === "ArrowRight") next(); if (event.key === "ArrowLeft") back(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { target?.removeAttribute("data-demo-tutorial-highlight"); window.removeEventListener("keydown", onKeyDown); };
  }, [back, close, currentStep.selector, menu, next, open]);

  return <>
    <button ref={launchButton} className="demo-tutorial-button" type="button" onClick={launch}><span aria-hidden="true">?</span> {roleOptions?.length ? "Tutorial" : hasProgress ? "Resume tutorial" : "Tutorial"}</button>
    {roleMenuOpen ? <div className="demo-tutorial-layer">
      <button className="demo-tutorial-scrim" type="button" aria-label="Close tutorial role chooser" onClick={closeRoleMenu} />
      <section className="demo-tutorial-card demo-tutorial-role-card" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
        <div className="demo-tutorial-card__heading"><span>{workspace === "facilities" ? "Facilities tutorial" : "Impact tutorial"}</span><button type="button" onClick={closeRoleMenu} aria-label="Close tutorial role chooser">×</button></div>
        <h2 id={titleId}>{roleQuestion}</h2>
        <p id={bodyId}>The dashboard will switch to that role before the guided tutorial begins.</p>
        <div className="demo-tutorial-role-options">{roleOptions?.map((item, index) => {
          const progress = loadStore().roles[roleKey(workspace, item.key)];
          return <button ref={index === 0 ? firstRoleButton : undefined} type="button" key={item.key} onClick={() => chooseTutorialRole(item.key)}><span><strong>{item.label}</strong><small>{item.description}</small></span><i>{progress?.completedAt ? "Review" : progress ? "Resume" : "Start"}</i></button>;
        })}</div>
        <small>Each role keeps separate progress in this browser. No entered content or real institutional data is collected.</small>
      </section>
    </div> : null}
    {open ? <div className="demo-tutorial-layer">
      <button className="demo-tutorial-scrim" type="button" aria-label="Close tutorial" onClick={() => close()} />
      <section className="demo-tutorial-card" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
        <div className="demo-tutorial-card__heading"><span>{menu ? "Tutorial chapters" : `${chapter.title} · ${safeIndex + 1} of ${chapter.steps.length}`}</span><button type="button" onClick={() => close()} aria-label="Close tutorial">×</button></div>
        <div className="demo-tutorial-audience" role="group" aria-label="Tutorial perspective"><button type="button" className={audience === "learn" ? "active" : ""} aria-pressed={audience === "learn"} onClick={() => changeAudience("learn")}>Learn this role</button><button type="button" className={audience === "leadership" ? "active" : ""} aria-pressed={audience === "leadership"} onClick={() => changeAudience("leadership")}>Leadership overview</button></div>
        <div className="demo-tutorial-progress" aria-label={`${completePercent}% of tutorial complete`}><i style={{ width: `${completePercent}%` }} /></div>
        {menu ? <div className="demo-tutorial-menu">
          <h2 id={titleId}>Choose a chapter</h2>
          <p id={bodyId}>About four minutes for the core tour. Progress is stored only in this browser.</p>
          <div className="demo-tutorial-chapters">{chapters.map((item) => <article key={item.id} className={completed.includes(item.id) ? "complete" : item.id === chapter.id ? "current" : ""}><span aria-hidden="true">{completed.includes(item.id) ? "✓" : "○"}</span><div><strong>{item.title}</strong><small>{item.minutes} min · {item.steps.length} steps</small></div><button type="button" onClick={() => selectChapter(item.id, completed.includes(item.id))}>{completed.includes(item.id) ? "Review" : item.id === chapter.id ? "Continue" : "Start"}</button></article>)}</div>
          {isCreator ? <section className="demo-tutorial-insights" data-tutorial-id="creator-tutorial-insights"><h2>Creator tutorial insights</h2><p>Browser-local demonstration activity only. No form values or student information are collected.</p><div>{Object.values(metrics).map((item) => <article key={`${item.workspace}:${item.persona}`}><strong>{item.persona.replaceAll("_", " ")}</strong><span>{item.completions} complete · {item.skips} exits · {Math.ceil(item.activeSeconds / 60)} min</span><small>Last step: {item.lastStepId || "Not started"}</small></article>)}</div></section> : null}
          <div className="demo-tutorial-menu__actions"><button type="button" className="text-button" onClick={restartAll}>Restart this role</button></div>
        </div> : <>
          <p className="demo-tutorial-chapter-label">Chapter {chapters.findIndex((item) => item.id === chapter.id) + 1} of {chapters.length}</p>
          <h2 id={titleId}>{audience === "leadership" ? currentStep.leadershipTitle : currentStep.title}</h2>
          <p id={bodyId}>{audience === "leadership" ? currentStep.leadershipBody : currentStep.body}</p>
          <p className="demo-tutorial-safety"><span aria-hidden="true">◇</span> Guided preview only. This tour never submits, publishes, approves, cancels, or sends a record.</p>
          <div className="demo-tutorial-actions"><button className="text-button" type="button" onClick={() => setMenu(true)}>Chapters</button><button className="text-button" type="button" disabled={chapters[0].id === chapter.id && safeIndex === 0} onClick={back}>Back</button><button ref={nextButton} className="primary-button" type="button" onClick={next}>{chapters.at(-1)?.id === chapter.id && safeIndex === chapter.steps.length - 1 ? "Finish" : "Next"}</button></div>
          <small>Use arrow keys to move between steps. Press Escape to close and resume later.</small>
        </>}
      </section>
    </div> : null}
  </>;
}
