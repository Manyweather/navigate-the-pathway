export const oacaEventStatuses = ["draft", "scheduled", "published", "completed", "cancelled", "archived"] as const;
export const oacaCampaignStatuses = ["draft", "scheduled", "queued", "sending", "sent", "cancelled"] as const;
export const oacaEngagementEvents = ["delivered", "opened", "clicked", "form_submitted", "event_registered", "appointment_requested"] as const;

export type OacaEventStatus = (typeof oacaEventStatuses)[number];
export type OacaCampaignStatus = (typeof oacaCampaignStatuses)[number];
export type OacaEngagementEvent = (typeof oacaEngagementEvents)[number];

export type OacaAudience = {
  includeAllStudents?: boolean;
  cohortLabels?: string[];
  phases?: string[];
  years?: string[];
  campuses?: string[];
  assignedProviderIds?: string[];
  studentIds?: string[];
};

export type OacaFormField = {
  id: string;
  label: string;
  responseType: "short_text" | "long_text" | "single_choice" | "multiple_choice" | "rating";
  required: boolean;
  options?: string[];
};

export type OacaCampaignContent = {
  heading: string;
  body: string;
  callToActionLabel?: string;
  callToActionUrl?: string;
  mediaFileId?: string;
  mediaAlt?: string;
  mediaUrl?: string;
  formId?: string;
};

export function describeOacaAudience(audience: OacaAudience) {
  if (audience.includeAllStudents) return "All active OACA students";
  const parts = [
    ...(audience.cohortLabels || []).map((value) => `Cohort: ${value}`),
    ...(audience.phases || []).map((value) => `Phase: ${value}`),
    ...(audience.years || []).map((value) => `Year: ${value}`),
    ...(audience.campuses || []).map((value) => `Campus: ${value}`),
  ];
  if (audience.assignedProviderIds?.length) parts.push(`${audience.assignedProviderIds.length} advisor group${audience.assignedProviderIds.length === 1 ? "" : "s"}`);
  if (audience.studentIds?.length) parts.push(`${audience.studentIds.length} selected student${audience.studentIds.length === 1 ? "" : "s"}`);
  return parts.join(" · ") || "No audience selected";
}

export function validateOacaAudience(audience: OacaAudience) {
  return Boolean(audience.includeAllStudents || audience.cohortLabels?.length || audience.phases?.length || audience.years?.length || audience.campuses?.length || audience.assignedProviderIds?.length || audience.studentIds?.length);
}

export function validateCampaignContent(content: OacaCampaignContent) {
  const errors: string[] = [];
  if (!content.heading.trim()) errors.push("Add a heading.");
  if (!content.body.trim()) errors.push("Add message content.");
  if (content.body.length > 12000) errors.push("Message content must be no more than 12,000 characters.");
  if (content.callToActionUrl) {
    try {
      if (new URL(content.callToActionUrl).protocol !== "https:") errors.push("Action links must use HTTPS.");
    } catch { errors.push("Enter a valid action link."); }
  }
  if (content.mediaUrl) {
    try {
      if (new URL(content.mediaUrl).protocol !== "https:") errors.push("Rich-media links must use HTTPS.");
    } catch { errors.push("Enter a valid rich-media link."); }
  }
  if ((content.mediaFileId || content.mediaUrl) && !content.mediaAlt?.trim()) errors.push("Add alternative text for the image or rich media.");
  return errors;
}

export function engagementRate(count: number | null | undefined, recipients: number | null | undefined, minimumGroupSize = 10) {
  if (!recipients || recipients < minimumGroupSize || count == null) return null;
  return Math.round((1000 * count) / recipients) / 10;
}
