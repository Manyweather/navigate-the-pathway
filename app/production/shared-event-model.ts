export type SharedEventExperience = "oaca" | "genesis";
export type SharedEventStatus = "draft" | "requested" | "mentor_approved" | "published" | "completed" | "cancelled";
export type FacilitiesNeed = { kind: "room" | "setup" | "inventory"; description: string; itemKey?: string; quantity?: number };
export type SharedEventPlan = {
  id: string; organizationId: string; ownerExperience: SharedEventExperience; createdBy: string;
  title: string; kind: string; objective: string; audience: string; startsAt: string | null; endsAt: string | null;
  status: SharedEventStatus; details: { partner?: string; accessibility?: string; staffing?: string; communications?: string;
    estimatedCost?: number; evaluationMeasures?: string; location?: string; modality?: string;
    facilities?: FacilitiesNeed[]; inventoryTemplate?: FacilitiesNeed[]; roleDuties?: string };
  recurrence: { label?: string }; oacaEventId?: string | null; genesisEventId?: string | null;
};
export type SharedOccurrence = { id: string; eventId: string; startsAt: string; endsAt: string | null; status: string };
export type SharedFacilitiesRequest = { id: string; eventId: string; occurrenceId: string | null; requestKind: FacilitiesNeed["kind"];
  itemKey: string | null; quantity: number | null; description: string; status: "pending" | "confirmed" | "declined" | "cancelled"; decisionNote?: string | null };
export type SharedEvaluation = { eventId: string; occurrenceId: string; registrations: number; attendance: number; estimatedCost: number;
  actualCost: number; goalsMet: string; partnerFeedback: string; coordination: string; keepNextTime: string;
  changeNextTime: string; purchaseNeeds: string; completedAt?: string };
export type SharedHandoff = { id: string; eventId: string; version: number; status: "draft" | "complete" | "offered" | "accepted";
  document: { roleDuties: string; eventHistory: string; metrics: string; analytics: string; openDecisions: string; nextActions: string };
  successorEmail: string | null; createdAt: string };
export type SharedEventWorkspace = { events: SharedEventPlan[]; occurrences: SharedOccurrence[];
  facilitiesRequests: SharedFacilitiesRequest[]; evaluations: SharedEvaluation[]; handoffs: SharedHandoff[];
  oacaOverlay: Array<{ id: string; occurrenceId?: string | null; title: string; startsAt: string; endsAt: string | null; location: string | null; source?: SharedEventExperience }>;
  possibleDuplicates: Array<{ firstId: string; secondId: string; reason: string }> };

export function campusDay(value: string | null): string {
  return value ? new Intl.DateTimeFormat("sv-SE", {timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value)) : "";
}

export function combinedCalendar(workspace: SharedEventWorkspace, includeOaca: boolean) {
  const byId = new Map<string, { id: string; occurrenceId: string | null; title: string; startsAt: string; endsAt: string | null; source: string }>();
  for (const event of workspace.events) {
    if (event.status !== "published" || !event.startsAt) continue;
    const dates=workspace.occurrences.filter((item)=>item.eventId===event.id && item.status!=="cancelled");
    for (const occurrence of dates.length?dates:[{id:null,startsAt:event.startsAt,endsAt:event.endsAt}]) {
      byId.set(`${event.id}:${occurrence.startsAt}`, { id:event.id, occurrenceId:occurrence.id, title:event.title, startsAt:occurrence.startsAt, endsAt:occurrence.endsAt, source:event.ownerExperience });
    }
  }
  if (includeOaca) for (const event of workspace.oacaOverlay) {
    const key=`${event.id}:${event.startsAt}`;
    if (!byId.has(key)) byId.set(key, { id:event.id, occurrenceId:event.occurrenceId||null, title:event.title, startsAt:event.startsAt, endsAt:event.endsAt, source:event.source||"oaca" });
  }
  return [...byId.values()].sort((a,b) => a.startsAt.localeCompare(b.startsAt));
}

export function eventCsv(events: SharedEventPlan[], evaluations: SharedEvaluation[], requests: SharedFacilitiesRequest[], category: "all" | "metrics" | "facilities" = "all") {
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const columns = ["Event ID","Name","Type","Workspace","Start","End","Status",...(category==="facilities"?[]:["Registrations","Attendance","Estimated cost","Actual cost"]),...(category==="metrics"?[]:["Facilities pending"])];
  const lines = [columns.map(quote).join(",")];
  for (const event of events) {
    const measured = evaluations.filter((item) => item.eventId === event.id);
    const total = (key: "registrations" | "attendance" | "estimatedCost" | "actualCost") => measured.length ? measured.reduce((sum,item) => sum + item[key], 0) : "";
    lines.push([event.id,event.title,event.kind,event.ownerExperience,event.startsAt,event.endsAt,event.status,...(category==="facilities"?[]:[total("registrations"),total("attendance"),total("estimatedCost"),total("actualCost")]),...(category==="metrics"?[]:[requests.filter((item) => item.eventId === event.id && item.status === "pending").length])].map(quote).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
