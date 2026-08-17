export type Role = "student" | "advisor" | "admin";
export type Screen = "start" | "orientation" | "intake" | "firstQuest" | "student" | "advisor" | "admin" | "tour";
export type StudentView = "next" | "explore" | "record" | "connect" | "stuff" | "export" | "destination";
export type RouteId = "chart" | "recover" | "story" | "explore" | "quiet" | "constellation" | "sustainable" | "assemble";
export type DestinationId = "course" | "experience" | "reflection" | "learning" | "support" | "community" | "story" | "advisor";
export type ArtifactKind = "course_plan" | "experience" | "reflection" | "learning_experiment" | "story" | "goal" | "action_plan";
export type DemoScenario = "student" | "advisor" | "admin" | "reviewer" | "migrated";
export type PersistenceStatus = "loading" | "saved" | "saving" | "unavailable" | "recovered";
export type WorkflowType = "first_activity" | "course" | "experience" | "reflection" | "learning" | "support" | "story" | "community_post" | "community_reply" | "advising";
export type DraftValue = string | number | boolean | string[];

export type Revision = { id: string; body: string; createdAt: string };
export type Artifact = { id: string; kind: ArtifactKind; title: string; body: string; domain: string; visibility: "private" | "packet"; metadata: Record<string, string | number | boolean>; revisions: Revision[]; createdAt: string; updatedAt: string };
type IntakeKey = "stage" | "intention" | "coursework" | "experienceAreas" | "records" | "reflection" | "cycle" | "bandwidth" | "participation" | "supportRoles";
export type IntakeAnswers = {
  stage: "junior" | "senior" | "gap" | "unsure" | null;
  intention: "courses" | "experiences" | "exposure" | "support" | "learning" | "application" | null;
  coursework: "mapped" | "uncertain" | "incomplete" | null;
  experienceAreas: string[] | null;
  records: "detailed" | "sparse" | "none" | null;
  reflection: "regular" | "some" | "none" | null;
  cycle: "near" | "later" | "unsure" | null;
  bandwidth: "low" | "medium" | "high" | null;
  participation: "observe" | "structured" | "open" | null;
  supportRoles: number | null;
  skippedFields: IntakeKey[];
  fictionalFields: IntakeKey[];
};
export type RouteRecommendation = { recommendedRoute: RouteId; alternateRoutes: RouteId[]; reasons: string[]; generatedAt: string };
export type CoursePlan = {
  id: string;
  name: string;
  state: "completed" | "enrolled" | "planned" | "uncertain" | "advisor-review";
  term: string;
  requirement: string;
  question: string;
  updatedAt: string;
  institution?: string;
  courseNumber?: string;
  academicYear?: string;
  academicStatus?: string;
  classification?: string;
  credits?: string;
  transcriptGrade?: string;
  labType?: string;
  specialCourseType?: string;
  transcriptChecked?: boolean;
  subjectArea?: string;
  prerequisiteRelationship?: string;
  challenge?: string;
  contact?: string;
  followUpDate?: string;
  privateNote?: string;
  shareWithAdvisor?: boolean;
  preferNoGrade?: boolean;
  rawCourseCode?: string;
  normalizedCourseCode?: string;
  matchStatus?: "exact" | "student_confirmed" | "advisor_confirmed" | "unmatched" | "ambiguous";
  matchedRequirementId?: string;
};
export type LearningExperiment = { id: string; strategy: string; prediction: string; intention: string; schedule: string; observation: string; result: string; adjustment: string; status: "planned" | "active" | "reviewed" };
export type SupportContact = { id: string; role: "academic" | "personal" | "professional"; label: string; helpsWith: string; contactMethod: string; nextContact: string; privateDetails: string };
export type CommunityPost = { id: string; author: string; type: "ask" | "study" | "offer" | "celebrate"; title: string; body: string; createdAt: string; reactions: number; reacted: boolean; replies: string[]; reported: boolean; muted: boolean };
export type PacketComment = { id: string; author: "student" | "advisor"; kind: "coaching_question" | "comment" | "next_action"; body: string; createdAt: string };
export type PacketEvent = { id: string; type: string; createdAt: string; safeDetail: string };
export type AdvisingPacket = { id: string; advisorId: string; advisorName: string; title: string; meetingGoal: string; questions: string[]; proposedActions: string[]; packetItemIds: string[]; status: "draft" | "shared" | "revoked" | "expired" | "complete"; expiresAt: string; comments: PacketComment[]; events: PacketEvent[]; updatedAt: string };
export type TrailEvent = { id: string; actionType: string; sourceId: string; earnedAt: string; label: string };
export type CheckInValue = "steady" | "stretched" | "reset";
export type CheckInEntry = { value: CheckInValue; at: string };
export type AdvisorProfile = { id: string; name: string; initials: string; role: string };
export type AdvisorDemoStudent = {
  id: string;
  name: string;
  initials: string;
  stage: string;
  focus: string;
  cycle: string;
  lastUpdated: string;
  packet: {
    status: "shared" | "expired" | "revoked";
    expiresAt: string;
    meetingGoal: string;
    questions: string[];
    proposedActions: string[];
    items: Array<Pick<Artifact, "id" | "kind" | "title" | "body" | "domain">>;
    comments: PacketComment[];
  };
};
export type WorkflowDraft = { key: string; workflow: WorkflowType; sourceId: string | null; fields: Record<string, DraftValue>; mode: string; updatedAt: string; submissionId: string };

