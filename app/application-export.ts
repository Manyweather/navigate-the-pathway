import type { Artifact, DemoState } from "./demo-model";
import { aamcGuide, pathwayExperienceTypes } from "./aamc-guidance";

export const applicationExperienceTypes = [
  ...pathwayExperienceTypes,
  "Service",
  "Clinical exposure",
  "Research",
  "Leadership",
  "Employment",
] as const;

export type ApplicationExperienceType = (typeof applicationExperienceTypes)[number] | "Unspecified";

export type ApplicationExportExperience = {
  id: string;
  title: string;
  body: string;
  type: ApplicationExperienceType;
  organization?: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  hours?: string | number;
  completedHours?: string | number;
  anticipatedStart?: string;
  anticipatedEnd?: string;
  anticipatedHours?: string | number;
  additionalDateRanges?: string;
  verifier?: string;
  mostMeaningful?: boolean;
  mostMeaningfulSummary?: string;
  context?: string;
};

export type ApplicationExportReflection = {
  id: string;
  title: string;
  body: string;
  linkedExperienceTitle?: string;
};

export type ApplicationExportStory = {
  id: string;
  title: string;
  theme?: string;
  body: string;
  sourceTitles: string[];
  essayType?: string;
  workingDraft?: string;
  targetCharacters?: number;
};

export type ApplicationExport = {
  experienceGroups: { type: ApplicationExperienceType; entries: ApplicationExportExperience[] }[];
  reflections: ApplicationExportReflection[];
  stories: ApplicationExportStory[];
};

