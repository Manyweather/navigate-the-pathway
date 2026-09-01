"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PilotApiClient } from "./api-client";
import type { AdminDashboard, AnalysisDepth, AnalyticsConfiguration, AuthorizationContext, QualitativeWorkspace, SurveyAnalytics } from "./types";

type Audience = "student" | "advisor";

const depthCopy: Record<AnalysisDepth, string> = {
  descriptive: "Completion, distributions, central tendency, variability, and item results",
  comparative: "Paired change, improvement, effect size, confidence interval, and attendance relationships",
  statistical: "Approved tests, associations, p-values, adjustments, assumptions, and limitations",
};

function CompletionRows({ completion, audience }: { completion: AdminDashboard["surveyCompletion"]; audience: Audience }) {
  const rows = completion.filter((item) => item.audience === audience);
  return <div className="completion-chart__rows">{rows.map((item) => {
    const percent = item.assigned ? Math.round((item.submitted / item.assigned) * 100) : 0;
    return <article key={`${audience}:${item.instrumentName}`}><div><strong>{item.instrumentName}</strong><span>{item.submitted} of {item.assigned} submitted</span></div><div className="completion-chart__track" aria-label={`${item.instrumentName} ${percent} percent complete`}><i style={{ width: `${percent}%` }} /></div><b>{percent}%</b></article>;
  })}{rows.length === 0 ? <p>No {audience} assignments have been opened yet.</p> : null}</div>;
}

function AnalyticsResults({ analytics }: { analytics: SurveyAnalytics }) {
  return <>
    <div className="evaluation-summary">
      <article><strong>{analytics.submitted}</strong><span>Submitted</span></article>
      <article><strong>{analytics.completionPercent}%</strong><span>Completion</span></article>
      <article><strong>{analytics.groups.filter((group) => !group.suppressed).length}</strong><span>Displayed groups</span></article>
    </div>
    <div className="analytics-insights" aria-label="Grant-focused insights">{analytics.insights.map((insight) => <article className={`analytics-insight analytics-insight--${insight.level}`} key={`${insight.title}:${insight.body}`}><strong>{insight.title}</strong><p>{insight.body}</p></article>)}</div>
    <div className="analytics-grid">
      <section><h3>Comparison groups</h3><div className="analytics-group-list">{analytics.groups.map((group) => <article key={group.key} className={group.suppressed ? "is-suppressed" : ""}><div><strong>{group.label}</strong><span>{group.suppressed ? "Group below display threshold" : `${group.count} responses${group.smallSample ? " · small sample" : ""}`}</span></div>{group.suppressed ? null : <dl><div><dt>Mean</dt><dd>{group.mean ?? "N/A"}</dd></div><div><dt>Median</dt><dd>{group.median ?? "N/A"}</dd></div><div><dt>SD</dt><dd>{group.standardDeviation ?? "N/A"}</dd></div><div><dt>IQR</dt><dd>{group.interquartileRange ?? "N/A"}</dd></div></dl>}</article>)}</div></section>
      <section><h3>Change and relationship</h3>{analytics.pairedChange ? <div className="metric-panel"><p><strong>{analytics.pairedChange.meanChange ?? "N/A"}</strong><span>Mean paired change</span></p><p><strong>{analytics.pairedChange.percentImproved ?? "N/A"}%</strong><span>Participants improving</span></p><p><strong>{analytics.pairedChange.effectSize ?? "N/A"}</strong><span>Effect size</span></p>{analytics.depth === "statistical" ? <p><strong>{analytics.pairedChange.adjustedPValue ?? "N/A"}</strong><span>FDR-adjusted p-value</span></p> : null}</div> : <p className="privacy-note">Choose one instrument with at least two submitted waves to calculate paired change.</p>}{analytics.attendanceAssociation ? <p className="analysis-note">Attendance association: Spearman rho {analytics.attendanceAssociation.spearmanRho ?? "N/A"}{analytics.depth === "statistical" ? `, p ${analytics.attendanceAssociation.pValue ?? "N/A"}, FDR-adjusted p ${analytics.attendanceAssociation.adjustedPValue ?? "N/A"}` : ""}. This relationship is not causal.</p> : null}</section>
    </div>
    <section className="item-results"><h3>Item-level results</h3><div>{analytics.itemResults.slice(0, 30).map((item) => <article key={item.itemKey}><span>{item.itemKey.split(":").pop()}</span><i style={{ width: `${Math.min(100, ((item.mean || 0) / 5) * 100)}%` }} /><strong>{item.mean ?? "Suppressed"}</strong></article>)}</div>{analytics.instrumentSlug?.includes("pre-health") ? <p className="privacy-note">The Self-Assessment is reported item by item. No composite score is calculated.</p> : null}{analytics.instrumentSlug?.includes("advisor-coaching") ? <p className="privacy-note">ACCS calculations remain descriptive and provisional until the PI approves a validation approach.</p> : null}</section>
  </>;
}