export type DemoState = {
  version: 3; scenario: DemoScenario; screen: Screen; role: Role; orientationIndex: number; intake: IntakeAnswers; recommendation: RouteRecommendation | null; selectedRoute: RouteId | null; completedRoutes: RouteId[]; currentView: StudentView; activeDestination: DestinationId; workflowOrigin: StudentView; editingArtifactId: string | null;
  artifacts: Artifact[]; courses: CoursePlan[]; experiments: LearningExperiment[]; supports: SupportContact[]; communityPosts: CommunityPost[]; advisors: AdvisorProfile[]; packet: AdvisingPacket; trail: TrailEvent[]; drafts: Record<string, WorkflowDraft>;
  lastActiveAt: string; lastVisitStartedAt: string; returnSummary: string | null; checkIn: CheckInValue | null; checkIns: CheckInEntry[]; observedCommons: boolean; advisorReflection: string; advisorReflectionShared: boolean; announcement: string;
};
export type PersonaPreset = "sparse" | "quiet" | "overloaded" | "course" | "story" | "exposure" | "support" | "application";
export type DemoAction =
  | { type: "PATCH"; patch: Partial<DemoState> }
  | { type: "PATCH_INTAKE"; patch: Partial<IntakeAnswers> }
  | { type: "SKIP_INTAKE"; fields: IntakeKey[] }
  | { type: "ADD_ARTIFACT"; artifact: Artifact }
  | { type: "UPDATE_ARTIFACT"; artifact: Artifact }
  | { type: "UPSERT_COURSE"; course: CoursePlan }
  | { type: "UPSERT_EXPERIMENT"; experiment: LearningExperiment }
  | { type: "UPSERT_SUPPORT"; support: SupportContact }
  | { type: "ADD_POST"; post: CommunityPost }
  | { type: "UPDATE_POST"; post: CommunityPost }
  | { type: "PATCH_PACKET"; patch: Partial<AdvisingPacket>; event?: PacketEvent }
  | { type: "ADD_TRAIL"; event: TrailEvent }
  | { type: "ADD_CHECKIN"; checkIn: CheckInEntry }
  | { type: "UPSERT_DRAFT"; draft: WorkflowDraft }
  | { type: "CLEAR_DRAFT"; key: string }
  | { type: "OPEN_ARTIFACT"; artifactId: string; destination: DestinationId; origin?: StudentView }
  | { type: "LOAD_PRESET"; preset: PersonaPreset }
  | { type: "LOAD_SCENARIO"; scenario: "student" | "advisor" | "admin" }
  | { type: "SIMULATE_RETURN" }
  | { type: "RESET" };

