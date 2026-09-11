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

const penjiOccurrenceRows = [
  ["Notetaking for Retention with Dr. van Tonder","2026-09-03","12:00","13:00","Innovation Hall Room 210",10,8,0],
  ["Bring Your Reset: Board Games","2026-09-02","12:00","13:00","Roadrunner Communities",18,18,0],
  ["From Burnout to Balance","2026-08-20","12:00","13:00","Innovation Hall Room 210",8,0,1],
  ["Ice Cream Social","2026-08-17","17:30","18:30","Student Affairs Suite",32,32,0],
  ["Bring Your Reset - Learn to Crochet","2026-05-07","12:00","13:00","Roadrunner Learning Communities",4,3,0],
  ["Drawing to Learn","2026-05-06","12:00","13:00","Innovation Hall Room 210",4,0,0],
  ["brAInstorm: Apps and AI","2026-04-14","12:00","13:00","Innovation Hall Room 210",9,9,0],
  ["Workshop Essential Word Formatting for MD Student Research","2026-03-26","08:00","09:00","Zoom",2,2,0],
  ["Coffee and Convo's","2026-03-25","15:45","16:45","Admissions Suite",1,0,0],
  ["Reading Skills for Medical School","2026-03-05","12:00","13:00","Innovation Hall Room 200",3,2,0],
  ["Academic and Social Empowerment with Dr. Wilson","2026-02-16","12:00","13:00","Innovation Hall Room 210",3,3,0],
  ["Made by Medicine","2025-12-10","12:00","17:00","Discovery 2nd Floor",30,30,0],
  ["Question Review Session - Biochemistry with Dr. Dilts","2025-10-15","16:00","17:00","Innovation Hall Classroom 210",13,13,0],
  ["Revisiting Goals","2025-10-13","11:00","12:00","Innovation 210",1,0,0],
  ["Reading Skills for Medical School","2025-09-23","16:00","17:00","Innovation Hall Room 210",2,0,0],
  ["Practical Practice Testing","2025-09-09","12:00","13:00","Innovation Hall Room 210",10,0,1],
  ["Plus Ones: Ice Cream Mixer","2025-08-25","17:30","18:30","Discovery Building- Student Affairs Suite",3,0,0],
  ["Coffee and Convos","2025-08-20","16:00","17:00","Innovation Hall Admissions Suite",1,0,0],
  ["Your Support Circle","2025-08-19","12:00","13:00","Auditorium",2,1,0],
  ["Stress Management and Wellness","2025-08-12","12:00","13:00","Auditorium",8,6,0],
  ["Notetaking for Retention","2025-08-07","12:00","13:00","Auditorium",12,9,3],
  ["Sit and Schedule","2025-08-04","09:00","10:00","Zoom",2,2,0],
] as const;

function penjiHistoryEvents(): SyntheticEvent[] {
  return penjiOccurrenceRows.map(([title,date,start,end,location,registered,present,absent],index) => ({
    id:`penji-occurrence-${index+1}`,
    title,
    description:"Imported Penji occurrence. Student identities have been replaced with synthetic records in creator preview.",
    imageUrl:null,
    imageAlt:null,
    hostName:"Compass event team",
    startsAt:zonedLocalIso(date,start),
    endsAt:zonedLocalIso(date,end),
    modality:/zoom|teams/i.test(location)?"teams":"in_person",
    location,
    capacity:null,
    registrationCount:registered,
    registered:false,
    status:"completed",
    audience:{includeAllMembers:true},
    formId:null,
    timezone:"America/Los_Angeles",
    canManage:true,
    presentCount:present,
    absentCount:absent,
    notRecordedCount:registered-present-absent,
    attendanceStatus:null,
    checkinOpen:false,
    sourceSystem:"penji",
  }));
}

