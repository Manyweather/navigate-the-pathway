"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RosieGuide } from "../components/rosie-guide";
import { PilotApiClient } from "./api-client";
import type { AuthorizationContext, GovernanceRequest, PrincipalOverview, UserAccessLog, UserAccessPerson } from "./types";

function Onboarding({ overview, api, onDone }: { overview: PrincipalOverview; api: PilotApiClient; onDone: () => void }) {
  const creator = overview.principalType === "creator";
  const acknowledge = async () => { await api.request("/api/governance/principal/acknowledge", { method: "POST", body: {} }); onDone(); };
  return <div className="principal-onboarding" role="dialog" aria-modal="true" aria-labelledby="principal-onboarding-title"><section><RosieGuide pose="idle" eyebrow={creator ? "Platform Creator Access" : "Principal Investigator Access"} title={creator ? "You hold the platform’s highest operational responsibility." : "You share responsibility for evaluation governance."} body="Sensitive controls are separated from the everyday Administrator dashboard and every action is audited." /><h2 id="principal-onboarding-title">Before you continue</h2><div className="privilege-grid"><article><strong>Available</strong><p>{creator ? "Accounts, roles, configuration, identifiable evaluation, exports, audit history, reset initiation, and eligible purge execution." : "Configuration, evaluation, exports, accounts, permissions, review, and approval."}</p></article><article><strong>Responsibility</strong><p>Use identifiable data only for approved purposes. Confirm instrument permissions, consent, retention, privacy, and accessibility before real data collection.</p></article><article><strong>Excluded</strong><p>{creator ? "You cannot approve your own governance request or bypass PI review." : "You cannot reset pilot records, permanently purge accounts, or approve your own request."}</p></article></div><button className="primary-button" onClick={() => void acknowledge()}>I understand my privileges</button></section></div>;
}

function PrincipalDirectory({ overview, people, api, reload }: { overview: PrincipalOverview; people: UserAccessPerson[]; api: PilotApiClient; reload: () => void }) {
  const administrators = people.filter((person) => person.roles.includes("administrator") && person.userId !== overview.creator?.userId);
  const [target, setTarget] = useState(overview.principalInvestigator?.userId || "");
  const [message, setMessage] = useState("");
  const designate = async () => { if (!target) return; try { await api.request("/api/governance/principal-investigator", { method: "POST", body: { userId: target } }); setMessage("Principal Investigator access assigned."); reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "The designation could not be saved."); } };
  return <section className="production-card"><p className="kicker">Principal roles</p><h2>Creator and PI</h2><dl className="principal-list"><div><dt>Creator</dt><dd>{overview.creator?.displayName || "Not assigned"}<small>{overview.creator?.email}</small></dd></div><div><dt>Principal Investigator</dt><dd>{overview.principalInvestigator?.displayName || "Not assigned"}<small>{overview.principalInvestigator?.email}</small></dd></div></dl>{overview.principalType === "creator" ? <><label><span>Administrator to designate as PI</span><select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Select an administrator</option>{administrators.map((person) => <option value={person.userId} key={person.userId}>{person.displayName} · {person.email}</option>)}</select></label><button className="primary-button" disabled={!target} onClick={() => void designate()}>Designate Principal Investigator</button></> : null}{message ? <p className="form-message">{message}</p> : null}</section>;
}