export const routeContent: Record<RouteId, { title: string; destination: DestinationId; artifactKind: ArtifactKind; meaning: string; prompt: string }> = {
  chart: { title: "Chart the Route", destination: "course", artifactKind: "course_plan", meaning: "You turned uncertainty into a specific question and next step.", prompt: "Name one course decision or advisor question you want to clarify." },
  recover: { title: "Recover the Evidence", destination: "experience", artifactKind: "experience", meaning: "This gives future-you accurate material for later application work.", prompt: "Capture one experience and one detail you want to remember." },
  story: { title: "Find the Story", destination: "reflection", artifactKind: "reflection", meaning: "Reflection helps preserve learning and contribution.", prompt: "Choose one moment and name what changed in your understanding." },
  explore: { title: "Explore the Next Door", destination: "experience", artifactKind: "goal", meaning: "A small, sustained next step is useful.", prompt: "Name one realistic way to explore an area during the next 30 days." },
  quiet: { title: "Quiet Start", destination: "community", artifactKind: "goal", meaning: "Connection can begin without performing.", prompt: "Choose a private participation step: observe, react, or answer a structured prompt." },
  constellation: { title: "Build the Constellation", destination: "support", artifactKind: "action_plan", meaning: "Medicine is collaborative; preparation can be too.", prompt: "Name the support role you most want to strengthen and one next contact." },
  sustainable: { title: "Make It Sustainable", destination: "course", artifactKind: "action_plan", meaning: "A plan that fits your life is easier to use.", prompt: "Reduce one demand and protect one recovery block in the coming week." },
  assemble: { title: "Assemble the Evidence", destination: "story", artifactKind: "action_plan", meaning: "You can see what is ready, what needs revision, and whom to ask.", prompt: "Name the highest-priority saved entry to review and the person you will ask for perspective." },
};
const intentionRoute: Record<NonNullable<IntakeAnswers["intention"]>, RouteId> = { courses: "chart", experiences: "recover", exposure: "explore", support: "constellation", learning: "story", application: "assemble" };
const routeOrder: RouteId[] = ["assemble", "sustainable", "chart", "recover", "story", "explore", "quiet", "constellation"];
export function recommendRoute(intake: IntakeAnswers, completedRoutes: RouteId[] = []): RouteRecommendation {
  const scores = Object.fromEntries(routeOrder.map((id) => [id, 0])) as Record<RouteId, number>;
  const reasons: Partial<Record<RouteId, string[]>> = {};
  const add = (id: RouteId, score: number, reason: string) => { scores[id] += score; reasons[id] = [...(reasons[id] || []), reason]; };
  if (intake.intention) add(intentionRoute[intake.intention], 6, `you selected ${intake.intention} as useful right now`);
  if (intake.cycle === "near") add("assemble", 5, "you hope to apply within 12 months");
  if (intake.bandwidth === "low") add("sustainable", 7, "you asked for an activity that fits limited time and energy");
  if (intake.coursework && intake.coursework !== "mapped") add("chart", 5, "a course decision may benefit from review");
  if ((intake.experienceAreas?.length || 0) > 0 && intake.records && intake.records !== "detailed") add("recover", 5, "you have experiences you may want to record more fully");
  if (intake.records === "detailed" && intake.reflection && intake.reflection !== "regular") add("story", 5, "you have records you may want to reflect on");
  if (intake.experienceAreas && intake.experienceAreas.length < 2) add("explore", 5, "you selected a small experience landscape");
  if (intake.participation === "observe") add("quiet", 6, "you prefer to begin by observing");
  if (intake.supportRoles !== null && intake.supportRoles < 3) add("constellation", 5, "you named fewer than three kinds of support");
  completedRoutes.forEach((id) => { scores[id] -= 7; });
  const ranked = [...routeOrder].sort((a, b) => scores[b] - scores[a] || routeOrder.indexOf(a) - routeOrder.indexOf(b));
  return { recommendedRoute: ranked[0], alternateRoutes: ranked.slice(1, 3), reasons: reasons[ranked[0]] || ["it offers a useful, low-pressure place to begin"], generatedAt: nowIso() };
}

