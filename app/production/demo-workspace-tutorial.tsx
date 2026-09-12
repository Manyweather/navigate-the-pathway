"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { SyntheticPersonaKey } from "./synthetic-preview";

export type DemoTutorialWorkspace = "compass" | "impact" | "pathway";
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
    step("orientation", "role-boundary", "Learn this role safely", "Viewing as changes the fictional records and tools delivered to the dashboard. Student views never receive staff notes, rosters, or analytics.", "Demonstrate permission boundaries", "Use the role selector to show leaders that the same Compass shell returns a different, role-scoped response instead of hiding staff data only with styling.", "[data-demo-guide='role-switcher']"),
    step("orientation", "workspace-boundary", "Open only assigned workspaces", `The workspace control lists only destinations this ${workspace} role is allowed to use. Switching never grants another membership.`, "Explain the parent-platform model", "Compass is the account gateway. Pathway and Impact remain permission-isolated workspaces, while shared identity and communication services avoid duplicate accounts.", "[data-demo-guide='workspace-switcher']"),
  ],
});

const compassStudentChapters: TutorialChapter[] = [
  orientation("compass"),
  {
    id: "student-start", title: "Start here", minutes: 1,
    steps: [
      step("student-start", "student-home", "Your student home", "This banner places appointments, notifications, events, and check-in within thumb reach without exposing anyone else’s record.", "Student self-service", "The home surface prioritizes the highest-frequency mobile actions and reduces staff-dependent navigation.", ".compass-student-hero"),
      step("student-start", "student-actions", "Choose a next action", "Request an appointment, read notifications, open student-facing event details, show your check-in code, or review visits.", "Core service entry points", "Each icon routes students into a permission-safe flow. Staff event workspaces and advising notes are separate API scopes.", ".compass-hero-actions"),
    ],
  },
  {
    id: "student-support", title: "Appointments and support", minutes: 1,
    steps: [
      step("student-support", "student-next", "See what is next", "At-a-glance cards show the next visit and event, including a clear cancelled state and a rebook option.", "Reduce missed connections", "Status, event, and rebooking information is surfaced together so students do not have to reconcile separate systems.", ".compass-at-a-glance"),
      step("student-support", "student-availability", "Choose from your advisor’s time blocks", "Academic advising availability comes only from your assigned Academic Advisor. Times reflect their configured blocks, buffers, formats, and appointment length.", "Availability respects assignment", "The student payload excludes other Academic Advisors’ schedules. The default is 30 minutes, while advisors can intentionally configure shorter or longer visits.", "[data-tutorial-id='student-availability']"),
      step("student-support", "student-materials", "Keep your work together", "Requirements, private portfolio items, policy information, and tutoring support remain in your own Compass record.", "Longitudinal student record", "The student-facing record combines support history without exposing protected working notes or peer comparisons.", ".compass-secondary-actions"),
    ],
  },
  {
    id: "student-impact", title: "Affiliations and Impact", minutes: 1,
    steps: [step("student-impact", "student-affiliations", "Request an affiliation", "Declare an interest-group affiliation here. Impact appears only after an Impact Administrator or Community Liaison verifies it.", "Verified nested access", "Affiliation states are audited. Student Council is useful profile metadata but does not unlock Impact by itself.", ".hub-affiliations")],
  },
];