function GovernanceQueue({ overview, context, requests, api, reload }: { overview: PrincipalOverview; context: AuthorizationContext; requests: GovernanceRequest[]; api: PilotApiClient; reload: () => void }) {
  const [message, setMessage] = useState("");
  const decide = async (request: GovernanceRequest, decision: "approve" | "reject") => { try { await api.request(`/api/governance/requests/${request.id}/decision`, { method: "POST", body: { decision, retentionCleared: request.requestType === "account_purge", note: "Reviewed through Creator Controls" } }); setMessage(`Request ${decision === "approve" ? "approved" : "rejected"}.`); reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "The decision could not be saved."); } };
  const execute = async (request: GovernanceRequest) => { if (!window.confirm("This approved action is destructive and cannot be undone. Continue?")) return; try { await api.request(`/api/governance/requests/${request.id}/execute`, { method: "POST", body: { confirmation: "EXECUTE" } }); setMessage("Approved action executed and audited."); reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "The action could not be executed."); } };
  const requestAction = async (requestType: "survey_publication" | "grant_checkpoints_activation") => { try { await api.request("/api/governance/requests", { method: "POST", body: { requestType, purpose: "Joint governance review from Creator Controls" } }); setMessage("Governance request created for review by the other principal."); reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "The request could not be created."); } };
  return <section className="production-card production-card--wide"><div className="section-heading"><div><p className="kicker">Dual approval</p><h2>Governance requests</h2><p>No principal may approve their own request.</p></div><div className="governance-actions"><button className="secondary-button" onClick={() => void requestAction("survey_publication")}>Request survey publication</button><button className="secondary-button" onClick={() => void requestAction("grant_checkpoints_activation")}>Request outcome checkpoints</button></div></div>{message ? <p className="form-message">{message}</p> : null}<div className="governance-queue">{requests.map((request) => <article key={request.id}><div><span>{request.requestType.replaceAll("_", " ")}</span><strong>{request.status}</strong></div><p>Created {new Date(request.createdAt).toLocaleString()}</p><p className="manifest-line">{Object.entries(request.manifest).map(([key, value]) => `${key}: ${value}`).join(" · ")}</p><div>{request.status === "pending" && request.initiatedBy !== context.userId ? <><button className="primary-button" onClick={() => void decide(request, "approve")}>Approve</button><button className="secondary-button" onClick={() => void decide(request, "reject")}>Reject</button></> : null}{request.status === "approved" && overview.principalType === "creator" && ["pilot_reset", "account_purge"].includes(request.requestType) ? <button className="danger-button" onClick={() => void execute(request)}>Execute approved action</button> : null}{request.status === "approved" && ["survey_publication", "grant_checkpoints_activation"].includes(request.requestType) ? <button className="primary-button" onClick={() => void execute(request)}>Activate approved change</button> : null}</div></article>)}{requests.length === 0 ? <p>No governance requests have been created.</p> : null}</div></section>;
}

