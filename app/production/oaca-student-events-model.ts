export type StudentEventRegistrationStatus = "none" | "registered" | "waitlisted" | "cancelled" | "attended" | "no_show";
export type StudentEventTab = "upcoming" | "mine" | "past";
export type StudentEventPastScope = "for_me" | "attended" | "all_public";

export type StudentEventListRecord = {
  startsAt: string;
  endsAt?: string | null;
  status: string;
  registered?: boolean;
  registrationStatus?: StudentEventRegistrationStatus;
  attendanceStatus?: "present" | "absent" | "not_recorded" | null;
  audienceEligible?: boolean;
  publicCatalog?: boolean;
};

export function studentEventRegistrationStatus(event: StudentEventListRecord): StudentEventRegistrationStatus {
  if (event.registrationStatus) return event.registrationStatus;
  return event.registered ? "registered" : "none";
}

export function studentEventHasEnded(event: StudentEventListRecord, now = Date.now()) {
  const end = new Date(event.endsAt || event.startsAt).getTime();
  return event.status === "completed" || Number.isFinite(end) && end < now;
}

export function filterStudentEvents<T extends StudentEventListRecord>(events: T[], tab: StudentEventTab, pastScope: StudentEventPastScope, now = Date.now()) {
  return events.filter((event) => {
    const ended = studentEventHasEnded(event, now);
    const registration = studentEventRegistrationStatus(event);
    if (tab === "upcoming") return !ended && event.status === "published";
    if (tab === "mine") return !ended && ["registered", "waitlisted"].includes(registration);
    if (!ended) return false;
    if (pastScope === "attended") return event.attendanceStatus === "present" || registration === "attended";
    if (pastScope === "all_public") return event.publicCatalog === true;
    return event.audienceEligible !== false;
  }).sort((left, right) => tab === "past"
    ? new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime()
    : new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

export function eventAvailabilityLabel(event: StudentEventListRecord & { capacity?: number | null; registrationCount?: number; waitlistPosition?: number | null }) {
  const status = studentEventRegistrationStatus(event);
  if (status === "waitlisted") return event.waitlistPosition ? `Waitlist position ${event.waitlistPosition}` : "On the waitlist";
  if (["registered", "attended"].includes(status)) return "Registered";
  if (event.capacity == null) return "Open capacity";
  const remaining = Math.max(0, event.capacity - (event.registrationCount || 0));
  return remaining ? `${remaining} spaces remaining` : "Waitlist available";
}