const peerTutorChapters: TutorialChapter[] = [
  orientation("compass"),
  {
    id: "tutor-today", title: "Today", minutes: 1,
    steps: [
      step("tutor-today", "tutor-home", "Your Peer Tutor workspace", "Tutor mode is separate from your student dashboard. It includes only tutoring work and the limited student context needed for each session.", "A secondary student role", "Peer Tutors retain student access while the tutor response is separately scoped. Advising notes, grades, portfolios, and unrelated records are removed before the tutor dashboard loads.", "[data-tutorial-id='tutor-home']"),
      step("tutor-today", "tutor-priorities", "Start with what needs attention", "See unanswered requests, today’s sessions, unread session messages, and documentation due within 24 hours.", "Operational accountability", "Response and documentation clocks produce explainable work queues. They never create a predictive student or tutor score.", "[data-tutorial-id='tutor-today']"),
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
        step("advisor-today", "advisor-metrics", "Scan today’s workload", "Appointments, pending requests, unread messages, and due actions are visible at a glance.", "Operational overview", "The dashboard summarizes work without using a predictive risk score; attention conditions remain explainable.", ".advisor-today-metrics"),
        step("advisor-today", "advisor-agenda", "Work the agenda", "Open the next session or follow an attention item into messages, tasks, milestones, or appointment requests.", "Traceable attention", "Every count links to its source work queue, supporting operational review without ranking students.", ".advisor-home-grid"),
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
        step("advisor-availability", "advisor-availability", "Set bookable time blocks", "Configure recurring days, start and end times, formats, locations, buffers, and appointment lengths. New appointments default to 30 minutes.", "Scheduling without Outlook", "These blocks power the synthetic student booking chart now and form the platform source rules that Outlook free/busy can later refine.", "[data-tutorial-id='advisor-tile-availability']"),
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

const impactStaffChapters: TutorialChapter[] = [
  orientation("impact"),
  {
    id: "impact-review", title: "Review and access", minutes: 2,
    steps: [
      step("impact-review", "impact-review-home", "Review, coach, and connect", "This home gathers affiliation verification, mentor review, event decisions, and Liaison activity.", "Impact governance overview", "Review queues make ownership and next decisions visible without allowing reviewers to overwrite student-authored work.", ".experience-hero--genesis"),
      step("impact-review", "impact-access", "Verify affiliation access", "Approve or decline each organization affiliation using the context supplied by the student.", "Least-privilege workspace access", "The first approved interest-group affiliation unlocks Impact; publishing remains limited to each separately verified organization.", "[data-tutorial-id='impact-access']"),
      step("impact-review", "impact-mentor", "Coach a preserved version", "Review submitted versions and return feedback while the reviewed snapshot remains unchanged.", "Version-safe mentoring", "Mentor feedback stays attached to the exact submitted version, supporting auditability and longitudinal learning.", "[data-tutorial-id='impact-review']"),
    ],
  },
  { id: "impact-event-approval", title: "Event decisions", minutes: 1, steps: [step("impact-event-approval", "impact-staff-events", "Move events through approval", "Review the event evidence and record the mentor or Liaison decision. This tour stops before any approval or publication action.", "Coordinated calendar controls", "Submitted events notify active Liaisons, conflicting decisions are prevented, and only dual-approved events publish.", "[data-tutorial-id='impact-events']")] },
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

function tutorialChapters(workspace: DemoTutorialWorkspace, persona: SyntheticPersonaKey): TutorialChapter[] {
  if (workspace === "pathway") return persona === "pathway_student" ? pathwayChapters : pathwayCreatorChapters;
  if (workspace === "impact") return persona === "impact_student" ? impactStudentChapters : impactStaffChapters;
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

export function DemoWorkspaceTutorial({ workspace, persona }: { workspace: DemoTutorialWorkspace; persona: SyntheticPersonaKey }) {
  const chapters = useMemo(() => tutorialChapters(workspace, persona), [persona, workspace]);
  const key = roleKey(workspace, persona);
  const storedAtMount = useMemo(() => loadStore().roles[key], [key]);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [audience, setAudience] = useState<DemoTutorialAudience>(storedAtMount?.audience || "learn");
  const [chapterId, setChapterId] = useState(storedAtMount?.currentChapterId || chapters[0].id);
  const [stepIndex, setStepIndex] = useState(storedAtMount?.currentStepIndex || 0);
  const [completed, setCompleted] = useState<string[]>(storedAtMount?.completedChapterIds || []);
  const [metrics, setMetrics] = useState<Record<string, TutorialMetric>>(() => loadStore().metrics);
  const titleId = useId();
  const bodyId = useId();
  const launchButton = useRef<HTMLButtonElement>(null);
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

  const start = () => {
    const stored = loadStore().roles[key];
    const storedChapter = chapters.find((item) => item.id === stored?.currentChapterId);
    setAudience(stored?.audience || "learn");
    setChapterId(storedChapter?.id || chapters[0].id);
    setStepIndex(Math.min(stored?.currentStepIndex || 0, Math.max(0, (storedChapter || chapters[0]).steps.length - 1)));
    setCompleted(stored?.completedChapterIds || []);
    setMenu(false); setOpen(true); openedAt.current = Date.now();
    persist(undefined, (metric) => ({ ...metric, starts: metric.starts + 1, updatedAt: new Date().toISOString() }));
  };

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
    <button ref={launchButton} className="demo-tutorial-button" type="button" onClick={start}><span aria-hidden="true">?</span> {hasProgress ? "Resume tutorial" : "Tutorial"}</button>
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
