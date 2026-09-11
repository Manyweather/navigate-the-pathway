export const oacaEventStatuses = ["draft", "scheduled", "published", "completed", "cancelled", "archived"] as const;
export const oacaCampaignStatuses = ["draft", "scheduled", "queued", "sending", "sent", "cancelled"] as const;
export const oacaEngagementEvents = ["delivered", "opened", "clicked", "form_submitted", "event_registered", "appointment_requested"] as const;

export type OacaEventStatus = (typeof oacaEventStatuses)[number];
export type OacaCampaignStatus = (typeof oacaCampaignStatuses)[number];
export type OacaEngagementEvent = (typeof oacaEngagementEvents)[number];

export type OacaAudience = {
  includeAllMembers?: boolean;
  includeAllStudents?: boolean;
  cohortLabels?: string[];
  phases?: string[];
  years?: string[];
  campuses?: string[];
  assignedProviderIds?: string[];
  studentIds?: string[];
  organizationIds?: string[];
  studentCouncil?: boolean;
  memberRoles?: string[];
  userIds?: string[];
  excludeUserIds?: string[];
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
  if (audience.includeAllMembers) return "All active Compass members";
  if (audience.includeAllStudents) return "All active OACA students";
  const parts = [
    ...(audience.cohortLabels || []).map((value) => `Cohort: ${value}`),
    ...(audience.phases || []).map((value) => `Phase: ${value}`),
    ...(audience.years || []).map((value) => `Year: ${value}`),
    ...(audience.campuses || []).map((value) => `Campus: ${value}`),
  ];
  if (audience.assignedProviderIds?.length) parts.push(`${audience.assignedProviderIds.length} advisor group${audience.assignedProviderIds.length === 1 ? "" : "s"}`);
  if (audience.studentIds?.length) parts.push(`${audience.studentIds.length} selected student${audience.studentIds.length === 1 ? "" : "s"}`);
  if (audience.organizationIds?.length) parts.push(`${audience.organizationIds.length} interest group${audience.organizationIds.length === 1 ? "" : "s"}`);
  if (audience.studentCouncil) parts.push("Student Council");
  if (audience.memberRoles?.length) parts.push(`${audience.memberRoles.length} staff or faculty group${audience.memberRoles.length === 1 ? "" : "s"}`);
  if (audience.userIds?.length) parts.push(`${audience.userIds.length} named person${audience.userIds.length === 1 ? "" : "s"}`);
  if (audience.excludeUserIds?.length) parts.push(`${audience.excludeUserIds.length} excluded`);
  return parts.join(" · ") || "No audience selected";
}

export function validateOacaAudience(audience: OacaAudience) {
  return Boolean(audience.includeAllMembers || audience.includeAllStudents || audience.cohortLabels?.length || audience.phases?.length || audience.years?.length || audience.campuses?.length || audience.assignedProviderIds?.length || audience.studentIds?.length || audience.organizationIds?.length || audience.studentCouncil || audience.memberRoles?.length || audience.userIds?.length);
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
