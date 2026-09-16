export type FacilitiesRequestStatus = "new_request" | "approval" | "prep" | "in_progress" | "complete";

export const facilitiesRequestStages: Array<{ key: FacilitiesRequestStatus; label: string }> = [
  { key: "new_request", label: "New request" },
  { key: "approval", label: "Approvals" },
  { key: "prep", label: "Prep" },
  { key: "in_progress", label: "In progress" },
  { key: "complete", label: "Complete" },
];

export const facilitiesEventStages = ["draft", "submitted", "under_review", "approved", "prep", "ready", "in_progress", "completed", "cancelled"] as const;

export type FacilitiesEventSpecification = {
  id: string;
  section: "Room layout" | "Furniture and equipment" | "AV and technology" | "Catering and deliveries" | "Accessibility" | "Security and access" | "Cleaning and reset" | "Staffing and deadlines";
  requirement: string;
  status: "required" | "optional" | "completed" | "not_applicable";
  owner: string;
  dueOn: string;
  version: number;
};

export type FacilitiesInformationRequest = {
  id: string;
  eventId: string;
  affectedStep: "approval" | "preparation";
  question: string;
  dueOn: string;
  requestedFields: string[];
  attachmentNames: string[];
  status: "open" | "responded" | "accepted";
  requestedBy: string;
  requestedAt: string;
  response: string | null;
  responseAttachmentNames: string[];
  respondedAt: string | null;
};

export type FacilitiesSupplyStatus = "submitted" | "auto_approved" | "approval_required" | "reserved" | "picking" | "ready" | "delivered" | "partially_fulfilled" | "backordered" | "declined" | "cancelled";

export type FacilitiesSupplyRequest = {
  id: string;
  itemId: string;
  itemName: string;
  requester: string;
  department: string;
  deliveryLocation: string;
  quantity: number;
  fulfilledQuantity: number;
  neededBy: string;
  status: FacilitiesSupplyStatus;
  owner: string | null;
  restricted: boolean;
  crossDepartment: boolean;
  history: Array<{ id: string; text: string; at: string; actor: string }>;
};

export type FacilitiesNotification = {
  id: string;
  audience: "administrator" | "staff" | "requester";
  type: "urgent" | "overdue" | "unassigned" | "approval" | "response" | "delivery" | "status";
  title: string;
  detail: string;
  recordId: string;
  recordType: "work_request" | "event" | "supply" | "key";
  urgency: "routine" | "attention" | "urgent";
  read: boolean;
  createdAt: string;
};

export type FacilitiesRequest = {
  id: string;
  title: string;
  category: "work_order" | "event_setup" | "office_supplies";
  requester: string;
  department: string;
  location: string;
  priority: "routine" | "soon" | "urgent";
  status: FacilitiesRequestStatus;
  description: string;
  requestedFor: string;
  assignedTo: string | null;
  prepTasks: Array<{ id: string; label: string; complete: boolean }>;
  parts: Array<{ itemId: string; name: string; quantity: number }>;
  reservationId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: Array<{ id: string; channel: "in_platform" | "email"; body: string; sentAt: string; sender: string }>;
  dentalEquipment?: boolean;
  attachmentNames?: string[];
  customer?: { name: string; email: string; phone: string } | null;
};

export type FacilitiesKeyRequest = {
  id: string;
  requester: string;
  holder: string;
  employeeId: string;
  jobTitle: string;
  department: string;
  context: "new_access" | "additional_keys" | "key_exchange";
  locations: string[];
  startsOn: string;
  endsOn: string | null;
  revokeOnSeparation: boolean;
  exteriorAccess: boolean;
  entryMethod: "physical_key" | "card_or_fob";
  priority: "routine" | "soon" | "urgent";
  fundSource: string;
  billingCode: string;
  sponsoringDepartment: string;
  approver: string;
  notes: string;
  status: "request" | "approval" | "ready" | "issued" | "declined";
  createdAt: string;
};

export type FacilitiesAccessRequest = {
  id: string;
  requester: string;
  requestedAccess: string;
  status: "pending" | "approved" | "declined";
  createdAt: string;
};

export type FacilitiesReservation = {
  id: string;
  title: string;
  organization: string;
  roomId: string;
  roomName: string;
  date: string;
  startsAt: string;
  endsAt: string;
  eventType: string;
  attendees: number;
  alcohol: boolean;
  liquorLicenseStatus: "not_required" | "needed" | "received";
  status: "pending" | "approved" | "declined" | "cancelled";
  requestedBy: string;
  setupNotes: string;
  linkedRequestId: string | null;
  campus?: "Summerlin Campus" | "Henderson Campus";
  coordinator?: string;
  coordinatorEmail?: string;
  lifecycleStage?: "draft" | "submitted" | "under_review" | "approved" | "prep" | "ready" | "in_progress" | "completed" | "cancelled";
  accessibility?: string;
  catering?: string;
  security?: string;
  communications?: string;
  attendanceStatus?: "not_started" | "open" | "complete";
  specifications?: FacilitiesEventSpecification[];
  specificationVersion?: number;
  informationRequests?: FacilitiesInformationRequest[];
  pausedSteps?: Array<"approval" | "preparation">;
  activityHistory?: Array<{ id: string; text: string; at: string; actor: string }>;
  createdAt?: string;
};

export type FacilitiesStockItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  onHand: number;
  reorderPoint: number;
  target: number;
  unit: string;
  location: string;
  averageWeeklyUse: number;
  lastCounted: string;
  ownerDepartment?: string;
  campus?: "Summerlin Campus" | "Henderson Campus";
  shareable?: boolean;
  condition?: "new" | "good" | "worn" | "needs_attention";
  photoName?: string | null;
};