function oacaEvents(): SyntheticEvent[] {
  return [
    { id: "event-today", title: "Learning Strategies Lab", description: "A practical, facilitated workshop for planning the next exam block. Bring your current study plan and leave with a focused weekly rhythm, accountability checkpoints, and a short list of questions for your advisor.", imageUrl: "/media/cohort-commons-poster.jpg", imageAlt: "Abstract Roseman event artwork with maroon points", hostName: "OACA Learning Support", startsAt: isoAt(0, 14), endsAt: isoAt(0, 15), modality: "in_person", location: "Discovery Room 214", capacity: 40, registrationCount: 24, registered: true, status: "published", audience: { includeAllStudents: true }, formId: null },
    { id: "event-upcoming", title: "Specialty Exploration Forum", description: "Meet clinicians representing several specialties, hear how they approached career decisions, and prepare useful questions for future career-advising conversations. Students may attend in person or through Teams.", imageUrl: "/media/reflection-studio-poster.jpg", imageAlt: "Abstract Roseman event artwork with a maroon letterform and grid", hostName: "OACA Career Advising", startsAt: isoAt(3, 16), endsAt: isoAt(3, 17, 30), modality: "hybrid", location: "Flagship Auditorium + Teams", capacity: null, registrationCount: 58, registered: true, status: "published", audience: { cohortLabels: ["Class of 2029"] }, formId: null },
    { id: "event-past", title: "Foundations Planning Session", description: "An interactive planning session focused on upcoming academic milestones, time management, and choosing the right advising support. This completed synthetic event demonstrates attendance history and follow-up.", imageUrl: "/assets/brand/oaca-emblem.png", imageAlt: "OACA emblem", hostName: "Office of Academic and Career Advising", startsAt: isoAt(-7, 12), endsAt: isoAt(-7, 13), modality: "in_person", location: "OACA Collaboration Room", capacity: 32, registrationCount: 21, registered: true, status: "completed", audience: { cohortLabels: ["Class of 2029"] }, formId: null },
  ];
}

const syntheticStaff = [
  { userId:"synthetic-creator",displayName:"Creator preview",groupKey:"administration",groupLabel:"Administration" },
  { userId:"staff-academic-1",displayName:"Dr. Morgan Lee",groupKey:"academic_advising",groupLabel:"Academic Advisors" },
  { userId:"staff-academic-2",displayName:"Dr. Morgan Patel",groupKey:"academic_advising",groupLabel:"Academic Advisors" },
  { userId:"staff-career-1",displayName:"Jordan Rivera",groupKey:"career_advising",groupLabel:"Career Advising" },
  { userId:"staff-tutoring-1",displayName:"Avery Chen",groupKey:"tutoring",groupLabel:"Tutoring" },
  { userId:"staff-faculty-1",displayName:"Dr. Cameron Brooks",groupKey:"faculty",groupLabel:"Faculty" },
];

const syntheticPeople = [
  ...syntheticStaff.map((person)=>({userId:person.userId,displayName:person.displayName,role:person.groupLabel})),
  {userId:"student-1",displayName:"Taylor Morgan",role:"Student · Class of 2029"},
  {userId:"student-2",displayName:"Riley Thompson",role:"Student · Class of 2029"},
  {userId:"student-3",displayName:"Cameron Ellis",role:"Student · Class of 2029"},
];

type SyntheticEventState = {
  events:SyntheticEvent[];
  hosts:Record<string,Array<{userId:string;displayName:string;role:string}>>;
  notices:Array<{id:string;eventId:string|null;category:string;title:string;body:string;deepLink:string;readAt:string|null;dismissedAt:string|null;createdAt:string}>;
  attendeeRules:Record<string,Array<{id:string;type:string;offsetMinutes:number|null;channels:string[];enabled:boolean;scheduledFor:string|null;generation:number}>>;
  coordinatorRules:Record<string,Array<{activityType:string;deliveryMode:"immediate"|"hourly"|"off";channels:string[]}>>;
};

const syntheticEventStorageKey="navigate.compass.synthetic-events.v2";