function optionalText(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalHours(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return optionalText(value);
}

function sourceIds(item: Artifact) {
  const value = item.metadata.sourceIds;
  return typeof value === "string" ? value.split(",").map((id) => id.trim()).filter(Boolean) : [];
}

export function buildApplicationExport(state: DemoState): ApplicationExport {
  const artifactsById = new Map(state.artifacts.map((item) => [item.id, item]));
  const experienceTypes = new Set<string>(applicationExperienceTypes);
  const experiences = state.artifacts.filter((item) => item.kind === "experience").map((item): ApplicationExportExperience => {
    const capturedType = optionalText(item.metadata.type);
    const hasOptionalDetails = Boolean(
      optionalText(item.metadata.organization)
      || optionalText(item.metadata.role)
      || optionalText(item.metadata.startDate)
      || optionalText(item.metadata.endDate)
      || optionalText(item.metadata.context)
      || optionalText(item.metadata.supervisor)
      || optionalText(item.metadata.verifier)
      || item.metadata.recurring
      || (typeof item.metadata.hours === "string" && item.metadata.hours.trim()),
    );
    const type: ApplicationExperienceType = capturedType && experienceTypes.has(capturedType) && (capturedType !== "Service" || hasOptionalDetails)
      ? capturedType as ApplicationExperienceType
      : "Unspecified";
    const organization = optionalText(item.metadata.organization);
    const role = optionalText(item.metadata.role);
    const startDate = optionalText(item.metadata.startDate);
    const endDate = optionalText(item.metadata.endDate);
    const capturedHours = optionalHours(item.metadata.hours);
    const hours = capturedHours === 0 && !hasOptionalDetails ? undefined : capturedHours;
    const completedHours = optionalHours(item.metadata.completedHours) ?? hours;
    const anticipatedStart = optionalText(item.metadata.anticipatedStart);
    const anticipatedEnd = optionalText(item.metadata.anticipatedEnd);
    const anticipatedHours = optionalHours(item.metadata.anticipatedHours);
    const additionalDateRanges = optionalText(item.metadata.additionalDateRanges);
    const verifier = optionalText(item.metadata.verifier);
    const mostMeaningful = item.metadata.mostMeaningful === true;
    const mostMeaningfulSummary = optionalText(item.metadata.mostMeaningfulSummary);
    const context = optionalText(item.metadata.context);

    return {
      id: item.id,
      title: item.title,
      body: item.body,
      type,
      ...(organization ? { organization } : {}),
      ...(role ? { role } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(hours !== undefined ? { hours } : {}),
      ...(completedHours !== undefined ? { completedHours } : {}),
      ...(anticipatedStart ? { anticipatedStart } : {}),
      ...(anticipatedEnd ? { anticipatedEnd } : {}),
      ...(anticipatedHours !== undefined ? { anticipatedHours } : {}),
      ...(additionalDateRanges ? { additionalDateRanges } : {}),
      ...(verifier ? { verifier } : {}),
      ...(mostMeaningful ? { mostMeaningful } : {}),
      ...(mostMeaningfulSummary ? { mostMeaningfulSummary } : {}),
      ...(context ? { context } : {}),
    };
  });

  const groupOrder = Array.from(new Set<ApplicationExperienceType>([...applicationExperienceTypes, "Unspecified"]));
  const experienceGroups = groupOrder.map((type) => ({
    type,
    entries: experiences.filter((item) => item.type === type),
  })).filter((group) => group.entries.length > 0);

  const reflections = state.artifacts.filter((item) => item.kind === "reflection").map((item): ApplicationExportReflection => {
    const linkedId = optionalText(item.metadata.linkedArtifactId);
    const linked = linkedId ? artifactsById.get(linkedId) : undefined;
    return {
      id: item.id,
      title: item.title,
      body: item.body,
      ...(linked?.kind === "experience" ? { linkedExperienceTitle: linked.title } : {}),
    };
  });

  const stories = state.artifacts.filter((item) => item.kind === "story").map((item): ApplicationExportStory => ({
    id: item.id,
    title: item.title,
    ...(optionalText(item.metadata.theme) ? { theme: optionalText(item.metadata.theme) } : {}),
    body: item.body,
    sourceTitles: sourceIds(item).map((id) => artifactsById.get(id)?.title).filter((title): title is string => Boolean(title)),
    ...(optionalText(item.metadata.essayType) ? { essayType: optionalText(item.metadata.essayType) } : {}),
    ...(optionalText(item.metadata.workingDraft) ? { workingDraft: optionalText(item.metadata.workingDraft) } : {}),
    ...(typeof item.metadata.targetCharacters === "number" ? { targetCharacters: item.metadata.targetCharacters } : {}),
  }));

  return { experienceGroups, reflections, stories };
}

function fieldLine(label: string, value: string | number | undefined) {
  return value === undefined ? [] : [`- ${label}: ${value}`];
}

export function buildApplicationExportText(data: ApplicationExport) {
  const lines = ["# Navigate the Pathway application notes", "", "Personal export. This file does not change any advising share.", aamcGuide.preparationNotice, "", "## Experiences", ""];

  if (!data.experienceGroups.length) lines.push("No saved experiences yet.", "");
  for (const group of data.experienceGroups) {
    lines.push(`### ${group.type}`, "");
    for (const item of group.entries) {
      lines.push(`#### ${item.title}`, "");
      lines.push(...fieldLine("Organization", item.organization));
      lines.push(...fieldLine("Role", item.role));
      if (item.startDate || item.endDate) lines.push(`- Dates: ${[item.startDate, item.endDate].filter(Boolean).join(" to ")}`);
      lines.push(...fieldLine("Completed hours", item.completedHours ?? item.hours));
      if (item.anticipatedStart || item.anticipatedEnd) lines.push(`- Anticipated dates: ${[item.anticipatedStart, item.anticipatedEnd].filter(Boolean).join(" to ")}`);
      lines.push(...fieldLine("Anticipated hours", item.anticipatedHours));
      lines.push(...fieldLine("Additional recurring date ranges", item.additionalDateRanges));
      lines.push(...fieldLine("Potential verifier", item.verifier));
      if (item.mostMeaningful) lines.push("- Possible Most Meaningful: Yes");
      lines.push(...fieldLine("Context", item.context));
      if (item.organization || item.role || item.startDate || item.endDate || item.hours !== undefined || item.anticipatedHours !== undefined || item.context) lines.push("");
      lines.push(item.body, "");
      if (item.mostMeaningfulSummary) lines.push("Most Meaningful working note:", item.mostMeaningfulSummary, "");
    }
  }

  lines.push("## Reflections", "");
  if (!data.reflections.length) lines.push("No saved reflections yet.", "");
  for (const item of data.reflections) {
    lines.push(`### ${item.title}`, "");
    if (item.linkedExperienceTitle) lines.push(`Linked experience: ${item.linkedExperienceTitle}`, "");
    lines.push(item.body, "");
  }

  lines.push("## Story fragments", "");
  if (!data.stories.length) lines.push("No saved story fragments yet.", "");
  for (const item of data.stories) {
    lines.push(`### ${item.title}`, "");
    if (item.essayType === "personal_comments") lines.push("Personal Comments essay preparation", "");
    if (item.theme) lines.push(`Theme: ${item.theme}`, "");
    if (item.sourceTitles.length) lines.push(`Sources: ${item.sourceTitles.join(", ")}`, "");
    lines.push(item.body, "");
    if (item.workingDraft) {
      lines.push(`Working draft (${item.workingDraft.length}${item.targetCharacters ? ` of ${item.targetCharacters}` : ""} characters):`, "", item.workingDraft, "");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}