export type FacilitiesCustody = {
  id: string;
  itemName: string;
  quantity: number;
  holder: string;
  holderType: "person" | "department" | "room" | "event";
  checkedOutAt: string;
  dueAt: string | null;
  condition: "good" | "worn" | "needs_attention";
};

export type FacilitiesRoom = {
  id: string;
  name: string;
  building: string;
  floor: string;
  capacity: number;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hours: string;
  features: string[];
};

export type FacilitiesDemoState = {
  requests: FacilitiesRequest[];
  keyRequests: FacilitiesKeyRequest[];
  accessRequests: FacilitiesAccessRequest[];
  reservations: FacilitiesReservation[];
  supplyRequests: FacilitiesSupplyRequest[];
  notifications: FacilitiesNotification[];
  stock: FacilitiesStockItem[];
  custody: FacilitiesCustody[];
  dashboardSections: string[];
  hiddenDashboardSections: string[];
  activity: Array<{ id: string; text: string; at: string }>;
  rooms: FacilitiesRoom[];
  mapUploads: Array<{ id: string; campus: string; floor: string; fileName: string; uploadedAt: string }>;
};

const now = "2026-09-15T09:00:00-07:00";

export const facilitiesRooms: FacilitiesRoom[] = [
  { id: "room-101", name: "Conference Room 101", building: "Summerlin Campus", floor: "First floor", capacity: 14, type: "Conference room", x: 8, y: 9, width: 28, height: 25, hours: "7:00 AM–8:00 PM", features: ["Display", "Teams", "Whiteboard"] },
  { id: "room-102", name: "Collaboration Room 102", building: "Summerlin Campus", floor: "First floor", capacity: 8, type: "Meeting room", x: 40, y: 9, width: 22, height: 25, hours: "7:00 AM–8:00 PM", features: ["Display", "Whiteboard"] },
  { id: "room-103", name: "Community Hall", building: "Summerlin Campus", floor: "First floor", capacity: 120, type: "Event space", x: 66, y: 9, width: 28, height: 55, hours: "6:00 AM–10:00 PM", features: ["Stage", "AV", "Accessible entrance", "Catering access"] },
  { id: "room-104", name: "Operations Office", building: "Summerlin Campus", floor: "First floor", capacity: 6, type: "Office", x: 8, y: 41, width: 28, height: 23, hours: "7:30 AM–5:00 PM", features: ["Staff only"] },
  { id: "room-105", name: "Warehouse", building: "Summerlin Campus", floor: "First floor", capacity: 10, type: "Storage", x: 40, y: 41, width: 22, height: 23, hours: "7:00 AM–4:30 PM", features: ["Staff only", "Loading access"] },
  { id: "room-106", name: "Classroom 106", building: "Summerlin Campus", floor: "First floor", capacity: 48, type: "Classroom", x: 8, y: 72, width: 54, height: 20, hours: "6:30 AM–9:00 PM", features: ["Lecture capture", "AV", "Accessible seating"] },
  { id: "room-107", name: "Receiving", building: "Summerlin Campus", floor: "First floor", capacity: 4, type: "Receiving", x: 66, y: 72, width: 28, height: 20, hours: "7:00 AM–3:30 PM", features: ["Loading access"] },
  { id: "room-h201", name: "Henderson Conference 201", building: "Henderson Campus", floor: "Second floor", capacity: 18, type: "Conference room", x: 8, y: 10, width: 38, height: 28, hours: "7:00 AM–8:00 PM", features: ["Display", "Zoom", "Whiteboard"] },
  { id: "room-h202", name: "Henderson Training 202", building: "Henderson Campus", floor: "Second floor", capacity: 54, type: "Classroom", x: 52, y: 10, width: 40, height: 45, hours: "6:30 AM–9:00 PM", features: ["Lecture capture", "AV", "Accessible seating"] },
  { id: "room-h203", name: "Henderson Commons", building: "Henderson Campus", floor: "Second floor", capacity: 80, type: "Event space", x: 8, y: 64, width: 84, height: 25, hours: "7:00 AM–9:00 PM", features: ["Flexible furniture", "AV", "Catering access"] },
];

export const facilitiesVenueCatalogSummary = [
  { campus: "Henderson Campus", count: 53, examples: "Classrooms, breakout rooms, lounges, parking, and outdoor space" },
  { campus: "Summerlin Campus", count: 25, examples: "Classrooms, study rooms, lobbies, commons, courtyards, and parking" },
  { campus: "Other and off-campus", count: 6, examples: "Administrative, component, and special-purpose spaces" },
];

export const facilitiesDirectory = [
  { id: "contact-1", name: "Mike Neary", role: "Facilities Administrator", group: "Leadership", campus: "Both campuses", specialty: "Approvals, event specifications, and escalation", email: "mike.neary@example.edu", phone: "702-555-0140" },
  { id: "contact-2", name: "Jordan Kim", role: "Facilities Coordinator", group: "Work Orders", campus: "Summerlin Campus", specialty: "Events and room preparation", email: "jordan.kim@example.edu", phone: "702-555-0141" },
  { id: "contact-3", name: "Sam Patel", role: "Warehouse Specialist", group: "Warehouse", campus: "Summerlin Campus", specialty: "Inventory and receiving", email: "sam.patel@example.edu", phone: "702-555-0142" },
  { id: "contact-4", name: "Morgan Chen", role: "Campus Events Coordinator", group: "Events and Spaces", campus: "Both campuses", specialty: "Reservations and event lifecycle", email: "morgan.chen@example.edu", phone: "702-555-0143" },
  { id: "contact-5", name: "Facilities Help Desk", role: "Request support", group: "Help Desk", campus: "Both campuses", specialty: "Routing and urgent calls", email: "facilities@example.edu", phone: "702-555-0100" },
  { id: "contact-6", name: "Nina Foster", role: "Facilities Technician", group: "Work Orders", campus: "Henderson Campus", specialty: "Electrical and room systems", email: "nina.foster@example.edu", phone: "702-555-0144" },
  { id: "contact-7", name: "Leo Martinez", role: "Facilities Technician", group: "Work Orders", campus: "Summerlin Campus", specialty: "Furniture and preventative maintenance", email: "leo.martinez@example.edu", phone: "702-555-0145" },
];