export const defaultIntake: IntakeAnswers = { stage: null, intention: null, coursework: null, experienceAreas: null, records: null, reflection: null, cycle: null, bandwidth: null, participation: null, supportRoles: null, skippedFields: [], fictionalFields: [] };
const filledIntake: IntakeAnswers = { stage: "senior", intention: "experiences", coursework: "uncertain", experienceAreas: ["Clinical or service", "Work or leadership"], records: "sparse", reflection: "some", cycle: "later", bandwidth: "medium", participation: "structured", supportRoles: 2, skippedFields: [], fictionalFields: [] };
export function matchingFictionalIntake(current: IntakeAnswers): IntakeAnswers {
  const stage = current.stage || "senior"; const intention = current.intention || "experiences";
  const filled: IntakeAnswers = { ...current, stage, intention, coursework: intention === "courses" ? "uncertain" : "mapped", experienceAreas: intention === "exposure" ? ["Coursework"] : stage === "junior" ? ["Coursework", "Community or campus"] : ["Clinical or service", "Work or leadership", "Coursework"], records: intention === "experiences" ? "sparse" : "detailed", reflection: intention === "learning" ? "none" : "some", cycle: intention === "application" || stage === "gap" ? "near" : stage === "junior" ? "later" : "unsure", bandwidth: intention === "courses" && stage !== "junior" ? "low" : "medium", participation: intention === "support" ? "observe" : "structured", supportRoles: intention === "support" ? 1 : 2, skippedFields: [], fictionalFields: ["stage","intention","coursework","experienceAreas","records","reflection","cycle","bandwidth","participation","supportRoles"] };
  return filled;
}
export function fictionalQuestExample(route: RouteId, intake: IntakeAnswers) {
  const stage = intake.stage || "unsure"; const stageLabel = stage === "gap" ? "gap-year planning" : stage === "unsure" ? "an exploratory stage" : `${stage} year`;
  const examples: Record<RouteId, { title: string; body: string; nextAction: string }> = {
    chart: { title: "Compare two fictional fall course plans", body: `As a student in ${stageLabel}, Jordan is deciding whether a fictional biochemistry course fits alongside work and a laboratory course.`, nextAction: "Add both weekly schedules and send one focused question to the fictional advisor." },
    recover: { title: "Campus welcome-team experience", body: "Jordan supported three fictional campus welcome events and learned to give clearer directions when several tasks arrived at once.", nextAction: "Add the coordinator role and revisit this record next week." },
    story: { title: "What clearer directions changed", body: "Jordan noticed that slowing down and checking what another person needed made the welcome table calmer.", nextAction: "Link this reflection to the fictional welcome-team record." },
    explore: { title: "Thirty-day research exploration", body: "Jordan will attend one fictional research information session and ask what entry-level participation involves.", nextAction: "Choose one information session date this week." },
    quiet: { title: "Private community starting choice", body: "Jordan will begin by reading one structured cohort discussion without posting.", nextAction: "Observe one fictional cohort thread for five minutes." },
    constellation: { title: "Strengthen professional support", body: "Jordan has academic and personal support but wants another professional perspective.", nextAction: "Draft one short, fictional request for a conversation." },
    sustainable: { title: "A smaller fictional fall plan", body: "Jordan will compare a reduced course plan and protect Wednesday evening for recovery.", nextAction: "Put the protected recovery block on the fictional weekly plan." },
    assemble: { title: "Review application evidence", body: "Jordan has several fictional records but needs to revise one experience description. No admissions score or prediction is involved.", nextAction: "Choose one record to revise before the next advising exchange." },
  }; return examples[route];
}

