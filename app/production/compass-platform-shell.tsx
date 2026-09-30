"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import type { PilotApiClient } from "./api-client";
import { DemoWorkspaceTutorial, type DemoTutorialWorkspace } from "./demo-workspace-tutorial";
import { experiences, experienceToWorkspace, type ExperienceKey, type ExperienceMembership, type WorkspaceKey } from "./platform-model";
import { FACILITIES_DEMO_PERSONAS, facilitiesDemoSlugForPersona, IMPACT_DEMO_PERSONAS, impactDemoSlugForPersona, SYNTHETIC_PERSONAS, type SyntheticPersonaKey } from "./synthetic-preview";

export function rememberWorkspace(api: PilotApiClient, workspaceKey: WorkspaceKey, previewMode: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("navigate.last-workspace", workspaceKey);
  if (!previewMode) void api.request("/api/platform/workspace-preference", { method: "POST", body: { lastWorkspaceKey: workspaceKey } }).catch(() => undefined);
}

export function useRememberWorkspace(api: PilotApiClient, workspaceKey: WorkspaceKey, previewMode: boolean) {
  useEffect(() => rememberWorkspace(api, workspaceKey, previewMode), [api, previewMode, workspaceKey]);
}

export function useCreatorPreviewTimeTracking(enabled: boolean, persona: SyntheticPersonaKey | null, workspace: WorkspaceKey, area: string) {
  useEffect(() => {
    if (!enabled || !persona || typeof window === "undefined") return;
    const storageKey = "navigate.creator.preview-time.v2";
    let lastRecordedAt = Date.now();
    const record = () => {
      const now = Date.now();
      const elapsedSeconds = document.visibilityState === "visible" ? Math.max(0, Math.round((now - lastRecordedAt) / 1000)) : 0;
      lastRecordedAt = now;
      if (!elapsedSeconds) return;
      try {
        const stored = JSON.parse(window.localStorage.getItem(storageKey) || '{"totals":{}}') as { totals?: Record<string, { seconds: number; workspace: WorkspaceKey; persona: SyntheticPersonaKey; area: string; updatedAt: string }> };
        const totals = stored.totals || {};
        const entryKey = `${workspace}:${persona}:${area}`;
        const prior = totals[entryKey];
        totals[entryKey] = { seconds: (prior?.seconds || 0) + elapsedSeconds, workspace, persona, area, updatedAt: new Date(now).toISOString() };
        window.localStorage.setItem(storageKey, JSON.stringify({ totals }));
      } catch { /* Creator preview metrics never block the workspace. */ }
    };
    const interval = window.setInterval(record, 5000);
    const handleVisibility = () => { record(); lastRecordedAt = Date.now(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", handleVisibility); record(); };
  }, [area, enabled, persona, workspace]);
}

function workspaceLabel(key: ExperienceKey) {
  return key === "oaca" ? "Compass" : key === "genesis" ? "Impact Workspace" : key === "facilities" ? "Facilities Dashboard" : "Navigate the Pathway";
}

function WorkspaceSwitcherControl({ memberships, current, api, previewMode }: { memberships: ExperienceMembership[]; current: WorkspaceKey; api: PilotApiClient; previewMode: boolean }) {
  const active = memberships.filter((item) => item.status === "active" && item.featureEnabled);
  const currentExperience = active.find((item) => experienceToWorkspace[item.experienceKey] === current);
  const pathwayOnly = active.length === 1 && currentExperience?.experienceKey === "pathway" && currentExperience.roles.includes("student");
  if (pathwayOnly) return <span className="workspace-access-label" data-demo-guide="workspace-switcher">Pre-med student · Pathway only</span>;
  if (current === "impact" && currentExperience?.roles.includes("student")) return <span className="workspace-access-label" data-demo-guide="workspace-switcher">Impact Workspace</span>;
  if (active.length <= 1) return <span className="workspace-access-label" data-demo-guide="workspace-switcher">{workspaceLabel(currentExperience?.experienceKey || "oaca")}</span>;
  return <label className="workspace-switcher" data-demo-guide="workspace-switcher"><span>Workspace</span><select aria-label="Switch Compass workspace" value={current} onChange={(event) => {
    const workspace = event.target.value as WorkspaceKey;
    const next = active.find((item) => experienceToWorkspace[item.experienceKey] === workspace);
    if (!next) return;
    rememberWorkspace(api, workspace, previewMode);
    window.location.assign(experiences[next.experienceKey].href);
  }}>{active.map((item) => <option key={item.experienceKey} value={experienceToWorkspace[item.experienceKey]}>{workspaceLabel(item.experienceKey)}</option>)}</select></label>;
}

export function CreatorPreviewBanner({ persona, onPersona, onExit, scope = "creator", tutorialWorkspace = "compass" }: { persona: SyntheticPersonaKey | null; onPersona: (persona: SyntheticPersonaKey) => void; onExit: () => void; scope?: "creator" | "compass" | "impact" | "facilities"; tutorialWorkspace?: DemoTutorialWorkspace }) {
  if (!persona) return null;
  const personaOptions = scope === "impact"
    ? IMPACT_DEMO_PERSONAS
    : scope === "facilities"
      ? FACILITIES_DEMO_PERSONAS
    : scope === "compass"
      ? SYNTHETIC_PERSONAS.filter((item) => ["compass_student", "peer_tutor", "tutoring_manager", "academic_advisor", "career_advisor", "compass_director"].includes(item.key))
      : SYNTHETIC_PERSONAS;
  const changePersona = (next: SyntheticPersonaKey) => {
    const samePersona = next === persona;
    if (scope === "impact" || scope === "facilities") {
      const url = new URL(window.location.href);
      url.searchParams.set("preview", scope);
      url.searchParams.set("demo", scope === "impact" ? impactDemoSlugForPersona(next) : facilitiesDemoSlugForPersona(next));
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    onPersona(next);
    const target = SYNTHETIC_PERSONAS.find((item) => item.key === next)?.defaultPath || "/app/compass";
    if (window.location.pathname !== target) window.location.replace(target);
    else if ((scope === "impact" || scope === "facilities") && samePersona) window.location.replace(`${window.location.pathname}${window.location.search}${window.location.hash}`);
  };
  return <aside className="creator-preview-shell" role="status" data-demo-guide="preview-banner">
    <div><span className="creator-preview-shell__mark" aria-hidden="true">◇</span><span><strong>{scope === "impact" ? "Impact Demo" : scope === "facilities" ? "Facilities Demo" : scope === "compass" ? "Compass Demo" : "Creator Preview"}</strong><small>Fictional records · strict role-scoped responses</small></span></div>
    <label data-demo-guide="role-switcher"><span>Viewing as</span><select value={persona} onChange={(event) => changePersona(event.target.value as SyntheticPersonaKey)}>{personaOptions.map((item) => <option key={item.key} value={item.key}>{item.label.replace("Compass ", "")}</option>)}</select></label>
    <DemoWorkspaceTutorial key={`${tutorialWorkspace}:${persona}`} workspace={tutorialWorkspace} persona={persona} roleOptions={scope === "impact" ? IMPACT_DEMO_PERSONAS : scope === "facilities" ? FACILITIES_DEMO_PERSONAS : undefined} onPersona={scope === "impact" || scope === "facilities" ? changePersona : undefined} />
    <span className="preview-live-signin"><small>Live Compass sign-in is available</small><a className="text-button" href="/app?signin=1">Roseman SSO</a></span><button className="text-button" onClick={onExit}>{scope === "creator" ? "Exit preview" : "Leave demo"}</button>
  </aside>;
}

const OperationsDialog = lazy(()=>import("./pilot-operations-panel").then(m=>({default:m.OperationsDialog})));
export function WorkspaceSwitcher(props: { memberships: ExperienceMembership[]; current: WorkspaceKey; api: PilotApiClient; previewMode: boolean }) {
  const [open,setOpen]=useState(false);
  const [initialKind,setInitialKind]=useState<"support"|"feature">("support");
  const creator=!props.previewMode && props.memberships.some(m=>m.status==="active" && m.featureEnabled && m.roles.includes("creator"));
  const staff=props.memberships.some(m=>m.roles.some(r=>!["student","requester"].includes(r)));
  const openRequest=(kind:"support"|"feature")=>{setInitialKind(kind);setOpen(true);};
  return <><WorkspaceSwitcherControl {...props}/><div className="workspace-help-actions" aria-label="Compass help"><button type="button" className="workspace-help-icon" aria-label="Support" title="Support" onClick={()=>openRequest("support")}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-5 4v-4.2a2.5 2.5 0 0 1-2-2.3z"/><path d="M8 8h8M8 11.5h5"/></svg><span>Support</span></button><button type="button" className="workspace-help-icon" aria-label="Request a feature" title="Request a feature" onClick={()=>openRequest("feature")}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="9"/></svg><span>Request a feature</span></button></div>{creator?<a className="text-button creator-dashboard-link" href="/app/creator">Creator dashboard</a>:null}{open?<Suspense fallback={<span role="status">Opening support…</span>}><OperationsDialog api={props.api} workspace={props.current} creator={creator} staff={staff} previewMode={props.previewMode} initialKind={initialKind} onClose={()=>setOpen(false)}/></Suspense>:null}</>;
}
