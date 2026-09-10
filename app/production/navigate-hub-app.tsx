"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlatformAccess } from "./platform-access";
import { experiences } from "./platform-model";
import type { PilotApiClient } from "./api-client";

type AffiliationOrganization = { id: string; key: string; name: string; college: string; campus: string; aliases: string[] };
type AffiliationData = { isStudent: boolean; organizations: AffiliationOrganization[]; organizationIds: string[]; studentCouncil: boolean };

function StudentAffiliations({ api }: { api: PilotApiClient }) {
  const [data, setData] = useState<AffiliationData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [studentCouncil, setStudentCouncil] = useState(false);
  const [query, setQuery] = useState("");
  const [college, setCollege] = useState("All colleges");
  const [message, setMessage] = useState("Loading your affiliations…");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const value = await api.request<AffiliationData>("/api/platform/affiliations");
      setData(value); setSelected(new Set(value.organizationIds)); setStudentCouncil(value.studentCouncil); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your affiliations could not be loaded."); }
  }, [api]);
  useEffect(() => { const task = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(task); }, [load]);
  const colleges = useMemo(() => ["All colleges", ...new Set((data?.organizations || []).map((item) => item.college))], [data]);
  const visible = useMemo(() => (data?.organizations || []).filter((item) => {
    const search = `${item.name} ${item.aliases.join(" ")}`.toLowerCase();
    return (college === "All colleges" || item.college === college) && search.includes(query.trim().toLowerCase());
  }), [college, data, query]);
  const selectedOrganizations = (data?.organizations || []).filter((item) => selected.has(item.id));
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const save = async () => {
    setBusy(true); setMessage("");
    try {
      await api.request("/api/platform/affiliations", { method: "POST", body: { organizationIds: [...selected], studentCouncil } });
      setMessage("Your student affiliations are saved to your Navigate profile.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your affiliations could not be saved."); }
    finally { setBusy(false); }
  };
  if (data && !data.isStudent) return null;
  return <section className="hub-affiliations" aria-labelledby="affiliations-title">
    <div className="hub-affiliations__heading"><div><p className="kicker">Shared student profile</p><h2 id="affiliations-title">Student affiliations</h2><p>Choose your interest groups from the same Roseman directory used in GENESIS. This does not change GENESIS publishing access.</p></div><span className="status-chip">{selected.size + (studentCouncil ? 1 : 0)} selected</span></div>
    {selectedOrganizations.length || studentCouncil ? <div className="affiliation-chips" aria-label="Current affiliations">{studentCouncil ? <span>Student Council</span> : null}{selectedOrganizations.map((item) => <span key={item.id}>{item.name}</span>)}</div> : <p className="affiliation-empty">No affiliations selected yet.</p>}
    <details className="affiliation-editor"><summary>Edit affiliations</summary><div className="affiliation-editor__body">
      <label className="student-council-option"><input aria-label="Student Council designation" type="checkbox" checked={studentCouncil} onChange={(event) => setStudentCouncil(event.target.checked)} /><span><strong>Student Council</strong><small>Add the Student Council designation to your shared student profile.</small></span></label>
      <div className="affiliation-filters"><label><span>Search organizations</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or abbreviation" /></label><label><span>College</span><select value={college} onChange={(event) => setCollege(event.target.value)}>{colleges.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <div className="affiliation-list" aria-label="Student interest groups">{visible.map((item) => <label key={item.id}><input aria-label={item.name} type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} /><span><strong>{item.name}</strong><small>{item.college} · {item.campus}</small></span></label>)}{!visible.length ? <p>No organizations match these filters.</p> : null}</div>
      <button className="primary-button" disabled={busy || !data} onClick={() => void save()}>{busy ? "Saving…" : "Save affiliations"}</button>
    </div></details>
    <p className="form-message" aria-live="polite">{message}</p>
  </section>;
}

export function NavigateHubApp() {
  return <PlatformAccess>{({ api, context, memberships, signOut }) => {
    const active = memberships.filter((membership) => membership.status === "active" && membership.featureEnabled);
    return <div className="navigate-platform navigate-platform--hub">
      <header className="platform-header">
        <a className="platform-wordmark" href="/app" aria-label="Navigate account hub"><span aria-hidden="true">N</span><strong>Navigate</strong></a>
        <div className="platform-account"><span>{context.displayName}</span><button className="text-button" onClick={() => void signOut()}>Sign out</button></div>
      </header>
      <main className="platform-main" id="main-content">
        <section className="hub-intro" aria-labelledby="hub-title">
          <p className="kicker">One account · separate workspaces</p>
          <h1 id="hub-title">Where would you like to go?</h1>
          <p>Each workspace has its own roles, records, and permissions. Opening one never expands access to another.</p>
        </section>
        <section className="experience-grid" aria-label="Your Navigate experiences">
          {active.map((membership) => {
            const experience = experiences[membership.experienceKey];
            return <a key={membership.experienceKey} className={`experience-card experience-card--${experience.accent}`} href={experience.href}>
              <span className="experience-card__mark" aria-hidden="true">{membership.experienceKey === "pathway" ? "↗" : membership.experienceKey === "oaca" ? "⌁" : "✦"}</span>
              <div><p className="kicker">{membership.roles.map((role) => role.replaceAll("_", " ")).join(" · ")}</p><h2>{experience.name}</h2><p>{experience.description}</p></div>
              <strong>Open workspace <span aria-hidden="true">→</span></strong>
            </a>;
          })}
          {!active.length ? <article className="empty-state"><h2>No active experiences yet</h2><p>Your profile is connected, but an administrator still needs to activate a workspace membership.</p></article> : null}
        </section>
        <StudentAffiliations api={api} />
        <aside className="hub-security"><strong>Privacy by workspace</strong><p>Your sign-in is shared. Notes, messages, portfolios, and analytics remain isolated by experience and assignment.</p></aside>
      </main>
    </div>;
  }}</PlatformAccess>;
}