function ExportPanel({ api, context }: { api: PilotApiClient; context: AuthorizationContext }) {
  const [format, setFormat] = useState("xlsx");
  const [identity, setIdentity] = useState("deidentified");
  const [purpose, setPurpose] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const allowed = context.capabilities.includes("evaluation.raw_export");
  const download = async () => {
    if (!purpose.trim()) { setMessage("Enter the evaluation purpose before downloading."); return; }
    if (identity === "identifiable" && !window.confirm("Identifiable files contain sensitive participant data. Continue only for the stated, approved purpose.")) return;
    setBusy(true); setMessage("");
    try {
      const query = new URLSearchParams({ format, identity, purpose, ...(identity === "identifiable" ? { confirm: "IDENTIFIABLE" } : {}) });
      const result = await api.download(`/api/evaluation/export?${query}`);
      const href = URL.createObjectURL(result.blob); const link = document.createElement("a"); link.href = href; link.download = result.filename; link.click(); URL.revokeObjectURL(href);
      setMessage("Protected export downloaded and recorded in the audit history.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The export could not be prepared."); } finally { setBusy(false); }
  };
  if (!allowed) return <section className="production-card"><h3>Raw-data exports</h3><p className="privacy-note">Raw exports are limited to the Creator, PI, and administrators explicitly granted the raw-export capability.</p></section>;
  return <section className="production-card export-panel"><p className="kicker">Protected download</p><h3>Analysis-ready data</h3><p>De-identified export is the default. Every download is audited.</p><label><span>File type</span><select value={format} onChange={(event) => setFormat(event.target.value)}><option value="xlsx">Multi-sheet Excel workbook</option><option value="csv_zip">CSV files and codebook in ZIP</option></select></label><label><span>Identity</span><select value={identity} onChange={(event) => setIdentity(event.target.value)}><option value="deidentified">De-identified</option><option value="identifiable">Identifiable, MFA and warning required</option></select></label><label><span>Approved purpose</span><textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Describe how this export will be used" /></label><button className="primary-button" disabled={busy} onClick={() => void download()}>{busy ? "Preparing..." : "Download protected export"}</button>{message ? <p className="form-message" aria-live="polite">{message}</p> : null}</section>;
}

