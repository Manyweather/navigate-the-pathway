/** Prepared templates only. This release deliberately has no email sender. */
export const appointmentEmailDelivery = {
  enabled: false,
  enabledSince: null,
} as const;
export type AppointmentEmailEvent =
  "request" | "accepted" | "declined" | "reschedule" | "cancelled" | "reminder";
const subjects: Record<AppointmentEmailEvent, string> = {
  request: "New appointment request",
  accepted: "Appointment accepted",
  declined: "Appointment declined",
  reschedule: "Appointment change awaiting acceptance",
  cancelled: "Appointment cancelled",
  reminder: "Upcoming appointment",
};
export function appointmentEmailTemplate(
  event: AppointmentEmailEvent,
  portalOrigin: string,
) {
  const url = new URL("/app", portalOrigin);
  if (url.protocol !== "https:")
    throw new Error("Use the secure portal address.");
  return {
    subject: `Navigate: ${subjects[event]}`,
    text: `${subjects[event]}.\n\nSign in to Navigate the Pathway to review the details and any required action.\n${url.toString()}`,
  };
}
export function mayDeliverAppointmentEmail(
  job: { status: string; createdAt: string },
  policy: {
    enabled: boolean;
    enabledSince: string | null;
  } = appointmentEmailDelivery,
) {
  return (
    policy.enabled &&
    policy.enabledSince !== null &&
    job.status === "pending" &&
    Date.parse(job.createdAt) >= Date.parse(policy.enabledSince)
  );
}
