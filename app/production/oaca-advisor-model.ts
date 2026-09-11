export type AdvisorWorkspaceKey = "academic" | "career";

export type AdvisorRelationship =
  | "assigned"
  | "drop_in"
  | "career_service"
  | "outside_caseload";

export type AdvisorAttentionReason = {
  key:
    | "pending_request"
    | "milestone_due"
    | "task_due"
    | "no_show"
    | "unread_message";
  label: string;
  count: number;
};

export type CareerRoadmapItem = {
  key: string;
  year: 1 | 2 | 3 | 4;
  title: string;
  kind: "cim" | "presentation" | "advisor_visit" | "residency";
  required: boolean;
};

export const careerRoadmap: CareerRoadmapItem[] = [
  {
    key: "career_y1_cim_understand",
    year: 1,
    title: "CiM: Understand Yourself",
    kind: "cim",
    required: true,
  },
  {
    key: "career_y1_sessions",
    year: 1,
    title: "Career presentation and working sessions",
    kind: "presentation",
    required: true,
  },
  {
    key: "career_y2_advisor",
    year: 2,
    title: "Meet with Career Advising",
    kind: "advisor_visit",
    required: true,
  },
  {
    key: "career_y2_cim_explore",
    year: 2,
    title: "CiM: Explore Options",
    kind: "cim",
    required: true,
  },
  {
    key: "career_y2_sessions",
    year: 2,
    title: "Career presentation and working sessions",
    kind: "presentation",
    required: true,
  },
  {
    key: "career_y3_cim_choose",
    year: 3,
    title: "CiM: Choose Your Specialty",
    kind: "cim",
    required: true,
  },
  {
    key: "career_y3_sessions",
    year: 3,
    title: "Career presentation and working sessions",
    kind: "presentation",
    required: true,
  },
  {
    key: "career_y4_residency",
    year: 4,
    title: "Residency preparation: ERAS and NRMP",
    kind: "residency",
    required: true,
  },
  {
    key: "career_y4_cim_prepare",
    year: 4,
    title: "CiM: Prepare for Residency",
    kind: "cim",
    required: true,
  },
  {
    key: "career_y4_sessions",
    year: 4,
    title: "Career presentation and working sessions",
    kind: "presentation",
    required: true,
  },
];

export function allowedAdvisorWorkspaces(input: {
  roles: string[];
  capabilities: string[];
  providerServiceKeys?: string[];
}) {
  const elevated = input.roles.some(
    (role) => role === "administrator" || role === "creator",
  );
  const academic =
    elevated ||
    input.capabilities.includes("oaca.advisor.academic") ||
    input.providerServiceKeys?.includes("academic_advising");
  const career =
    elevated ||
    input.capabilities.includes("oaca.advisor.career") ||
    input.providerServiceKeys?.includes("career_advising");
  return [academic ? "academic" : null, career ? "career" : null].filter(
    Boolean,
  ) as AdvisorWorkspaceKey[];
}

export function advisorRelationshipLabel(relationship: AdvisorRelationship) {
  if (relationship === "assigned") return "Permanent caseload";
  if (relationship === "drop_in") return "Current drop-in relationship";
  if (relationship === "career_service") return "Career advising";
  return "Outside permanent caseload";
}

export function attentionTotal(reasons: AdvisorAttentionReason[]) {
  return reasons.reduce(
    (total, reason) => total + Math.max(0, reason.count),
    0,
  );
}

export function isReportCellVisible(
  studentCount: number,
  minimumGroupSize = 10,
) {
  return studentCount >= minimumGroupSize;
}