function AnalyticsGovernance({ api }: { api: PilotApiClient }) {
  const [configuration, setConfiguration] = useState<AnalyticsConfiguration | null>(null);
  const [message, setMessage] = useState("Loading governance settings...");
  useEffect(() => { api.request<AnalyticsConfiguration>("/api/admin/analytics/config").then((value) => { setConfiguration(value); setMessage(""); }).catch((error) => setMessage(error.message)); }, [api]);
  const save = async () => {
    if (!configuration) return;
    try { setConfiguration(await api.request<AnalyticsConfiguration>("/api/admin/analytics/config", { method: "PUT", body: configuration })); setMessage("Analytics governance settings saved."); } catch (error) { setMessage(error instanceof Error ? error.message : "Settings could not be saved."); }
  };
  if (!configuration) return <section className="production-card"><p>{message}</p></section>;
  const dimensions = [
    ["wave", "Survey wave", false], ["institution", "Institution", false], ["cohort", "Cohort", false], ["class_year", "Class year", false], ["attendance_band", "Attendance band", false], ["completion_status", "Completion status", false],
    ["first_generation", "First-generation status", true], ["socioeconomic_indicator", "Socioeconomic indicator", true], ["gender", "Gender", true], ["race_ethnicity", "Race and ethnicity", true],
  ] as const;
  return <section className="production-card production-card--wide"><p className="kicker">Evaluation Governance</p><h2>Comparison dimensions</h2><p>Only one dimension can be analyzed at a time. Sensitive dimensions begin disabled and require Creator or PI review.</p><div className="governance-dimensions">{dimensions.map(([key, label, sensitive]) => <label key={key}><input aria-label={`Enable ${label}`} type="checkbox" checked={configuration.enabledDimensions.includes(key)} onChange={(event) => setConfiguration((current) => current ? { ...current, enabledDimensions: event.target.checked ? [...new Set([...current.enabledDimensions, key])] : current.enabledDimensions.filter((item) => item !== key), sensitiveDimensions: sensitive && event.target.checked ? [...new Set([...current.sensitiveDimensions, key])] : current.sensitiveDimensions.filter((item) => item !== key) } : current)} /><span><strong>{label}</strong><small>{sensitive ? "Sensitive, disabled until explicitly approved" : "Standard comparison"}</small></span></label>)}</div><div className="governance-status"><strong>Grant Outcome Checkpoints</strong><span>{configuration.grantCheckpointsStatus.replaceAll("_", " ")}</span><p>Preparation plans, confidence, persistence, MCAT activity, applications, interviews, acceptances, and matriculation remain disabled until joint Creator and PI approval.</p></div><button className="primary-button" onClick={() => void save()}>Save governance settings</button>{message ? <p className="form-message" aria-live="polite">{message}</p> : null}</section>;
}

function QualitativePanel({ api }: { api: PilotApiClient }) {
  const [workspace, setWorkspace] = useState<QualitativeWorkspace | null>(null);
  const [message, setMessage] = useState("Loading protected responses...");
  const [codeLabel, setCodeLabel] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  useEffect(() => { api.request<QualitativeWorkspace>("/api/evaluation/qualitative").then((value) => { setWorkspace(value); setMessage(""); }).catch((error) => setMessage(error.message)); }, [api]);
  const update = async (body: Record<string, unknown>, success: string) => { try { setWorkspace(await api.request<QualitativeWorkspace>("/api/evaluation/qualitative", { method: "POST", body })); setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : "The coding action could not be saved."); } };
  const createCode = async () => { if (!codeLabel.trim()) return; await update({ action: "create_code", label: codeLabel }, "Code added with creator history."); setCodeLabel(""); };
  return <section className="production-card production-card--wide"><p className="kicker">Protected qualitative workspace</p><h2>Open-response coding</h2><p>Keyword suggestions are generated on the server. They do not enter reports until a human evaluator accepts, renames, merges, or rejects them.</p>{message ? <p className="form-message">{message}</p> : null}{workspace ? <><div className="codebook-toolbar"><label><span>New code</span><input value={codeLabel} onChange={(event) => setCodeLabel(event.target.value)} placeholder="Example: developing confidence" /></label><button className="secondary-button" onClick={() => void createCode()}>Add to codebook</button><label><span>Code to apply</span><select value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)}><option value="">Select a code</option>{workspace.codes.map((code) => <option value={code.id} key={code.id}>{code.label}</option>)}</select></label></div><div className="qualitative-grid"><div><h3>Responses</h3>{workspace.responses.slice(0, 12).map((response) => <article key={`${response.responseSetId}:${response.itemKey}`}><span>Protected excerpt</span><p>{response.text}</p><small>{response.codes.length ? `${response.codes.length} code${response.codes.length === 1 ? "" : "s"} applied` : "Uncoded"}</small><button className="secondary-button table-action-button" disabled={!selectedCode || response.codes.includes(selectedCode)} onClick={() => void update({ action: "tag_response", responseSetId: response.responseSetId, itemKey: response.itemKey, excerpt: response.text, codeId: selectedCode }, "Response coded and attributed to the current evaluator.")}>Apply selected code</button></article>)}{workspace.responses.length === 0 ? <p>No open responses have been submitted.</p> : null}</div><div><h3>Review suggestions</h3>{workspace.suggestions.map((suggestion) => <article key={suggestion.id}><strong>{suggestion.reviewedLabel || suggestion.label}</strong><span>{suggestion.responseCount} matching responses · {suggestion.status}</span>{suggestion.status === "suggested" ? <div className="theme-actions"><button className="secondary-button table-action-button" onClick={() => void update({ action: "review_suggestion", status: "accepted", label: suggestion.label, keywords: suggestion.keywords, responseCount: suggestion.responseCount }, "Suggested theme accepted by a human reviewer.")}>Accept</button><button className="secondary-button table-action-button" onClick={() => void update({ action: "review_suggestion", status: "rejected", label: suggestion.label, keywords: suggestion.keywords, responseCount: suggestion.responseCount }, "Suggested theme rejected and retained in decision history.")}>Reject</button></div> : <p>Human decision recorded.</p>}</article>)}{workspace.suggestions.length === 0 ? <p>Suggestions appear after recurring terms are detected.</p> : null}</div></div></> : null}</section>;
}