const whiteCoatSpecifications: FacilitiesEventSpecification[] = [
  { id: "spec-1", section: "Room layout", requirement: "18 rounds with accessible aisles and two registration tables", status: "completed", owner: "Jordan Kim", dueOn: "2026-09-17", version: 2 },
  { id: "spec-2", section: "Furniture and equipment", requirement: "Stage podium, 144 chairs, and coat-rack staging", status: "required", owner: "Jordan Kim", dueOn: "2026-09-18", version: 2 },
  { id: "spec-3", section: "AV and technology", requirement: "Lectern microphone and confidence monitor sound check", status: "required", owner: "Nina Foster", dueOn: "2026-09-18", version: 2 },
  { id: "spec-4", section: "Accessibility", requirement: "Reserved seating and continuous accessible route", status: "required", owner: "Morgan Chen", dueOn: "2026-09-17", version: 2 },
  { id: "spec-5", section: "Cleaning and reset", requirement: "Post-event reset to standard hall configuration", status: "optional", owner: "Facilities queue", dueOn: "2026-09-19", version: 2 },
];

const alumniInformationRequests: FacilitiesInformationRequest[] = [
  { id: "RFI-18", eventId: "RSV-2206", affectedStep: "approval", question: "Please provide the catering vendor, certificate of insurance, and final alcohol-service window.", dueOn: "2026-09-18", requestedFields: ["Catering vendor", "Insurance certificate", "Service window"], attachmentNames: ["insurance-requirements.pdf"], status: "open", requestedBy: "Mike Neary", requestedAt: "2026-09-15T09:10:00-07:00", response: null, responseAttachmentNames: [], respondedAt: null },
];

