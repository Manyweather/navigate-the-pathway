export type PilotRole = "student" | "advisor" | "administrator";

export type InstrumentCatalogEntry = {
  slug: string;
  name: string;
  audience: "student" | "advisor";
  itemCount: number;
  openResponseCount: number;
  releaseState: "content_required" | "pi_confirmation_required";
};

// This public catalog intentionally contains metadata only. Approved item wording,
// response options, and scoring definitions belong in the protected evaluation schema.
export const instrumentCatalog: InstrumentCatalogEntry[] = [
  {
    slug: "pre-health-application-profile",
    name: "Your Pre-Health Application Profile: A Self-Assessment",
    audience: "student",
    itemCount: 22,
    openResponseCount: 2,
    releaseState: "content_required",
  },
  {
    slug: "short-grit-survey",
    name: "Short Grit Survey",
    audience: "student",
    itemCount: 8,
    openResponseCount: 0,
    releaseState: "content_required",
  },
  {
    slug: "macleod-clark-professional-identity-scale",
    name: "MacLeod Clark Professional Identity Scale",
    audience: "student",
    itemCount: 9,
    openResponseCount: 0,
    releaseState: "pi_confirmation_required",
  },
  {
    slug: "brief-resilience-scale",
    name: "Brief Resilience Scale",
    audience: "student",
    itemCount: 6,
    openResponseCount: 0,
    releaseState: "content_required",
  },
  {
    slug: "advisor-coaching-competency-scale",
    name: "Advisor Coaching Competency Scale (ACCS)",
    audience: "advisor",
    itemCount: 20,
    openResponseCount: 0,
    releaseState: "content_required",
  },
];

export const studentInstrumentCatalog = instrumentCatalog.filter((item) => item.audience === "student");
export const advisorInstrumentCatalog = instrumentCatalog.filter((item) => item.audience === "advisor");