function AccountLifecycle({ context, people, api, reload }: { context: AuthorizationContext; people: UserAccessPerson[]; api: PilotApiClient; reload: () => void }) {
  const [message, setMessage] = useState("");
  const act = async (person: UserAccessPerson, action: "deactivate" | "restore" | "purge") => {
    try {
      if (action === "purge") await api.request("/api/governance/requests", { method: "POST", body: { requestType: "account_purge", subjectId: person.userId, purpose: "Account lifecycle request from Creator Controls" } });
      else await api.request(`/api/admin/accounts/${person.userId}/${action}`, { method: "POST", body: {} });
      setMessage(action === "purge" ? "Purge review requested. The account is deactivated for the seven-day recovery period." : `Account ${action === "restore" ? "restored" : "deactivated"}.`); reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The account action could not be completed."); }
  };
  return <section className="production-card production-card--wide"><p className="kicker">Account lifecycle</p><h2>Access, deactivation, and recovery</h2><p>Deactivation is immediate. Permanent purge requires PI review, a seven-day recovery period, Creator MFA, and a second execution step.</p>{message ? <p className="form-message">{message}</p> : null}<div className="access-log-table-wrap"><table className="access-log-table"><thead><tr><th>Account</th><th>Roles</th><th>Status</th><th>Principal</th><th>Actions</th></tr></thead><tbody>{people.map((person) => <tr key={person.userId}><td><strong>{person.displayName}</strong><br /><small>{person.email}</small></td><td>{person.roles.join(", ")}</td><td>{person.accountStatus}</td><td>{person.principalType?.replaceAll("_", " ") || "No"}</td><td><div className="table-actions">{person.accountStatus === "suspended" ? <button className="secondary-button table-action-button" onClick={() => void act(person, "restore")}>Restore</button> : <button className="secondary-button table-action-button" disabled={Boolean(person.principalType)} onClick={() => void act(person, "deactivate")}>Deactivate</button>}{context.principalType === "creator" ? <button className="danger-button table-action-button" disabled={Boolean(person.principalType)} onClick={() => void act(person, "purge")}>Request purge</button> : null}</div></td></tr>)}</tbody></table></div></section>;
}

export function PrincipalBadge({ context, onReview }: { context: AuthorizationContext; onReview?: () => void }) {
  if (!context.principalType) return null;
  return <button className="principal-badge" onClick={onReview}><span>{context.principalType === "creator" ? "Creator" : "Principal Investigator"}</span><small>Review my privileges</small></button>;
}

export function CreatorControls({ api, context }: { api: PilotApiClient; context: AuthorizationContext }) {
  const [overview, setOverview] = useState<PrincipalOverview | null>(null);
  const [requests, setRequests] = useState<GovernanceRequest[]>([]);
  const [people, setPeople] = useState<UserAccessPerson[]>([]);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [message, setMessage] = useState("Loading Creator Controls...");
  const [reviewPrivileges, setReviewPrivileges] = useState(false);
  const load = useCallback(async () => {
    try {
      const [principal, queue, log] = await Promise.all([api.request<PrincipalOverview>("/api/governance/principal"), api.request<GovernanceRequest[]>("/api/governance/requests"), api.request<UserAccessLog>("/api/admin/user-access-log")]);
      setOverview(principal); setRequests(queue); setPeople(log.people || log.students); setMessage("");
      if (principal.principalType === "creator") api.request<{ counts: Record<string, number> }>("/api/admin/reset-preview").then((value) => setPreview(value.counts)).catch(() => setPreview(null));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Creator Controls could not be loaded."); }
  }, [api]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const resetTotal = useMemo(() => Object.values(preview || {}).reduce((sum, value) => sum + value, 0), [preview]);
  const requestReset = async () => { if (!window.confirm("Create a dual-approval request to reset pilot records? No records are removed at this step.")) return; try { await api.request("/api/governance/requests", { method: "POST", body: { requestType: "pilot_reset", purpose: "Reset requested through Creator Controls" } }); setMessage("Pilot reset request sent to the PI for review."); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "The reset request could not be created."); } };
  if (!overview) return <section className="production-card"><p>{message}</p></section>;
  return <div className="production-grid creator-controls"><section className="production-card production-card--wide creator-controls__hero"><div><p className="kicker">Creator Controls</p><h2>Governance, sensitive data, and account lifecycle</h2><p>This area is visible only to the Creator and Principal Investigator. Destructive actions use separate initiation, approval, and execution steps.</p></div><PrincipalBadge context={context} onReview={() => setReviewPrivileges(true)} /></section>
    <PrincipalDirectory overview={overview} people={people} api={api} reload={load} />
    <section className="production-card"><p className="kicker">Pilot records</p><h2>Reset preview</h2>{overview.principalType === "creator" ? <><p><strong>{resetTotal}</strong> eligible records across the current pilot.</p><div className="reset-manifest">{Object.entries(preview || {}).map(([key, value]) => <span key={key}>{key.replaceAll("_", " ")}: {value}</span>)}</div><button className="danger-button" onClick={() => void requestReset()}>Request pilot reset</button></> : <p>The PI reviews reset manifests and cannot initiate or execute a reset.</p>}</section>
    <GovernanceQueue overview={overview} context={context} requests={requests} api={api} reload={load} />
    {context.capabilities.includes("accounts.manage") ? <AccountLifecycle context={context} people={people} api={api} reload={load} /> : null}
    {(!overview.acknowledged || reviewPrivileges) ? <Onboarding overview={overview} api={api} onDone={() => { setReviewPrivileges(false); void load(); }} /> : null}
  </div>;
}