export const initialFacilitiesDemoState: FacilitiesDemoState = {
  requests: [
    { id: "WO-1048", title: "Repair leaking sink in student commons", category: "work_order", requester: "Dana Lewis", department: "Student Affairs", location: "Student Commons", priority: "urgent", status: "approval", description: "Water is collecting beneath the east sink cabinet.", requestedFor: "2026-09-15", assignedTo: null, prepTasks: [], parts: [], reservationId: null, createdAt: "2026-09-15T07:42:00-07:00", updatedAt: "2026-09-15T07:42:00-07:00", messages: [] },
    { id: "WO-1047", title: "Prepare Community Hall for White Coat reception", category: "event_setup", requester: "Morgan Chen", department: "Campus Events", location: "Community Hall", priority: "soon", status: "prep", description: "Set 18 rounds, podium, two registration tables, and accessible aisle.", requestedFor: "2026-09-18", assignedTo: "Jordan Kim", prepTasks: [{ id: "task-1", label: "Confirm final room diagram", complete: true }, { id: "task-2", label: "Pull 144 chairs", complete: false }, { id: "task-3", label: "Stage podium and microphone", complete: false }], parts: [{ itemId: "stock-chair", name: "Stacking chair", quantity: 144 }], reservationId: "RSV-2204", createdAt: "2026-09-10T10:20:00-07:00", updatedAt: "2026-09-15T08:10:00-07:00", messages: [{ id: "msg-1", channel: "email", body: "Setup plan confirmed with event coordinator.", sentAt: "2026-09-15T08:10:00-07:00", sender: "Jordan Kim" }] },
    { id: "WO-1046", title: "Replace flickering corridor light", category: "work_order", requester: "Riley Moore", department: "College of Medicine", location: "North corridor", priority: "routine", status: "in_progress", description: "Fixture outside Classroom 106 flickers intermittently.", requestedFor: "2026-09-16", assignedTo: "Mike Neary", prepTasks: [{ id: "task-4", label: "Confirm fixture model", complete: true }], parts: [{ itemId: "stock-led", name: "LED tube lamp", quantity: 2 }], reservationId: null, createdAt: "2026-09-12T13:05:00-07:00", updatedAt: "2026-09-15T08:30:00-07:00", messages: [] },
    { id: "WO-1045", title: "Deliver printer paper to Admissions", category: "office_supplies", requester: "Taylor Grant", department: "Admissions", location: "Admissions Suite", priority: "routine", status: "new_request", description: "Two cases of letter-size copy paper.", requestedFor: "2026-09-17", assignedTo: null, prepTasks: [], parts: [{ itemId: "stock-paper", name: "Copy paper case", quantity: 2 }], reservationId: null, createdAt: "2026-09-14T15:20:00-07:00", updatedAt: "2026-09-14T15:20:00-07:00", messages: [] },
    { id: "WO-1044", title: "Reset conference room seating", category: "event_setup", requester: "Avery Brooks", department: "Academic Affairs", location: "Conference Room 101", priority: "routine", status: "complete", description: "Return room to standard 14-seat layout.", requestedFor: "2026-09-12", assignedTo: "Jordan Kim", prepTasks: [{ id: "task-5", label: "Reset tables and chairs", complete: true }], parts: [], reservationId: "RSV-2201", createdAt: "2026-09-11T08:00:00-07:00", updatedAt: "2026-09-12T16:15:00-07:00", messages: [] },
    { id: "WO-1043", title: "Inspect Henderson training-room HVAC", category: "work_order", requester: "Morgan Chen", department: "Campus Events", location: "Henderson Training 202", priority: "soon", status: "prep", description: "Verify airflow before the community training program.", requestedFor: "2026-09-17", assignedTo: "Nina Foster", prepTasks: [{ id: "task-6", label: "Review service history", complete: true }, { id: "task-7", label: "Pull replacement filter", complete: false }], parts: [{ itemId: "stock-filter", name: "HVAC filter 20×25", quantity: 1 }], reservationId: null, createdAt: "2026-09-13T09:00:00-07:00", updatedAt: "2026-09-15T09:00:00-07:00", messages: [] },
    { id: "WO-1042", title: "Replace damaged lobby bench", category: "work_order", requester: "Casey Bell", department: "University Advancement", location: "Summerlin exterior/grounds", priority: "routine", status: "new_request", description: "Bench has a cracked support and should remain out of service.", requestedFor: "2026-09-28", assignedTo: null, prepTasks: [], parts: [], reservationId: null, createdAt: "2026-09-14T10:00:00-07:00", updatedAt: "2026-09-14T10:00:00-07:00", messages: [] },
    { id: "WO-1041", title: "Restore classroom door closer", category: "work_order", requester: "Riley Moore", department: "College of Medicine", location: "Classroom 106", priority: "urgent", status: "in_progress", description: "Door is not closing completely.", requestedFor: "2026-09-14", assignedTo: "Leo Martinez", prepTasks: [], parts: [], reservationId: null, createdAt: "2026-09-13T07:30:00-07:00", updatedAt: "2026-09-15T09:05:00-07:00", messages: [] },
  ],
  keyRequests: [
    { id: "KR-307", requester: "Dana Lewis", holder: "Dana Lewis", employeeId: "E10427", jobTitle: "Program Coordinator", department: "Student Affairs", context: "additional_keys", locations: ["Innovation Hall", "Student Affairs storage"], startsOn: "2026-09-18", endsOn: null, revokeOnSeparation: true, exteriorAccess: false, entryMethod: "card_or_fob", priority: "routine", fundSource: "Student Affairs operations", billingCode: "SA-210", sponsoringDepartment: "Student Affairs", approver: "Avery Brooks", notes: "Evening event support requires storage access.", status: "approval", createdAt: "2026-09-14T11:20:00-07:00" },
    { id: "KR-306", requester: "Riley Moore", holder: "Riley Moore", employeeId: "E09881", jobTitle: "Faculty", department: "College of Medicine", context: "new_access", locations: ["Henderson Training 202"], startsOn: "2026-09-08", endsOn: null, revokeOnSeparation: true, exteriorAccess: true, entryMethod: "card_or_fob", priority: "soon", fundSource: "College operations", billingCode: "COM-100", sponsoringDepartment: "College of Medicine", approver: "Program Administration", notes: "Instructional access for recurring sessions.", status: "ready", createdAt: "2026-09-03T09:10:00-07:00" },
    { id: "KR-301", requester: "Taylor Grant", holder: "Taylor Grant", employeeId: "E08731", jobTitle: "Admissions Specialist", department: "Admissions", context: "key_exchange", locations: ["Admissions Suite"], startsOn: "2026-08-20", endsOn: null, revokeOnSeparation: true, exteriorAccess: false, entryMethod: "physical_key", priority: "routine", fundSource: "Admissions", billingCode: "ADM-115", sponsoringDepartment: "Admissions", approver: "Admissions Director", notes: "Exchange completed after lock change.", status: "issued", createdAt: "2026-08-18T14:30:00-07:00" },
    { id: "KR-299", requester: "Casey Bell", holder: "Contract caterer", employeeId: "N/A", jobTitle: "Vendor", department: "University Advancement", context: "new_access", locations: ["Community Hall catering entrance"], startsOn: "2026-09-24", endsOn: "2026-09-24", revokeOnSeparation: true, exteriorAccess: true, entryMethod: "card_or_fob", priority: "routine", fundSource: "University Advancement", billingCode: "UA-410", sponsoringDepartment: "University Advancement", approver: "Mike Neary", notes: "Declined until insurance documentation is received.", status: "declined", createdAt: "2026-09-12T14:30:00-07:00" },
    { id: "KR-298", requester: "Morgan Chen", holder: "Temporary event assistant", employeeId: "E10998", jobTitle: "Event Assistant", department: "Campus Events", context: "new_access", locations: ["Community Hall"], startsOn: "2026-09-01", endsOn: "2026-09-20", revokeOnSeparation: true, exteriorAccess: false, entryMethod: "card_or_fob", priority: "routine", fundSource: "Campus Events", billingCode: "EVT-205", sponsoringDepartment: "Campus Events", approver: "Mike Neary", notes: "Access ends after the White Coat reception.", status: "issued", createdAt: "2026-08-28T08:30:00-07:00" },
  ],
  accessRequests: [
    { id: "AR-41", requester: "Dana Lewis", requestedAccess: "Event reservation reporting for Student Affairs", status: "pending", createdAt: "2026-09-15T08:15:00-07:00" },
  ],
  reservations: [
    { id: "RSV-2204", title: "White Coat reception", organization: "College of Medicine", roomId: "room-103", roomName: "Community Hall", date: "2026-09-18", startsAt: "17:00", endsAt: "20:00", eventType: "Reception", attendees: 110, alcohol: false, liquorLicenseStatus: "not_required", status: "approved", requestedBy: "Morgan Chen", setupNotes: "Rounds, podium, registration, accessible aisle.", linkedRequestId: "WO-1047", campus: "Summerlin Campus", coordinator: "Morgan Chen", coordinatorEmail: "morgan.chen@example.edu", lifecycleStage: "prep", accessibility: "Accessible aisle and reserved seating", catering: "Catering access at 3:30 PM", security: "Exterior doors staffed from 4:30 PM", communications: "Guest reminder scheduled", attendanceStatus: "not_started", createdAt: "2026-09-01T10:00:00-07:00" },
    { id: "RSV-2205", title: "Faculty planning meeting", organization: "Academic Affairs", roomId: "room-101", roomName: "Conference Room 101", date: "2026-09-16", startsAt: "10:00", endsAt: "11:30", eventType: "Meeting", attendees: 12, alcohol: false, liquorLicenseStatus: "not_required", status: "approved", requestedBy: "Avery Brooks", setupNotes: "Standard layout.", linkedRequestId: null, campus: "Summerlin Campus", coordinator: "Avery Brooks", coordinatorEmail: "avery.brooks@example.edu", lifecycleStage: "ready", accessibility: "Standard accessible route", catering: "None", security: "Not required", communications: "Calendar invitation sent", attendanceStatus: "not_started", createdAt: "2026-09-08T13:00:00-07:00" },
    { id: "RSV-2208", title: "Student organization planning hold", organization: "Student Affairs", roomId: "room-102", roomName: "Collaboration Room 102", date: "2026-09-16", startsAt: "10:00", endsAt: "11:00", eventType: "Meeting", attendees: 6, alcohol: false, liquorLicenseStatus: "not_required", status: "pending", requestedBy: "Dana Lewis", setupNotes: "Tentative hold awaiting coordinator confirmation.", linkedRequestId: null, campus: "Summerlin Campus", coordinator: "Dana Lewis", coordinatorEmail: "dana.lewis@example.edu", lifecycleStage: "submitted", accessibility: "Standard accessible route", catering: "None", security: "Not required", communications: "Not started", attendanceStatus: "not_started", createdAt: "2026-09-15T08:45:00-07:00" },
    { id: "RSV-2206", title: "Alumni networking reception", organization: "University Advancement", roomId: "room-103", roomName: "Community Hall", date: "2026-09-24", startsAt: "18:00", endsAt: "20:30", eventType: "Reception", attendees: 90, alcohol: true, liquorLicenseStatus: "needed", status: "pending", requestedBy: "Casey Bell", setupNotes: "Cocktail rounds, check-in, stage, and catering access.", linkedRequestId: null, campus: "Summerlin Campus", coordinator: "Casey Bell", coordinatorEmail: "casey.bell@example.edu", lifecycleStage: "under_review", accessibility: "Accessible entrance requested", catering: "Vendor details pending", security: "Review required", communications: "Invitation draft", attendanceStatus: "not_started", createdAt: "2026-09-11T09:30:00-07:00" },
    { id: "RSV-2202", title: "Student Council planning", organization: "Student Council", roomId: "room-102", roomName: "Collaboration Room 102", date: "2026-09-15", startsAt: "15:00", endsAt: "16:00", eventType: "Student organization", attendees: 8, alcohol: false, liquorLicenseStatus: "not_required", status: "approved", requestedBy: "Taylor Morgan", setupNotes: "No special setup.", linkedRequestId: null, campus: "Summerlin Campus", coordinator: "Taylor Morgan", coordinatorEmail: "taylor.morgan@example.edu", lifecycleStage: "in_progress", accessibility: "Standard accessible route", catering: "None", security: "Not required", communications: "Reminder delivered", attendanceStatus: "open", createdAt: "2026-09-10T11:00:00-07:00" },
    { id: "RSV-2207", title: "Henderson community partner briefing", organization: "Community Engagement", roomId: "room-h201", roomName: "Henderson Conference 201", date: "2026-09-22", startsAt: "13:00", endsAt: "14:30", eventType: "Community event", attendees: 16, alcohol: false, liquorLicenseStatus: "not_required", status: "pending", requestedBy: "Dana Lewis", setupNotes: "Hybrid meeting with accessible seating.", linkedRequestId: null, campus: "Henderson Campus", coordinator: "Dana Lewis", coordinatorEmail: "dana.lewis@example.edu", lifecycleStage: "submitted", accessibility: "Accessible seating", catering: "Coffee service requested", security: "Guest list due", communications: "Not started", attendanceStatus: "not_started", createdAt: "2026-09-15T08:00:00-07:00" },
    { id: "RSV-2210", title: "White Coat reception setup review", organization: "College of Medicine", roomId: "room-103", roomName: "Community Hall", date: "2026-09-18", startsAt: "12:00", endsAt: "16:00", eventType: "Reception", attendees: 110, alcohol: false, liquorLicenseStatus: "not_required", status: "approved", requestedBy: "Morgan Chen", setupNotes: "Final operational review before guest arrival.", linkedRequestId: "WO-1047", campus: "Summerlin Campus", coordinator: "Morgan Chen", coordinatorEmail: "morgan.chen@example.edu", lifecycleStage: "prep", accessibility: "Accessible aisle and reserved seating", catering: "Delivery at 3:30 PM", security: "Exterior doors staffed", communications: "Guest reminder scheduled", attendanceStatus: "not_started", specifications: whiteCoatSpecifications, specificationVersion: 2, informationRequests: [], pausedSteps: [], activityHistory: [{ id: "evt-act-1", text: "Specification version 2 published", at: "2026-09-15T08:20:00-07:00", actor: "Mike Neary" }], createdAt: "2026-09-01T10:00:00-07:00" },
    { id: "RSV-2209", title: "New employee orientation", organization: "Human Resources", roomId: "room-h202", roomName: "Henderson Training 202", date: "2026-09-30", startsAt: "08:30", endsAt: "12:00", eventType: "Training", attendees: 35, alcohol: false, liquorLicenseStatus: "not_required", status: "pending", requestedBy: "Jamie Ortiz", setupNotes: "Classroom seating with two welcome tables.", linkedRequestId: null, campus: "Henderson Campus", coordinator: "Jamie Ortiz", coordinatorEmail: "jamie.ortiz@example.edu", lifecycleStage: "draft", accessibility: "To be confirmed", catering: "Coffee and pastries", security: "Not required", communications: "Draft", attendanceStatus: "not_started", specifications: [], specificationVersion: 0, informationRequests: [], pausedSteps: [], activityHistory: [], createdAt: "2026-09-15T10:00:00-07:00" },
    { id: "RSV-2206A", title: "Alumni networking reception review", organization: "University Advancement", roomId: "room-103", roomName: "Community Hall", date: "2026-09-24", startsAt: "18:00", endsAt: "20:30", eventType: "Reception", attendees: 90, alcohol: true, liquorLicenseStatus: "needed", status: "pending", requestedBy: "Dana Lewis", setupNotes: "Cocktail rounds, check-in, stage, and catering access.", linkedRequestId: null, campus: "Summerlin Campus", coordinator: "Casey Bell", coordinatorEmail: "casey.bell@example.edu", lifecycleStage: "under_review", accessibility: "Accessible entrance requested", catering: "Vendor details pending", security: "Review required", communications: "Information request delivered", attendanceStatus: "not_started", specifications: [], specificationVersion: 0, informationRequests: alumniInformationRequests, pausedSteps: ["approval"], activityHistory: [{ id: "evt-act-2", text: "Information requested from Dana Lewis", at: "2026-09-15T09:10:00-07:00", actor: "Mike Neary" }], createdAt: "2026-09-11T09:30:00-07:00" },
    { id: "RSV-2198", title: "Admissions open house", organization: "Admissions", roomId: "room-103", roomName: "Community Hall", date: "2026-09-05", startsAt: "09:00", endsAt: "13:00", eventType: "Open house", attendees: 84, alcohol: false, liquorLicenseStatus: "not_required", status: "approved", requestedBy: "Taylor Grant", setupNotes: "Welcome tables, presentation seating, and tour staging.", linkedRequestId: null, campus: "Summerlin Campus", coordinator: "Taylor Grant", coordinatorEmail: "taylor.grant@example.edu", lifecycleStage: "completed", accessibility: "Accessible route confirmed", catering: "Boxed lunches", security: "Guest check-in completed", communications: "Follow-up sent", attendanceStatus: "complete", specifications: [], specificationVersion: 1, informationRequests: [], pausedSteps: [], activityHistory: [{ id: "evt-act-3", text: "Event completed and room reset", at: "2026-09-05T15:00:00-07:00", actor: "Jordan Kim" }], createdAt: "2026-08-12T09:00:00-07:00" },
    { id: "RSV-2197", title: "Department planning retreat", organization: "Academic Affairs", roomId: "room-h203", roomName: "Henderson Commons", date: "2026-09-08", startsAt: "09:00", endsAt: "15:00", eventType: "Retreat", attendees: 40, alcohol: false, liquorLicenseStatus: "not_required", status: "cancelled", requestedBy: "Avery Brooks", setupNotes: "Cancelled by department.", linkedRequestId: null, campus: "Henderson Campus", coordinator: "Avery Brooks", coordinatorEmail: "avery.brooks@example.edu", lifecycleStage: "cancelled", accessibility: "Not applicable", catering: "Cancelled", security: "Not applicable", communications: "Cancellation delivered", attendanceStatus: "not_started", specifications: [], specificationVersion: 1, informationRequests: [], pausedSteps: [], activityHistory: [{ id: "evt-act-4", text: "Event cancelled by requester", at: "2026-09-02T11:00:00-07:00", actor: "Avery Brooks" }], createdAt: "2026-08-20T09:00:00-07:00" },
  ],
  supplyRequests: [
    { id: "SUP-318", itemId: "stock-paper", itemName: "Copy paper case", requester: "Taylor Grant", department: "Admissions", deliveryLocation: "Admissions Suite", quantity: 2, fulfilledQuantity: 0, neededBy: "2026-09-17", status: "auto_approved", owner: "Sam Patel", restricted: false, crossDepartment: false, history: [{ id: "sup-h-1", text: "Automatically approved within routine quantity limit", at: "2026-09-15T08:00:00-07:00", actor: "Warehouse rules" }] },
    { id: "SUP-317", itemId: "stock-markers", itemName: "Presentation marker set", requester: "Dana Lewis", department: "Student Affairs", deliveryLocation: "Student Affairs Suite", quantity: 2, fulfilledQuantity: 0, neededBy: "2026-09-18", status: "reserved", owner: "Sam Patel", restricted: false, crossDepartment: false, history: [{ id: "sup-h-2", text: "Two sets reserved", at: "2026-09-15T08:15:00-07:00", actor: "Sam Patel" }] },
    { id: "SUP-316", itemId: "stock-paper", itemName: "Copy paper case", requester: "Riley Moore", department: "College of Medicine", deliveryLocation: "Faculty workroom", quantity: 8, fulfilledQuantity: 0, neededBy: "2026-09-19", status: "approval_required", owner: null, restricted: false, crossDepartment: false, history: [{ id: "sup-h-3", text: "Quantity exceeds automatic-approval limit", at: "2026-09-15T08:25:00-07:00", actor: "Warehouse rules" }] },
    { id: "SUP-315", itemId: "stock-markers", itemName: "Presentation marker set", requester: "Taylor Grant", department: "Admissions", deliveryLocation: "Admissions Suite", quantity: 5, fulfilledQuantity: 2, neededBy: "2026-09-16", status: "partially_fulfilled", owner: "Sam Patel", restricted: false, crossDepartment: true, history: [{ id: "sup-h-4", text: "Two sets issued; three await department approval", at: "2026-09-15T08:40:00-07:00", actor: "Sam Patel" }] },
    { id: "SUP-314", itemId: "stock-paper", itemName: "Copy paper case", requester: "Morgan Chen", department: "Campus Events", deliveryLocation: "Events Office", quantity: 6, fulfilledQuantity: 0, neededBy: "2026-09-16", status: "backordered", owner: "Sam Patel", restricted: false, crossDepartment: false, history: [{ id: "sup-h-5", text: "Insufficient unreserved stock; purchasing review opened", at: "2026-09-15T08:50:00-07:00", actor: "Warehouse rules" }] },
    { id: "SUP-313", itemId: "stock-paper", itemName: "Copy paper case", requester: "Avery Brooks", department: "Academic Affairs", deliveryLocation: "Academic Affairs", quantity: 1, fulfilledQuantity: 1, neededBy: "2026-09-12", status: "delivered", owner: "Sam Patel", restricted: false, crossDepartment: false, history: [{ id: "sup-h-6", text: "Delivered and inventory deducted", at: "2026-09-12T14:00:00-07:00", actor: "Sam Patel" }] },
  ],
  notifications: [
    { id: "NOT-51", audience: "administrator", type: "urgent", title: "Urgent sink repair awaits approval", detail: "WO-1048 · Student Commons", recordId: "WO-1048", recordType: "work_request", urgency: "urgent", read: false, createdAt: "2026-09-15T07:42:00-07:00" },
    { id: "NOT-50", audience: "administrator", type: "response", title: "Event information is still needed", detail: "RSV-2206A · catering and insurance", recordId: "RSV-2206A", recordType: "event", urgency: "attention", read: false, createdAt: "2026-09-15T09:10:00-07:00" },
    { id: "NOT-49", audience: "administrator", type: "delivery", title: "Supply request moved to backorder", detail: "SUP-314 · six copy-paper cases", recordId: "SUP-314", recordType: "supply", urgency: "attention", read: false, createdAt: "2026-09-15T08:50:00-07:00" },
    { id: "NOT-48", audience: "staff", type: "overdue", title: "Door-closer repair is overdue", detail: "WO-1041 · assigned to Leo Martinez", recordId: "WO-1041", recordType: "work_request", urgency: "urgent", read: false, createdAt: "2026-09-15T08:30:00-07:00" },
    { id: "NOT-47", audience: "staff", type: "status", title: "White Coat preparation updated", detail: "Room-layout task was completed", recordId: "WO-1047", recordType: "work_request", urgency: "routine", read: true, createdAt: "2026-09-15T08:10:00-07:00" },
    { id: "NOT-46", audience: "requester", type: "response", title: "Facilities needs event information", detail: "Alumni reception · response due September 18", recordId: "RSV-2206A", recordType: "event", urgency: "attention", read: false, createdAt: "2026-09-15T09:10:00-07:00" },
    { id: "NOT-45", audience: "requester", type: "delivery", title: "Supply request partially fulfilled", detail: "SUP-315 · two of five marker sets ready", recordId: "SUP-315", recordType: "supply", urgency: "attention", read: false, createdAt: "2026-09-15T08:40:00-07:00" },
  ],
  stock: [
    { id: "stock-chair", sku: "FUR-CHAIR-01", name: "Stacking chair", category: "Furniture", onHand: 176, reorderPoint: 40, target: 220, unit: "each", location: "Warehouse A", averageWeeklyUse: 68, lastCounted: "2026-09-14", ownerDepartment: "Facilities", campus: "Summerlin Campus", shareable: true, condition: "good", photoName: null },
    { id: "stock-table", sku: "FUR-TABLE-06", name: "Six-foot folding table", category: "Furniture", onHand: 26, reorderPoint: 8, target: 36, unit: "each", location: "Warehouse A", averageWeeklyUse: 11, lastCounted: "2026-09-14", ownerDepartment: "Facilities", campus: "Summerlin Campus", shareable: true, condition: "worn", photoName: null },
    { id: "stock-paper", sku: "OFF-PAPER-01", name: "Copy paper case", category: "Office supplies", onHand: 9, reorderPoint: 12, target: 30, unit: "case", location: "Warehouse B", averageWeeklyUse: 7, lastCounted: "2026-09-13", ownerDepartment: "Facilities", campus: "Summerlin Campus", shareable: true, condition: "good", photoName: null },
    { id: "stock-led", sku: "MRO-LED-04", name: "LED tube lamp", category: "Maintenance", onHand: 6, reorderPoint: 8, target: 24, unit: "each", location: "Warehouse B", averageWeeklyUse: 3, lastCounted: "2026-09-13", ownerDepartment: "Facilities", campus: "Summerlin Campus", shareable: false, condition: "good", photoName: null },
    { id: "stock-filter", sku: "MRO-HVAC-12", name: "HVAC filter 20×25", category: "Maintenance", onHand: 18, reorderPoint: 10, target: 30, unit: "each", location: "Warehouse B", averageWeeklyUse: 4, lastCounted: "2026-09-12", ownerDepartment: "Facilities", campus: "Summerlin Campus", shareable: false, condition: "good", photoName: null },
    { id: "stock-kit", sku: "EVT-AV-02", name: "Portable presentation kit", category: "Event equipment", onHand: 4, reorderPoint: 2, target: 6, unit: "kit", location: "Equipment cage", averageWeeklyUse: 3, lastCounted: "2026-09-14", ownerDepartment: "Academic Affairs", campus: "Summerlin Campus", shareable: true, condition: "good", photoName: "presentation-kit.jpg" },
    { id: "stock-hpodium", sku: "HEN-AV-07", name: "Mobile podium", category: "Event equipment", onHand: 2, reorderPoint: 1, target: 2, unit: "each", location: "Henderson Storage 2", averageWeeklyUse: 1, lastCounted: "2026-09-12", ownerDepartment: "Academic Affairs", campus: "Henderson Campus", shareable: true, condition: "good", photoName: "mobile-podium.jpg" },
    { id: "stock-markers", sku: "SA-MARK-03", name: "Presentation marker set", category: "Office supplies", onHand: 7, reorderPoint: 3, target: 12, unit: "set", location: "Student Affairs cabinet", averageWeeklyUse: 2, lastCounted: "2026-09-14", ownerDepartment: "Student Affairs", campus: "Summerlin Campus", shareable: true, condition: "good", photoName: null },
  ],
  custody: [
    { id: "CST-14", itemName: "Portable presentation kit", quantity: 1, holder: "Admissions open house", holderType: "event", checkedOutAt: "2026-09-14T09:00:00-07:00", dueAt: "2026-09-16T12:00:00-07:00", condition: "good" },
    { id: "CST-13", itemName: "Folding tables", quantity: 6, holder: "Student Affairs", holderType: "department", checkedOutAt: "2026-09-10T11:30:00-07:00", dueAt: null, condition: "worn" },
  ],
  dashboardSections: ["priorities", "workflow", "usage", "activity"],
  hiddenDashboardSections: [],
  activity: [
    { id: "activity-1", text: "WO-1046 moved to In progress", at: "2026-09-15T08:30:00-07:00" },
    { id: "activity-2", text: "Prep checklist updated for White Coat reception", at: "2026-09-15T08:10:00-07:00" },
    { id: "activity-3", text: "Inventory count completed in Warehouse B", at: "2026-09-14T16:40:00-07:00" },
  ],
  rooms: facilitiesRooms,
  mapUploads: [],
};

