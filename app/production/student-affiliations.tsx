"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PilotApiClient } from "./api-client";

export type AffiliationStatus = "pending" | "approved" | "declined" | "ended";
type Organization = { id: string; key: string; name: string; college: string; campus: string; aliases: string[] };
export type AffiliationRecord = { id: string; organizationId: string; organizationName: string; status: AffiliationStatus; requestedAt: string; reviewedAt: string | null; reviewerName: string | null; reviewNote: string | null };
export type AffiliationData = { isStudent: boolean; organizations: Organization[]; affiliations: AffiliationRecord[]; studentCouncil: boolean; impactAccessStatus: "locked" | "active" | "read_only"; impactHref: string | null };

export function StudentAffiliations({ api }: { api: PilotApiClient }) {
  const [data, setData] = useState<AffiliationData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [studentCouncil, setStudentCouncil] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("Loading your affiliations…");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const value = await api.request<AffiliationData>("/api/platform/affiliations");
      setData(value); setSelected(new Set(value.affiliations.filter((item) => ["pending", "approved"].includes(item.status)).map((item) => item.organizationId))); setStudentCouncil(value.studentCouncil); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your affiliations could not be loaded."); }
  }, [api]);
  useEffect(() => { const task = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(task); }, [load]);
  const visible = useMemo(() => (data?.organizations || []).filter((item) => `${item.name} ${item.aliases.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())), [data, query]);
  const save = async () => {
    setBusy(true); setMessage("");
    try {
      await api.request("/api/platform/affiliations", { method: "POST", body: { organizationIds: [...selected], studentCouncil } });
      setMessage("Affiliations saved. New interest-group requests are pending verification."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your affiliations could not be saved."); }
    finally { setBusy(false); }
  };
  if (data && !data.isStudent) return null;
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <section className="hub-affiliations" aria-labelledby="affiliations-title"><div className="hub-affiliations__heading"><div><p className="kicker">Student profile</p><h2 id="affiliations-title">Interest-group affiliations</h2><p>Request access for the groups you participate in. An Impact Administrator or Community Liaison verifies each request.</p></div>{data ? <span className={`status-chip status-chip--${data.impactAccessStatus === "active" ? "confirmed" : "pending"}`}>{data.impactAccessStatus === "active" ? "Impact active" : data.impactAccessStatus === "read_only" ? "Impact read only" : "Verification required"}</span> : null}</div>
    {data?.affiliations.length ? <div className="affiliation-status-list">{data.affiliations.filter((item) => item.status !== "ended").map((item) => <article key={item.id}><span className={`status-chip status-chip--${item.status === "approved" ? "confirmed" : item.status === "declined" ? "cancelled" : "pending"}`}>{item.status}</span><strong>{item.organizationName}</strong>{item.reviewerName ? <small>Reviewed by {item.reviewerName}</small> : <small>Awaiting verification</small>}</article>)}</div> : <p className="affiliation-empty">No interest-group requests yet.</p>}
    {data?.impactHref && data.impactAccessStatus !== "locked" ? <a className="secondary-button" href={data.impactHref}>{data.impactAccessStatus === "active" ? "Open Impact Workspace" : "View preserved Impact work"}</a> : null}
    <details className="affiliation-editor"><summary>Update affiliations</summary><div className="affiliation-editor__body"><label className="student-council-option"><input aria-label="Student Council designation" type="checkbox" checked={studentCouncil} onChange={(event) => setStudentCouncil(event.target.checked)} /><span><strong>Student Council</strong><small>Profile designation and event audience filter. It does not unlock Impact.</small></span></label><label><span>Search interest groups</span><input aria-label="Search interest groups" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or abbreviation" /></label><div className="affiliation-list">{visible.map((item) => <label key={item.id}><input aria-label={item.name} type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} /><span><strong>{item.name}</strong><small>{item.college} · {item.campus}</small></span></label>)}</div><button className="primary-button" disabled={busy || !data} onClick={() => void save()}>{busy ? "Saving…" : "Save and request verification"}</button></div></details><p className="form-message" aria-live="polite">{message}</p>
  </section>;
}
