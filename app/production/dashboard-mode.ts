import type { AuthorizationContext, SurveyAssignmentSummary } from "./types";
import { instrumentCatalog } from "./catalog";

export type DashboardMode = "student" | "advisor" | "administrator" | "creator" | "principal_investigator";
export const modeLabels: Record<DashboardMode, string> = {student:"Student", advisor:"Advisor", administrator:"Administrator", creator:"Creator", principal_investigator:"Principal Investigator"};
export const principalMode = (mode: string) => mode === "creator" || mode === "principal_investigator";
export function assignedModes(context: Pick<AuthorizationContext,"roles"|"principalType">): DashboardMode[] {
  return [...(context.principalType ? [context.principalType] : []), ...context.roles];
}
export function modeContext(context: AuthorizationContext, mode: DashboardMode): AuthorizationContext {
  return {...context, roles: [principalMode(mode) ? "administrator" : mode as "student"|"advisor"|"administrator"], principalType: principalMode(mode) ? context.principalType : null,
    capabilities: principalMode(mode) ? context.capabilities : mode === "administrator" ? context.capabilities.filter(c => ["accounts.manage","program.configure"].includes(c)) : []};
}
export function surveysForAudience<T extends Pick<SurveyAssignmentSummary,"id"|"instrumentSlug"|"waveLabel"|"status"|"submittedAt"> & {audience?:string;waveId?:string}>(rows: T[], audience: "student"|"advisor"): T[] {
  const seen = new Set<string>();
  return [...rows].filter(row => (instrumentCatalog.find(i=>i.slug===row.instrumentSlug)?.audience || row.audience) === audience)
    .sort((a,b)=>Number(b.status==="submitted")-Number(a.status==="submitted") || String(b.submittedAt||"").localeCompare(String(a.submittedAt||"")))
    .filter(row=>{const key = `${row.instrumentSlug}:${row.waveId || row.waveLabel}`; if(seen.has(key))return false; seen.add(key); return true;});
}
export function modeAllowsPath(mode: DashboardMode, path: string, method: string): boolean {
  if(path === "/api/me" || path.startsWith("/api/activity/"))return true;
  if(path.startsWith("/api/governance/") || path.startsWith("/api/evaluation/") || path === "/api/admin/reset-preview" || path.startsWith("/api/admin/analytics/"))return principalMode(mode);
  if(path.startsWith("/api/admin/")) return mode === "administrator" || principalMode(mode);
  if(/^\/api\/workspace\/(analytics|access|access_update|communication_policy)$/.test(path))return principalMode(mode);
  if(/^\/api\/workspace\/(roster_|session_save)/.test(path))return mode === "administrator" || principalMode(mode);
  if(/^\/api\/workspace\/support_(review|generate)$/.test(path))return mode === "advisor" || principalMode(mode);
  if(/^\/api\/workspace\/support_(share|revoke)$/.test(path))return mode === "student";
  if(path.startsWith("/api/advisor/"))return mode === "advisor";
  if(path.startsWith("/api/surveys/"))return mode === "student" || mode === "advisor";
  if(path.startsWith("/api/artifacts") || path.startsWith("/api/pathway/") || path.startsWith("/api/advising/") || path.startsWith("/api/portfolio/"))return mode === "student";
  return method === "GET" || !path.startsWith("/api/cohort/") || mode === "student";
}