const seedNow = "2026-08-08T16:00:00.000Z";
const starterArtifacts: Artifact[] = [
  { id: "artifact-experience-clinic", kind: "experience", title: "Saturday clinic shift", body: "Helped a visitor understand what would happen next and noticed how much calm, specific language mattered.", domain: "Service and care", visibility: "private", metadata: { organization: "Community clinic example", role: "Volunteer", startDate: "2026-01-10", endDate: "2026-08-01", hours: 24, recurring: true, supervisor: "Program coordinator", context: "Fictional demonstration only" }, revisions: [], createdAt: seedNow, updatedAt: seedNow },
  { id: "artifact-reflection-listening", kind: "reflection", title: "What listening changed", body: "I entered the room focused on efficiency. Slowing down helped me understand that uncertainty was the visitor's biggest concern.", domain: "Communication", visibility: "private", metadata: { mode: "structured", linkedArtifactId: "artifact-experience-clinic" }, revisions: [], createdAt: seedNow, updatedAt: seedNow },
  { id: "artifact-learning-retrieval", kind: "learning_experiment", title: "Two-minute retrieval check", body: "After each biology study block, close the notes and write three ideas I can explain without looking.", domain: "Learning", visibility: "private", metadata: {}, revisions: [], createdAt: seedNow, updatedAt: seedNow },
  { id: "artifact-goal-fall", kind: "goal", title: "Build a realistic fall plan", body: "Clarify whether to take biochemistry before applying and protect one evening each week for rest.", domain: "Planning", visibility: "private", metadata: {}, revisions: [], createdAt: seedNow, updatedAt: seedNow },
];
const advisors: AdvisorProfile[] = [{ id: "advisor-chen", name: "Dr. Elena Chen", initials: "EC", role: "Premed faculty advisor" }, { id: "advisor-rivera", name: "Dr. Sam Rivera", initials: "SR", role: "Student success advisor" }];
function baseState(): DemoState {
  const visit = nowIso();
  return { version: 3, scenario: "student", screen: "start", role: "student", orientationIndex: 0, intake: structuredClone(defaultIntake), recommendation: null, selectedRoute: null, completedRoutes: [], currentView: "next", activeDestination: "experience", workflowOrigin: "explore", editingArtifactId: null,
    artifacts: structuredClone(starterArtifacts), courses: [{ id: "course-bio", name: "General Biology", state: "completed", term: "Spring 2026", requirement: "Fictional prerequisite example", question: "", updatedAt: seedNow }, { id: "course-biochem", name: "Biochemistry", state: "advisor-review", term: "Fall 2026", requirement: "Fictional preferred-course example", question: "What tradeoffs should I consider before adding this course?", updatedAt: seedNow }],
    experiments: [{ id: "experiment-retrieval", strategy: "Two-minute retrieval check", prediction: "I will notice gaps sooner.", intention: "If a study block ends, I will close my notes and retrieve three ideas.", schedule: "After the next three biology sessions", observation: "Short and manageable after session one.", result: "", adjustment: "", status: "active" }], supports: [{ id: "support-faculty", role: "academic", label: "Faculty advisor", helpsWith: "Course planning", contactMethod: "Email", nextContact: "Ask about biochemistry at the next advising exchange", privateDetails: "Private contact details are intentionally omitted." }],
    communityPosts: [{ id: "post-maya", author: "Maya R.", type: "ask", title: "How are you deciding whether to add one more science course?", body: "I can make it fit on paper, but I am considering lab time and work. What tradeoffs helped you decide?", createdAt: seedNow, reactions: 4, reacted: false, replies: ["I compared two weekly schedules before choosing."], reported: false, muted: false }, { id: "post-theo", author: "Theo L.", type: "study", title: "Quiet physiology study block tomorrow", body: "I will be in the library from 3 to 5 for retrieval rounds with quiet breaks. Join for any part.", createdAt: seedNow, reactions: 2, reacted: false, replies: [], reported: false, muted: false }], advisors,
    packet: { id: "packet-fall", advisorId: "", advisorName: "", title: "Fall planning conversation", meetingGoal: "", questions: [], proposedActions: [], packetItemIds: [], status: "draft", expiresAt: "2026-12-31T23:59:59.000Z", comments: [], events: [], updatedAt: seedNow },
    trail: [{ id: "trail-experience", actionType: "experience_saved", sourceId: "artifact-experience-clinic", earnedAt: seedNow, label: "Experience captured" }, { id: "trail-reflection", actionType: "reflection_saved", sourceId: "artifact-reflection-listening", earnedAt: seedNow, label: "Reflection recorded" }], drafts: {}, lastActiveAt: visit, lastVisitStartedAt: visit, returnSummary: null, checkIn: null, checkIns: [], observedCommons: false, advisorReflection: "", advisorReflectionShared: false, announcement: "" };
}
export function createDefaultState(): DemoState { return baseState(); }
export function createSharedScenarioState(role: "advisor" | "admin" = "advisor"): DemoState {
  const state = baseState(); const itemIds = ["artifact-experience-clinic", "artifact-reflection-listening", "artifact-goal-fall"];
  return { ...state, scenario: role, role, screen: role, intake: filledIntake, artifacts: state.artifacts.map((item) => ({ ...item, visibility: itemIds.includes(item.id) ? "packet" : "private" })), packet: { ...state.packet, advisorId: "advisor-chen", advisorName: "Dr. Elena Chen", meetingGoal: "Build a sustainable fall plan", questions: ["What tradeoffs should I consider before adding biochemistry?"], proposedActions: ["Sketch two course loads and mark the tradeoffs you notice."], packetItemIds: itemIds, status: "shared", comments: [{ id: "comment-chen", author: "advisor", kind: "coaching_question", body: "What would make the fall feel sustainable, not just possible?", createdAt: seedNow }], events: [{ id: "event-shared", type: "shared", createdAt: seedNow, safeDetail: "Advising share opened for invited advisor" }] } };
}
export const personaIntakes: Record<PersonaPreset, IntakeAnswers> = {
  sparse: { ...filledIntake, stage: "senior", intention: "experiences", records: "sparse", experienceAreas: ["Clinical or service", "Research"], reflection: "some" }, quiet: { ...filledIntake, intention: "support", coursework: "mapped", records: "detailed", reflection: "regular", participation: "observe", supportRoles: 3 }, overloaded: { ...filledIntake, intention: "courses", bandwidth: "low", coursework: "mapped", records: "detailed", reflection: "regular", supportRoles: 3 }, course: { ...filledIntake, intention: "courses", coursework: "uncertain", records: "detailed", reflection: "regular", supportRoles: 3 }, story: { ...filledIntake, intention: "learning", coursework: "mapped", records: "detailed", reflection: "none", supportRoles: 3 }, exposure: { ...filledIntake, intention: "exposure", coursework: "mapped", experienceAreas: ["Coursework"], records: "detailed", reflection: "regular", supportRoles: 3 }, support: { ...filledIntake, intention: "support", coursework: "mapped", records: "detailed", reflection: "regular", supportRoles: 1 }, application: { ...filledIntake, intention: "application", coursework: "mapped", records: "detailed", reflection: "regular", cycle: "near", supportRoles: 3 },
};
export const advisorDemoStudents: AdvisorDemoStudent[] = [
  {
    id: "student-jordan-lee",
    name: "Jordan Lee",
    initials: "JL",
    stage: "Senior",
    focus: "Course load and experience evidence",
    cycle: "Planning for a later cycle",
    lastUpdated: "2026-08-08T16:00:00.000Z",
    packet: {
      status: "shared",
      expiresAt: "2026-12-31T23:59:59.000Z",
      meetingGoal: "Build a sustainable fall plan",
      questions: ["What tradeoffs should I consider before adding biochemistry?"],
      proposedActions: ["Sketch two course loads and mark the tradeoffs I notice.", "Choose one experience entry to revise before the meeting."],
      items: [
        { id: "jordan-experience", kind: "experience", title: "Saturday clinic shift", body: "Helped a visitor understand what would happen next and noticed how much calm, specific language mattered.", domain: "Service and care" },
        { id: "jordan-reflection", kind: "reflection", title: "What listening changed", body: "I entered the room focused on efficiency. Slowing down helped me understand that uncertainty was the visitor's biggest concern.", domain: "Communication" },
        { id: "jordan-goal", kind: "goal", title: "Build a realistic fall plan", body: "Clarify whether to take biochemistry before applying and protect one evening each week for rest.", domain: "Planning" },
      ],
      comments: [{ id: "jordan-comment", author: "advisor", kind: "coaching_question", body: "What would make the fall feel sustainable, not just possible?", createdAt: "2026-08-08T16:00:00.000Z" }],
    },
  },
  {
    id: "student-maya-bennett",
    name: "Maya Bennett",
    initials: "MB",
    stage: "Junior",
    focus: "Research exploration and support",
    cycle: "Application cycle is more than one year away",
    lastUpdated: "2026-08-10T18:30:00.000Z",
    packet: {
      status: "shared",
      expiresAt: "2026-11-30T23:59:59.000Z",
      meetingGoal: "Choose a realistic first research exploration step",
      questions: ["How can I evaluate whether a research setting will offer useful mentoring?"],
      proposedActions: ["Attend one research information session.", "Draft two questions about entry-level participation and mentoring."],
      items: [
        { id: "maya-goal", kind: "goal", title: "Thirty-day research exploration", body: "Attend one fictional research information session and ask what entry-level participation involves.", domain: "Exploration" },
        { id: "maya-action", kind: "action_plan", title: "Questions for a research conversation", body: "Ask how new students are supported, how feedback is provided, and what a manageable weekly commitment looks like.", domain: "Support" },
      ],
      comments: [],
    },
  },
  {
    id: "student-theo-morgan",
    name: "Theo Morgan",
    initials: "TM",
    stage: "Senior",
    focus: "Reflection and story development",
    cycle: "Application timing is undecided",
    lastUpdated: "2026-08-09T15:15:00.000Z",
    packet: { status: "expired", expiresAt: "2026-08-09T23:59:59.000Z", meetingGoal: "", questions: [], proposedActions: [], items: [], comments: [] },
  },
  {
    id: "student-alex-rivera",
    name: "Alex Rivera",
    initials: "AR",
    stage: "Gap-year planning",
    focus: "Application preparation",
    cycle: "Planning to apply within 12 months",
    lastUpdated: "2026-08-07T20:00:00.000Z",
    packet: { status: "revoked", expiresAt: "2026-10-31T23:59:59.000Z", meetingGoal: "", questions: [], proposedActions: [], items: [], comments: [] },
  },
];
export function makeId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
export function nowIso() { return new Date().toISOString(); }
export function makeArtifact(kind: ArtifactKind, title: string, body: string, domain: string, metadata: Artifact["metadata"] = {}): Artifact { const createdAt = nowIso(); return { id: makeId("artifact"), kind, title, body, domain, visibility: "private", metadata, revisions: [], createdAt, updatedAt: createdAt }; }
export function makeDraft(key: string, workflow: WorkflowType, fields: Record<string, DraftValue>, sourceId: string | null = null, mode = "default", submissionId = makeId("submission")): WorkflowDraft { return { key, workflow, sourceId, fields, mode, updatedAt: nowIso(), submissionId }; }
export function sensitiveSignals(value: string): string[] { const checks: [RegExp,string][] = [[/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,"an email address"],[/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/,"a phone number"],[/\b(?:MRN|medical record|patient named|participant named)\b/i,"identifying record language"],[/\b(?:DOB|date of birth)\b/i,"a date-of-birth reference"],[/\b\d{7,12}\b/,"a long identification number"]]; return checks.filter(([pattern]) => pattern.test(value)).map(([,label]) => label); }
export function advisorVisibleArtifacts(state: DemoState): Artifact[] { const active = state.packet.status === "shared" && new Date(state.packet.expiresAt).getTime() > Date.now(); if (!active) return []; return state.packet.packetItemIds.map((id) => state.artifacts.find((item) => item.id === id)).filter((item): item is Artifact => Boolean(item)); }
export function studentArtifacts(state: DemoState) { return state.artifacts; }
export function communityVisiblePosts(state: DemoState) { return state.communityPosts.filter((post) => !post.muted); }
export const REENGAGEMENT_THRESHOLD_MS = 10 * 24 * 60 * 60 * 1000;
export function meaningfulInactivityStart(lastActiveAt: string, at = new Date(), thresholdMs = REENGAGEMENT_THRESHOLD_MS) { const last = new Date(lastActiveAt).getTime(); return Number.isFinite(last) && at.getTime() - last >= thresholdMs ? lastActiveAt : null; }
export function prepareReturn(state: DemoState, at = new Date()): DemoState { const last = new Date(state.lastActiveAt).getTime(); const now = at.getTime(); if (state.screen === "start" || !Number.isFinite(last) || now - last < 30 * 60 * 1000) return { ...state, lastActiveAt: at.toISOString() }; const latest = [...state.artifacts].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0]; const draft = Object.values(state.drafts).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0]; const response = state.packet.comments.filter((item) => item.author === "advisor").at(-1); const pieces = [latest && `Last saved: ${latest.title}.`, draft && `Unfinished: ${draft.workflow.replaceAll("_", " ")}.`, response && "An advisor response is ready.", "Your recommended next activity is shown below."].filter(Boolean); return { ...state, screen: "student", role: "student", currentView: "next", returnSummary: pieces.join(" "), lastVisitStartedAt: at.toISOString(), lastActiveAt: at.toISOString(), announcement: "Welcome back. Your saved work and unfinished draft are still here." }; }
function draftHasContent(draft: WorkflowDraft) {
  if (draft.workflow === "advising") return Boolean(draft.fields.advisorId || String(draft.fields.meetingGoal || "").trim() || String(draft.fields.questions || "").trim() || String(draft.fields.proposedActions || "").trim() || (Array.isArray(draft.fields.selectedIds) && draft.fields.selectedIds.length));
  const defaults = new Set(["planned", "academic", "quick", "ask", "Service", "default"]);
  return Object.entries(draft.fields).some(([key, value]) => key !== "confirmed" && key !== "details" && (Array.isArray(value) ? value.length > 0 : typeof value === "boolean" ? value : typeof value === "number" ? value !== 0 : Boolean(value.trim()) && !defaults.has(value)));
}
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  const touched = { lastActiveAt: nowIso() };
  switch (action.type) {
    case "PATCH": return { ...state, ...action.patch, ...touched };
    case "PATCH_INTAKE": { const keys = Object.keys(action.patch).filter((key) => !["skippedFields","fictionalFields"].includes(key)) as IntakeKey[]; return { ...state, intake: { ...state.intake, ...action.patch, skippedFields: state.intake.skippedFields.filter((key) => !keys.includes(key)), fictionalFields: action.patch.fictionalFields || state.intake.fictionalFields }, ...touched }; }
    case "SKIP_INTAKE": { const values = Object.fromEntries(action.fields.map((field) => [field, field === "experienceAreas" ? null : null])); return { ...state, intake: { ...state.intake, ...values, skippedFields: [...new Set([...state.intake.skippedFields, ...action.fields])] }, ...touched }; }
    case "ADD_ARTIFACT": return state.artifacts.some((item) => item.id === action.artifact.id) ? state : { ...state, artifacts: [action.artifact, ...state.artifacts], announcement: `${action.artifact.title} saved privately.`, ...touched };
    case "UPDATE_ARTIFACT": return { ...state, artifacts: state.artifacts.map((item) => item.id === action.artifact.id ? action.artifact : item), editingArtifactId: null, announcement: `${action.artifact.title} updated.`, ...touched };
    case "UPSERT_COURSE": return { ...state, courses: [action.course, ...state.courses.filter((item) => item.id !== action.course.id)], announcement: "Course plan saved.", ...touched };
    case "UPSERT_EXPERIMENT": return { ...state, experiments: [action.experiment, ...state.experiments.filter((item) => item.id !== action.experiment.id)], announcement: "Study strategy saved.", ...touched };
    case "UPSERT_SUPPORT": return { ...state, supports: [action.support, ...state.supports.filter((item) => item.id !== action.support.id)], announcement: "Support role saved privately.", ...touched };
    case "ADD_POST": return state.communityPosts.some((item) => item.id === action.post.id) ? state : { ...state, communityPosts: [action.post, ...state.communityPosts], announcement: "Fictional community post added.", ...touched };
    case "UPDATE_POST": return { ...state, communityPosts: state.communityPosts.map((item) => item.id === action.post.id ? action.post : item), announcement: "Community action saved.", ...touched };
    case "PATCH_PACKET": { const packet = { ...state.packet, ...action.patch, updatedAt: nowIso(), events: action.event ? [action.event, ...state.packet.events] : state.packet.events }; const selected = packet.status === "shared" ? new Set(packet.packetItemIds) : new Set<string>(); return { ...state, packet, artifacts: state.artifacts.map((item) => ({ ...item, visibility: selected.has(item.id) ? "packet" : "private" })), announcement: "Advising share updated.", ...touched }; }
    case "ADD_TRAIL": return state.trail.some((item) => item.actionType === action.event.actionType && item.sourceId === action.event.sourceId) ? state : { ...state, trail: [action.event, ...state.trail], announcement: `Action stamp earned: ${action.event.label}.`, ...touched };
    case "ADD_CHECKIN": return { ...state, checkIn: action.checkIn.value, checkIns: [action.checkIn, ...(state.checkIns || [])], announcement: "Check-in saved privately.", ...touched };
    case "UPSERT_DRAFT": { if (!draftHasContent(action.draft)) { const drafts = { ...state.drafts }; delete drafts[action.draft.key]; return { ...state, drafts, ...touched }; } return { ...state, drafts: { ...state.drafts, [action.draft.key]: action.draft }, ...touched }; }
    case "CLEAR_DRAFT": { const drafts = { ...state.drafts }; delete drafts[action.key]; return { ...state, drafts, ...touched }; }
    case "OPEN_ARTIFACT": return { ...state, screen: "student", role: "student", currentView: "destination", activeDestination: action.destination, editingArtifactId: action.artifactId, workflowOrigin: action.origin || "stuff", ...touched };
    case "LOAD_PRESET": { const intake = personaIntakes[action.preset]; return { ...baseState(), scenario: "reviewer", screen: "intake", intake, recommendation: recommendRoute(intake), announcement: `${action.preset} reviewer scenario loaded.` }; }
    case "LOAD_SCENARIO": return action.scenario === "student" ? { ...baseState(), screen: "orientation" } : createSharedScenarioState(action.scenario);
    case "SIMULATE_RETURN": { const old = { ...state, lastActiveAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString() }; return prepareReturn(old); }
    case "RESET": return baseState();
    default: return state;
  }
}