function defaultSyntheticEventState():SyntheticEventState {
  const events=[...oacaEvents(),...penjiHistoryEvents()].map((event)=>({
    ...event,timezone:"America/Los_Angeles",canManage:true,
    presentCount:event.presentCount??(event.id==="event-past"?18:2),
    absentCount:event.absentCount??(event.id==="event-past"?2:0),
    notRecordedCount:event.notRecordedCount??(event.id==="event-past"?1:Math.max(0,event.registrationCount-2)),
    attendanceStatus:event.id==="event-past"?"present" as const:null,checkinOpen:false,
  }));
  const hosts=Object.fromEntries(events.map((event)=>[event.id,[{userId:"synthetic-creator",displayName:"Creator preview",role:"owner"}]]));
  return {
    events,hosts,
    notices:[
      {id:"staff-notice-message",eventId:"event-today",category:"event_staff_message",title:"New event message",body:"A student asked a question about Learning Strategies Lab.",deepLink:"/app/oaca?event=event-today",readAt:null,dismissedAt:null,createdAt:isoAt(0,9)},
      {id:"staff-notice-rsvp",eventId:"event-upcoming",category:"event_staff_digest",title:"Specialty Exploration Forum activity",body:"12 RSVPs and 2 waitlist updates in the last hour.",deepLink:"/app/oaca?event=event-upcoming",readAt:null,dismissedAt:null,createdAt:isoAt(-1,11)},
    ],
    attendeeRules:Object.fromEntries(events.map((event)=>[event.id,[
      {id:`${event.id}-24h`,type:"reminder",offsetMinutes:1440,channels:["in_app","email"],enabled:true,scheduledFor:null,generation:1},
      {id:`${event.id}-1h`,type:"reminder",offsetMinutes:60,channels:["in_app","email"],enabled:true,scheduledFor:null,generation:1},
    ]])),
    coordinatorRules:Object.fromEntries(events.map((event)=>[event.id,[
      {activityType:"rsvp",deliveryMode:"hourly",channels:["in_app","email"]},
      {activityType:"waitlist",deliveryMode:"hourly",channels:["in_app","email"]},
      {activityType:"event_message",deliveryMode:"immediate",channels:["in_app","email"]},
      {activityType:"checkin",deliveryMode:"hourly",channels:["in_app"]},
      {activityType:"correction",deliveryMode:"immediate",channels:["in_app","email"]},
      {activityType:"delivery_failure",deliveryMode:"immediate",channels:["in_app"]},
      {activityType:"event_change",deliveryMode:"immediate",channels:["in_app","email"]},
    ]])),
  };
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

function syntheticRoster(event?:SyntheticEvent) {
  const total=Math.min(event?.registrationCount||3,76);
  const present=event?.presentCount??2;
  const absent=event?.absentCount??0;
  return Array.from({length:total},(_,index)=>({
    studentId:`synthetic-student-${String(index+1).padStart(2,"0")}`,
    displayName:`Synthetic student ${String(index+1).padStart(2,"0")}`,
    registrationStatus:index<present?"attended":index<present+absent?"no_show":"registered",
    registrationSource:event?.sourceSystem==="penji"?"import":"self",
    attendanceStatus:index<present?"present":index<present+absent?"absent":"not_recorded",
    attendanceSource:event?.sourceSystem==="penji"?"import":index<present?"staff":null,
    version:index<present+absent?1:0,
    updatedAt:event?.endsAt||new Date().toISOString(),
  }));
}

function eventWorkspace(state:SyntheticEventState,selectedId="") {
  const selected=state.events.find((event)=>event.id===selectedId);
  return {
    events:state.events,
    roster:selected?syntheticRoster(selected):[],
    hosts:selected?state.hosts[selected.id]||[]:[],
    staffOptions:syntheticStaff,
    audienceOptions:{
      cohorts:["Class of 2029","Class of 2030"],phases:["Foundations","Clerkship","Advanced"],years:["M1","M2","M3","M4"],campuses:["Summerlin","Henderson"],
      organizations:organizations.slice(0,18).map((item)=>({id:item.id,name:item.name,college:item.college})),
      memberRoles:[{key:"student",label:"Students"},{key:"faculty",label:"Faculty"},{key:"staff",label:"Staff"},{key:"administrator",label:"Administrators"}],
      people:syntheticPeople,
      providers:[{id:"provider-academic",displayName:"Dr. Morgan Lee"},{id:"provider-dropin",displayName:"Dr. Morgan Patel"}],
    },
    recipientVersion:selected?.status==="published"?1:0,
    recipientCount:selected?.audience?.includeAllMembers?126:selected?.registrationCount||0,
    coordinatorAlertRules:selected?state.coordinatorRules[selected.id]||[]:[],
    activity:selected?[{id:"activity-1",eventId:selected.id,activityType:"rsvp",summary:"Registration activity is available to event coordinators.",createdAt:isoAt(-1,10)}]:[],
    corrections:selected?[{ id: "correction-1", eventId: selected.id, studentId: "synthetic-student-02", displayName: "Synthetic student 02", requestedStatus: "present", explanation: "I checked in with event staff at the door.", status: "open", createdAt: isoAt(-1, 9) }]:[],
    notifications:state.notices.filter((notice)=>!notice.dismissedAt),
    preferences: { emailEnabled: true, smsEnabled: false, phoneVerified: false, quietHoursStart: "21:00:00", quietHoursEnd: "07:00:00", timezone: "America/Los_Angeles" },
    pushSubscriptions: [],
    notificationRules:selected?state.attendeeRules[selected.id]||[]:[],
    deliveries: { queued: 3, suppressed: 2, sent: 72, delivered: 70, failed: 2, opened: 46, clicked: 21, replied: 4 },
    threads:selected?[{ id: `thread-${selected.id}`, studentId: "synthetic-student-01", studentName: "Synthetic student 01", messages: [{ id: `message-${selected.id}`, senderId: "synthetic-student-01", body: "Where should I check in?", direction: "inbound", channel: "sms", createdAt: isoAt(0, 9) }] }]:[],
    unreadCount:state.notices.filter((notice)=>!notice.readAt&&!notice.dismissedAt).length,
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
  private appointments:SyntheticAppointment[] = oacaBootstrap().appointments;
  private eventState:SyntheticEventState=defaultSyntheticEventState();
  private eventsLoaded=false;

  private ensureEventsLoaded() {
    if(this.eventsLoaded)return;
    this.eventsLoaded=true;
    if(typeof window==="undefined")return;
    try {
      const saved=window.localStorage.getItem(syntheticEventStorageKey);
      if(saved){
        const parsed=JSON.parse(saved) as Partial<SyntheticEventState>;
        const defaults=defaultSyntheticEventState();
        const savedEvents=Array.isArray(parsed.events)?parsed.events.filter((event):event is SyntheticEvent=>Boolean(event&&typeof event.id==="string"&&typeof event.title==="string")):[];
        const savedIds=new Set(savedEvents.map((event)=>event.id));
        const requiredHistory=defaults.events.filter((event)=>event.sourceSystem==="penji"&&!savedIds.has(event.id));
        this.eventState={
          events:[...savedEvents,...requiredHistory],
          hosts:{...defaults.hosts,...(parsed.hosts||{})},
          notices:Array.isArray(parsed.notices)?parsed.notices:defaults.notices,
          attendeeRules:{...defaults.attendeeRules,...(parsed.attendeeRules||{})},
          coordinatorRules:{...defaults.coordinatorRules,...(parsed.coordinatorRules||{})},
        };
      }
    }
    catch { this.eventState=defaultSyntheticEventState(); }
  }

  private saveEvents() {
    if(typeof window!=="undefined")window.localStorage.setItem(syntheticEventStorageKey,JSON.stringify(this.eventState));
  }

  private previewAudience(audience:OacaAudience) {
    const exclusions=new Set(audience.excludeUserIds||[]);
    let count=audience.includeAllMembers?126:0;
    if(!count){
      count+=(audience.includeAllStudents?91:0)+(audience.cohortLabels?.length||0)*46+(audience.phases?.length||0)*34+(audience.years?.length||0)*24+(audience.campuses?.length||0)*60;
      count+=(audience.organizationIds?.length||0)*12+(audience.studentCouncil?9:0)+(audience.memberRoles?.length||0)*14+(audience.assignedProviderIds?.length||0)*28;
      count+=(audience.studentIds?.length||0)+(audience.userIds?.length||0);
      count=Math.min(126,count);
    }
    count=Math.max(0,count-exclusions.size);
    return {count,sample:syntheticPeople.filter((person)=>!exclusions.has(person.userId)).slice(0,6),excludedCount:exclusions.size};
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    this.ensureEventsLoaded();
    const route=path.split("?")[0];
    const method=(options.method||"GET").toUpperCase();
    if (path === "/api/platform/experiences") return clone({ context: syntheticPreviewContext, memberships: syntheticPreviewMemberships }) as T;
    if (path === "/api/platform/affiliations") {
      if ((options.method || "GET").toUpperCase() === "POST") {
        const body = options.body as { organizationIds?: string[]; studentCouncil?: boolean } | undefined;
        this.affiliationIds = body?.organizationIds || [];
        this.studentCouncil = Boolean(body?.studentCouncil);
      }
      return clone({ isStudent: true, organizations: organizations.map(({ id, key, name, college, campus, aliases }) => ({ id, key, name, college, campus, aliases })), organizationIds: this.affiliationIds, studentCouncil: this.studentCouncil }) as T;
    }
    if (path === "/api/oaca/bootstrap") return clone({ ...oacaBootstrap(), appointments: this.appointments, events:this.eventState.events }) as T;
    if (route === "/api/oaca/events/workspace") {
      const eventId=new URL(path,"https://preview.local").searchParams.get("eventId")||"";
      return clone(eventWorkspace(this.eventState,eventId)) as T;
    }
    if(route==="/api/oaca/events/audience-preview"&&method==="POST") {
      const body=options.body as {audience?:OacaAudience}|undefined;
      return clone(this.previewAudience(body?.audience||{})) as T;
    }
    if(route==="/api/oaca/events/recipients/refresh"&&method==="POST") {
      const body=options.body as {eventId?:string;audience?:OacaAudience;commit?:boolean}|undefined;
      const preview=this.previewAudience(body?.audience||{});
      if(body?.commit&&body.eventId){const event=this.eventState.events.find((item)=>item.id===body.eventId);if(event)event.audience=body.audience||{};this.saveEvents();}
      return clone({...preview,additions:Math.max(0,preview.count-24),removals:2,version:body?.commit?2:1}) as T;
    }
    if(route==="/api/oaca/events"&&method==="POST") {
      const body=(options.body||{}) as Record<string,unknown> & {audience?:OacaAudience;coordinatorUserIds?:string[];attendeeNotificationRules?:SyntheticEventState["attendeeRules"][string];coordinatorAlertRules?:SyntheticEventState["coordinatorRules"][string]};
      const id=`synthetic-event-${crypto.randomUUID()}`; const publish=body.action==="publish";
      const coordinators=[...new Set(["synthetic-creator",...(body.coordinatorUserIds||[])])];
      const record:SyntheticEvent={id,title:String(body.title||"Untitled event"),description:String(body.description||""),imageUrl:null,imageAlt:null,hostName:coordinators.map((userId)=>syntheticStaff.find((person)=>person.userId===userId)?.displayName).filter(Boolean).join(", "),startsAt:String(body.startsAt),endsAt:String(body.endsAt||body.startsAt),modality:String(body.modality||"in_person"),location:String(body.location||""),capacity:body.capacity?Number(body.capacity):null,registrationCount:0,registered:false,status:publish?"published":"draft",audience:body.audience||{includeAllMembers:true},formId:null,timezone:"America/Los_Angeles",canManage:true,presentCount:0,absentCount:0,notRecordedCount:0,attendanceStatus:null,checkinOpen:false,sourceSystem:null};
      this.eventState.events=[record,...this.eventState.events];
      this.eventState.hosts[id]=coordinators.map((userId)=>({userId,displayName:syntheticStaff.find((person)=>person.userId===userId)?.displayName||"Compass staff",role:"owner"}));
      this.eventState.attendeeRules[id]=body.attendeeNotificationRules||[];
      this.eventState.coordinatorRules[id]=body.coordinatorAlertRules||[];
      if(publish)this.eventState.notices.unshift({id:`notice-${id}`,eventId:id,category:"event_staff_change",title:`Published: ${record.title}`,body:`${this.previewAudience(record.audience).count} invitation recipients resolved.`,deepLink:`/app/oaca?event=${id}`,readAt:null,dismissedAt:null,createdAt:new Date().toISOString()});
      this.saveEvents();
      return clone({id,status:record.status,recipientCount:publish?this.previewAudience(record.audience).count:0}) as T;
    }
    if(route==="/api/oaca/events/update"&&method==="POST") {const body=options.body as Record<string,unknown>&{eventId:string};const event=this.eventState.events.find((item)=>item.id===body.eventId);if(event)Object.assign(event,{title:body.title??event.title,description:body.description??event.description,startsAt:body.startsAt??event.startsAt,endsAt:body.endsAt??event.endsAt,location:body.location??event.location,modality:body.modality??event.modality,capacity:body.capacity?Number(body.capacity):null});this.saveEvents();return clone(event||{ok:true}) as T;}
    if(route==="/api/oaca/events/publish"&&method==="POST") {const body=options.body as {eventId:string};const event=this.eventState.events.find((item)=>item.id===body.eventId);if(event)event.status="published";this.saveEvents();return clone(event||{ok:true}) as T;}
    if(route==="/api/oaca/events/cancel"&&method==="POST") {const body=options.body as {eventId:string};const event=this.eventState.events.find((item)=>item.id===body.eventId);if(event)event.status="cancelled";this.saveEvents();return clone(event||{ok:true}) as T;}
    if(route==="/api/oaca/events/hosts"&&method==="POST") {const body=options.body as {eventId:string;userId:string};const person=syntheticStaff.find((item)=>item.userId===body.userId);if(person&&!this.eventState.hosts[body.eventId]?.some((item)=>item.userId===body.userId))this.eventState.hosts[body.eventId]=[...(this.eventState.hosts[body.eventId]||[]),{userId:body.userId,displayName:person.displayName,role:"owner"}];this.saveEvents();return {ok:true} as T;}
    if(route==="/api/oaca/events/hosts"&&method==="DELETE") {const body=options.body as {eventId:string;userId:string};this.eventState.hosts[body.eventId]=(this.eventState.hosts[body.eventId]||[]).filter((item)=>item.userId!==body.userId);this.saveEvents();return {ok:true} as T;}
    if(route==="/api/oaca/event-notification-rules"&&method==="POST") {const body=options.body as {eventId:string;type:string;offsetMinutes:number|null;enabled:boolean;channels:string[]};const rules=this.eventState.attendeeRules[body.eventId]||[];const index=rules.findIndex((item)=>item.type===body.type&&item.offsetMinutes===body.offsetMinutes);const next={id:index>=0?rules[index].id:`rule-${crypto.randomUUID()}`,type:body.type,offsetMinutes:body.offsetMinutes,enabled:body.enabled,channels:body.channels,scheduledFor:null,generation:index>=0?rules[index].generation+1:1};if(index>=0)rules[index]=next;else rules.push(next);this.eventState.attendeeRules[body.eventId]=rules;this.saveEvents();return clone(next) as T;}
    if(route==="/api/oaca/event-coordinator-alert-rules"&&method==="POST") {const body=options.body as {eventId:string;rules:SyntheticEventState["coordinatorRules"][string]};this.eventState.coordinatorRules[body.eventId]=body.rules;this.saveEvents();return {ok:true} as T;}
    if(route==="/api/platform/notifications/action"&&method==="POST") {const body=options.body as {notificationId:string;action:"read"|"dismiss"};const notice=this.eventState.notices.find((item)=>item.id===body.notificationId);if(notice){if(body.action==="read")notice.readAt=new Date().toISOString();else notice.dismissedAt=new Date().toISOString();this.saveEvents();}return {ok:true} as T;}
    if(route==="/api/oaca/synthetic/reset"&&method==="POST") {this.eventState=defaultSyntheticEventState();this.saveEvents();return {ok:true} as T;}
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
      const appointment:SyntheticAppointment = { id: `appointment-${crypto.randomUUID()}`, studentId: "synthetic-creator", studentName: "Creator preview", serviceName: service?.name || "OACA appointment", providerName: provider?.displayName || (service?.key === "academic_advising" ? seed.assignedAdvisor.displayName : null), subject: body?.topic || null, format: body?.format || "individual", startsAt: body?.startsAt || null, endsAt: null, modality: body?.modality || "teams", status: "pending_approval", sandbox: true, requestOrigin: "student" };
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