export function nextFacilitiesRequestStatus(status: FacilitiesRequestStatus): FacilitiesRequestStatus | null {
  const index = facilitiesRequestStages.findIndex((stage) => stage.key === status);
  return index >= 0 && index < facilitiesRequestStages.length - 1 ? facilitiesRequestStages[index + 1].key : null;
}

export function reservationConflicts(candidate: Pick<FacilitiesReservation, "id" | "roomId" | "date" | "startsAt" | "endsAt">, reservations: FacilitiesReservation[]) {
  return reservations.filter((item) => item.id !== candidate.id && item.status === "approved" && item.roomId === candidate.roomId && item.date === candidate.date && candidate.startsAt < item.endsAt && candidate.endsAt > item.startsAt);
}

export function roomAvailability(roomId: string, date: string, startsAt: string, endsAt: string, reservations: FacilitiesReservation[]) {
  const overlapping = reservations.filter((item) => item.roomId === roomId && item.date === date && item.status !== "cancelled" && startsAt < item.endsAt && endsAt > item.startsAt);
  if (overlapping.some((item) => item.status === "approved")) return "unavailable" as const;
  if (overlapping.some((item) => item.status === "pending")) return "tentative" as const;
  return "available" as const;
}

export function facilitiesInsights(state: FacilitiesDemoState) {
  const insights: Array<{ id: string; level: "attention" | "watch" | "opportunity"; title: string; detail: string; source: string }> = [];
  const lowStock = state.stock.filter((item) => item.onHand <= item.reorderPoint);
  if (lowStock.length) insights.push({ id: "low-stock", level: "attention", title: `${lowStock.length} items are at or below reorder level`, detail: lowStock.map((item) => `${item.name}: ${item.onHand} ${item.unit}`).join(" · "), source: "Current count compared with each item’s reorder point." });
  const repeatedFurnitureUse = state.stock.find((item) => item.id === "stock-chair");
  if (repeatedFurnitureUse && repeatedFurnitureUse.averageWeeklyUse / repeatedFurnitureUse.onHand > 0.35) insights.push({ id: "chair-use", level: "watch", title: "Stacking-chair demand is consistently high", detail: `${repeatedFurnitureUse.averageWeeklyUse} chairs move per week on average; inspect high-use sets before the next large event.`, source: "Average weekly check-outs divided by current available quantity." });
  const openUrgent = state.requests.filter((item) => item.priority === "urgent" && item.status !== "complete");
  if (openUrgent.length) insights.push({ id: "urgent", level: "attention", title: `${openUrgent.length} urgent work order needs action`, detail: openUrgent.map((item) => `${item.id} · ${item.location}`).join(" · "), source: "Open work orders marked urgent." });
  const alcoholPending = state.reservations.filter((item) => item.alcohol && item.liquorLicenseStatus !== "received" && item.status !== "cancelled");
  if (alcoholPending.length) insights.push({ id: "liquor", level: "watch", title: "Liquor-license documentation is outstanding", detail: alcoholPending.map((item) => `${item.title} · ${item.date}`).join(" · "), source: "Alcohol selected and license status is not Received." });
  const underused = state.stock.find((item) => item.target > 0 && item.averageWeeklyUse > 0 && item.onHand / item.averageWeeklyUse > 10);
  if (underused) insights.push({ id: "overstock", level: "opportunity", title: `${underused.name} may be overstocked`, detail: `Current quantity represents more than 10 weeks of typical use. Review the next purchase before reordering.`, source: "On-hand quantity divided by average weekly use." });
  return insights;
}

export function cloneFacilitiesDemoState() {
  return JSON.parse(JSON.stringify(initialFacilitiesDemoState)) as FacilitiesDemoState;
}

export function makeEventSetupRequest(reservation: FacilitiesReservation, nextNumber: number): FacilitiesRequest {
  return {
    id: `WO-${nextNumber}`,
    title: `Prepare ${reservation.roomName} for ${reservation.title}`,
    category: "event_setup",
    requester: reservation.requestedBy,
    department: reservation.organization,
    location: reservation.roomName,
    priority: "soon",
    status: "prep",
    description: reservation.setupNotes || "Confirm room setup with the event coordinator.",
    requestedFor: reservation.date,
    assignedTo: null,
    prepTasks: [
      { id: `task-${nextNumber}-1`, label: "Confirm room layout and accessibility", complete: false },
      { id: `task-${nextNumber}-2`, label: "Reserve required furniture and equipment", complete: false },
      { id: `task-${nextNumber}-3`, label: "Confirm coordinator and final timing", complete: false },
    ],
    parts: [],
    reservationId: reservation.id,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}