export function SurveyAnalyticsCenter({ api, context, completion }: { api: PilotApiClient; context: AuthorizationContext; completion: AdminDashboard["surveyCompletion"] }) {
  const [audience, setAudience] = useState<Audience>("student");
  const [depth, setDepth] = useState<AnalysisDepth>("descriptive");
  const [dimension, setDimension] = useState("wave");
  const [instrument, setInstrument] = useState("");
  const [analytics, setAnalytics] = useState<SurveyAnalytics | null>(null);
  const [message, setMessage] = useState("Loading analytics...");
  const canAnalyze = context.capabilities.some((item) => ["evaluation.governance", "evaluation.identifiable_results"].includes(item));
  const query = useMemo(() => new URLSearchParams({ audience, depth, dimension, ...(instrument ? { instrument } : {}) }).toString(), [audience, depth, dimension, instrument]);
  const load = useCallback(async () => { if (!canAnalyze) return; try { const value = await api.request<SurveyAnalytics>(`/api/evaluation/analytics?${query}`); setAnalytics(value); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "Analytics could not be loaded."); } }, [api, canAnalyze, query]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return <div className="production-grid survey-analytics-center">
    <section className="production-card production-card--wide"><div className="survey-program-tabs" role="tablist" aria-label="Survey program"><button role="tab" aria-selected={audience === "student"} className={audience === "student" ? "active" : ""} onClick={() => { setAudience("student"); setInstrument(""); }}>Student Surveys</button><button role="tab" aria-selected={audience === "advisor"} className={audience === "advisor" ? "active" : ""} onClick={() => { setAudience("advisor"); setInstrument(""); }}>Advisor Surveys</button></div><div className="section-heading"><div><p className="kicker">{audience} survey program</p><h2>Completion and grant-focused analysis</h2><p>Student and advisor measures are calculated and reported separately. Scores stay hidden from participants.</p></div></div><CompletionRows completion={completion} audience={audience} /></section>
    {canAnalyze ? <section className="production-card production-card--wide"><div className="analytics-controls"><label><span>Instrument</span><select value={instrument} onChange={(event) => setInstrument(event.target.value)}><option value="">All instruments</option>{analytics?.availableInstruments.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label><label><span>Analysis depth</span><select value={depth} onChange={(event) => setDepth(event.target.value as AnalysisDepth)}><option value="descriptive">Descriptive</option><option value="comparative">Comparative</option><option value="statistical">Statistical</option></select></label><label><span>Compare by</span><select value={dimension} onChange={(event) => setDimension(event.target.value)}>{analytics?.availableDimensions.filter((item) => item.enabled).map((item) => <option key={item.key} value={item.key}>{item.label}{item.sensitive ? " · sensitive" : ""}</option>) || <option value="wave">Survey wave</option>}</select></label><button className="secondary-button" onClick={() => void load()}>Refresh</button></div><p className="analysis-definition">{depthCopy[depth]}. One comparison dimension at a time prevents intersectional multi-slicing.</p>{message ? <p className="form-message" aria-live="polite">{message}</p> : null}{analytics ? <AnalyticsResults analytics={analytics} /> : null}</section> : <section className="production-card production-card--wide"><p className="privacy-note">Aggregate analytics require an evaluation capability. General administrators can monitor completion without seeing scores or answers.</p></section>}
    {context.capabilities.includes("evaluation.governance") ? <AnalyticsGovernance api={api} /> : null}
    {context.capabilities.includes("evaluation.qualitative_analysis") ? <QualitativePanel api={api} /> : null}
    <ExportPanel api={api} context={context} />
  </div>;
}
