"use client";
import "./oaca-session-center.css";
import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PilotApiClient } from "./api-client";
import type { AuthorizationContext } from "./types";
import { MappingEditor, OacaImportCenter, type OacaImportBatch } from "./oaca-import-center";
import { normalizeSessionCsv } from "./oaca-session-import";
import { themeDefinitions, themeRuleVersion } from "./oaca-theme-rules";
import { validateImportUpload } from "./oaca-import-model";

type Props = { api: PilotApiClient; supabase: SupabaseClient; context: AuthorizationContext; batches: OacaImportBatch[]; reload: () => Promise<void>; onBack: () => void };
type Preview = ReturnType<typeof normalizeSessionCsv>;
const themeLabel = (key: string) => themeDefinitions.find((theme) => theme.key === key)?.label || key;

function PreviewSummary({ preview }: { preview: Omit<Preview, "sessions"> }) {
  return <section aria-label="Import interpretation"><h3>What Compass understood</h3>
    <p>{preview.summary.rows} sessions · {preview.summary.students} distinct student IDs · {preview.summary.invalidRows} rows need correction.</p>
    <p>Coverage: {preview.summary.coverageStart?.slice(0, 10) || "Unknown"} to {preview.summary.coverageEnd?.slice(0, 10) || "Unknown"}. Cohorts: {preview.summary.cohorts.join(", ")}.</p>
    <p>Scheduled lengths are converted from hours to minutes. Status and attendance remain separate. Missing notes: {preview.summary.missingNotes}; uncategorized: {preview.summary.uncategorizedNotes}.</p>
    <ul>{Object.entries(preview.summary.themes).map(([theme, count]) => <li key={theme}>{themeLabel(theme)}: {count} sessions</li>)}</ul>
    <details><summary>Detected fields and exclusions</summary><ul>{Object.entries(preview.mapping).filter(([, source]) => source).map(([key, source]) => <li key={key}>{key.replaceAll("_", " ")}: {source}</li>)}</ul><p>Not used: {preview.summary.excludedColumns.join(", ") || "None"}.</p></details>
    {preview.issues.length > 0 && <details><summary>{preview.issues.length} validation messages</summary><ul>{preview.issues.map((issue, i) => <li key={i}>Row {issue.rowNumber}: {issue.severity} — {issue.message}</li>)}</ul></details>}
  </section>;
}

function NarrativeReview({ api, batchId }: { api: PilotApiClient; batchId: string }) {
  const [rows, setRows] = useState<Array<{ sessionId: string; startsAt: string; sourceRow: number }>>([]);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<{ sessionId: string; fields: Record<string, string>; matches: Array<{ theme: string }>; override: string[] | null } | null>(null);
  const [chosen, setChosen] = useState<string[]>([]); const [message, setMessage] = useState("");
  const load = async (next = 0) => { try { setRows(await api.request("/api/oaca/imports/narrative-list", { method: "POST", body: { batchId, offset: next } })); setOffset(next); setSelected(null); setMessage(""); } catch { setMessage("Notes could not be loaded for your assigned scope."); } };
  const open = async (sessionId: string) => { try { const data = await api.request<NonNullable<typeof selected>>("/api/oaca/imports/narratives", { method: "POST", body: { sessionId } }); setSelected(data); setChosen(data.override ?? [...new Set(data.matches.map((match) => match.theme))]); } catch { setMessage("Assigned student access is required to view this note."); } };
  const save = async () => { try { await api.request("/api/oaca/imports/themes", { method: "POST", body: { sessionId: selected?.sessionId, themes: chosen } }); setMessage("Categories saved. The source narrative is unchanged."); } catch { setMessage("Categories could not be saved."); } };
  return <details><summary>Review authorized narratives and correct themes</summary><button onClick={() => void load()}>Load authorized sessions</button><p>Live narratives are available only for assigned students. Demo narratives require import-management access.</p>
    {rows.map((row) => <button className="text-button" key={row.sessionId} onClick={() => void open(row.sessionId)}>Row {row.sourceRow} · {row.startsAt.slice(0, 10)}</button>)}
    {offset > 0 && <button onClick={() => void load(Math.max(0, offset - 100))}>Previous</button>}{rows.length === 100 && <button onClick={() => void load(offset + 100)}>Next</button>}
    {selected && <article><h4>Source narrative</h4>{Object.entries(selected.fields).map(([key, text]) => <p key={key}><strong>{key}: </strong>{text}</p>)}<fieldset><legend>Reviewed categories</legend>{themeDefinitions.map((theme) => <label className="check-row" key={theme.key}><input type="checkbox" checked={chosen.includes(theme.key)} onChange={(e) => setChosen(e.target.checked ? [...chosen, theme.key] : chosen.filter((key) => key !== theme.key))} />{theme.label}</label>)}</fieldset><button onClick={() => void save()}>Save categories</button></article>}
    <p role="status">{message}</p>
  </details>;
}

export function OacaSessionCenter(props: Props) {
  const { api, supabase, context, batches, reload, onBack } = props;
  const [roster, setRoster] = useState(false); const [mode, setMode] = useState<"live" | "demo">("demo");
  const [timezone, setTimezone] = useState("America/Los_Angeles"); const [notes, setNotes] = useState(true);
  const [file, setFile] = useState<File | null>(null); const [source, setSource] = useState("");
  const [attested, setAttested] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [insights, setInsights] = useState<"demo" | "live" | null>(null);
  const [watchBatch, setWatchBatch] = useState<string | null>(null);
  const [serverPreviews, setServerPreviews] = useState<Record<string, Omit<Preview, "sessions">>>({});
  const preview = useMemo(() => { if (!source) return null; try { return normalizeSessionCsv(source, { timezone, narrativeProcessing: notes }); } catch { return null; } }, [source, timezone, notes]);
  useEffect(() => {
    if (!watchBatch) return;
    const batch = batches.find((item) => item.id === watchBatch);
    const timer = setTimeout(() => {
      if (batch?.completedAt) { setInsights(batch.datasetMode || "live"); setWatchBatch(null); return; }
      if (batch?.status === "failed" || batch?.status === "rejected") { setWatchBatch(null); return; }
      void reload().catch(() => setMessage("Refresh import history to check progress."));
    }, batch?.completedAt ? 0 : 5000);
    return () => clearTimeout(timer);
  }, [watchBatch, batches, reload]);
  const selectFile = async (next: File | null) => {
    setFile(null); setSource(""); setAttested(false); setMessage(""); if (!next) return;
    const error = validateImportUpload(next); if (error || !next.name.toLowerCase().endsWith(".csv")) { setMessage(error || "Export the session sheet as CSV before uploading."); return; }
    try { const text = await next.text(); normalizeSessionCsv(text, { timezone, narrativeProcessing: notes }); setFile(next); setSource(text); } catch { setMessage("The CSV could not be interpreted. Check its headings, quoting, and timezone."); }
  };
  const upload = async () => {
    if (!file || !preview || !attested) return;
    setBusy(true); setMessage("");
    try {
      const path = `${context.userId}/oaca/imports/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const uploaded = await supabase.storage.from("platform-files").upload(path, file, { contentType: "text/csv", upsert: false });
      if (uploaded.error) throw new Error("Upload failed");
      const record = await api.request<{ id: string }>("/api/platform/files", { method: "POST", body: { experienceKey: "oaca", storagePath: path, originalName: file.name, mimeType: "text/csv", sizeBytes: file.size, purpose: "oaca_import" } });
      await api.request("/api/oaca/imports", { method: "POST", body: { fileId: record.id, sourceSystem: "penji", datasetType: "penji_sessions", datasetMode: mode, timezone, narrativeProcessing: notes, themeRuleVersion, containsRealStudentData: mode === "live", sourceHeaders: preview.headers, periodStartsOn: preview.summary.coverageStart?.slice(0, 10), periodEndsOn: preview.summary.coverageEnd?.slice(0, 10) } });
      setFile(null); setSource(""); setMessage("Uploaded to private quarantine. Refresh history after scanning, then confirm the mapping and review."); await reload();
    } catch { setMessage("The upload could not be completed. Refresh history before retrying."); } finally { setBusy(false); }
  };
  const review = async (batch: OacaImportBatch, decision: "approve" | "reject") => {
    setBusy(true); try { await api.request("/api/oaca/imports/review", { method: "POST", body: { batchId: batch.id, decision } }); if (decision === "approve") setWatchBatch(batch.id); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Review failed."); } finally { setBusy(false); }
  };
  const previewBatch = async (batchId: string) => {
    try { const value = await api.request<Omit<Preview, "sessions">>("/api/oaca/imports/preview", { method: "POST", body: { batchId } }); setServerPreviews((current) => ({ ...current, [batchId]: value })); }
    catch { setMessage("Preview requires a scanned CSV and import access."); }
  };
  if (roster) return <OacaImportCenter {...props} onBack={() => setRoster(false)} />;
  if (insights) return <OacaSessionInsights api={api} initialMode={insights} onBack={() => setInsights(null)} />;
  return <section className="experience-panel session-import-center"><button className="workspace-back text-button" onClick={onBack}>← Staff home</button><p className="kicker">Session history</p><h1>Bring session history into Compass</h1><p>Upload → Preview → Review → Import → Insights</p>
    <div className="form-row"><label>Dataset<select value={mode} onChange={(e) => { setMode(e.target.value as "demo" | "live"); setAttested(false); }}><option value="demo">Demo — isolated from live reporting</option><option value="live">Live student data</option></select></label><label>Source timezone<input value={timezone} onChange={(e) => setTimezone(e.target.value)} /></label></div>
    <label className="check-row"><input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />Code narrative themes using local rules</label><p>Topics are coded from documented text. No external AI service is used. Notes stay restricted; aggregate results contain counts only.</p>
    <label className="file-drop">Choose a Penji or normalized session CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => void selectFile(e.target.files?.[0] || null)} /></label>
    {source && !preview && <p role="alert">The preview is unavailable. Check the timezone.</p>}
    {preview && <><PreviewSummary preview={preview} /><p>This local preview does not upload the file. The server repeats validation after scanning.</p><label className="check-row"><input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />{mode === "demo" ? "This is masked demo data with fictional narratives." : "This upload contains only the student-support information needed for this import."}</label><button className="primary-button" disabled={busy || !attested} onClick={() => void upload()}>Upload for scan and review</button></>}
    <p role="status">{message}</p><div className="workspace-actions"><button onClick={() => void reload().catch(() => setMessage("Import history could not be refreshed."))}>Refresh history</button><button onClick={() => setInsights(mode)}>Explore {mode} insights</button><button onClick={() => setRoster(true)}>Legacy roster import</button></div>
    <div className="record-list"><h2>{mode === "demo" ? "Demo" : "Live"} import history</h2>{batches.filter((batch) => (batch.datasetMode || "live") === mode).map((batch) => <article key={batch.id}><h3>{batch.datasetType === "penji_sessions" ? "Session history" : "Student roster"} · {batch.status.replaceAll("_", " ")}</h3><p>{batch.timezone || "America/Los_Angeles"} · Themes {batch.narrativeProcessing ? "enabled" : "disabled"}</p>
      {batch.status === "awaiting_scan" && <p>Security scan pending. Review is locked.</p>}
      {batch.status === "needs_mapping" && <MappingEditor batch={batch} api={api} reload={reload} />}
      {batch.status === "ready_for_review" && <><p>Review the interpretation before importing. Live data requires a second reviewer.</p><button onClick={() => void previewBatch(batch.id)}>Preview scanned file</button>{serverPreviews[batch.id] && <PreviewSummary preview={serverPreviews[batch.id]} />}<button disabled={busy || !serverPreviews[batch.id] || (batch.containsRealStudentData && batch.requestedBy === context.userId)} onClick={() => void review(batch, "approve")}>Approve and import</button><button disabled={busy} onClick={() => void review(batch, "reject")}>Reject</button></>}
      {batch.status === "failed" && <button onClick={() => { void api.request("/api/oaca/imports/retry", { method: "POST", body: { batchId: batch.id } }).then(() => { setWatchBatch(batch.id); return reload(); }).catch(() => setMessage("Retry requires a reviewed, clean file.")); }}>Retry import</button>}
      {batch.completedAt && <><p>Imported: {Number(batch.qualitySummary.insertedRows ?? batch.validRows)} · Duplicates: {Number(batch.qualitySummary.duplicateRows || 0)} · Rejected: {batch.invalidRows}</p><button onClick={() => setInsights(batch.datasetMode || "live")}>View insights</button><NarrativeReview api={api} batchId={batch.id} /></>}
      {batch.issues.length > 0 && <details><summary>Row issues</summary><ul>{batch.issues.map((issue) => <li key={issue.id}>Row {issue.rowNumber}: {issue.message}</li>)}</ul></details>}
    </article>)}</div>
  </section>;
}

type InsightData = { suppressed: boolean; coverageStart: string | null; coverageEnd: string | null; totals: Record<string, number | null> | null; themes: Array<{ theme: string; sessions: number | null; suppressed: boolean }>; repeatThemes: Array<{ theme: string; sessions: number | null; suppressed: boolean }>; monthlyThemes: Array<{ month: string; theme: string; sessions: number | null; suppressed: boolean }>; months: Array<{ month: string; sessions: number | null; suppressed: boolean }>; cohorts: Array<{ cohortLabel: string; sessions: number | null; suppressed: boolean }>; services: Array<{ serviceKey: string; sessions: number | null; suppressed: boolean }> };
export function OacaSessionInsights({ api, initialMode = "live", onBack }: { api: PilotApiClient; initialMode?: "demo" | "live"; onBack: () => void }) {
  const [mode, setMode] = useState(initialMode); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [result, setResult] = useState<{ key: string; data: InsightData } | null>(null); const [message, setMessage] = useState("");
  const filterKey = `${mode}:${from}:${to}`;
  const data = result?.key === filterKey ? result.data : null;
  useEffect(() => {
    let cancelled = false;
    api.request<InsightData & { datasetMode?: string }>("/api/oaca/analytics", { method: "POST", body: { datasetMode: mode, from: from || null, to: to || null } }).then((value) => {
      if (cancelled) return;
      if (value?.datasetMode !== mode) { setMessage("This environment needs the session-import update before it can show separate demo and live insights."); return; }
      setResult({ key: filterKey, data: value }); setMessage("");
    }).catch(() => { if (!cancelled) setMessage("Insights could not be loaded for this scope."); });
    return () => { cancelled = true; };
  }, [api, mode, from, to, filterKey]);
  const totals = data?.totals;
  return <section className="experience-panel session-import-center"><button className="workspace-back text-button" onClick={onBack}>← Back</button><h1>Session insights</h1><div className="form-row"><label>Dataset<select value={mode} onChange={(e) => setMode(e.target.value as "demo" | "live")}><option value="demo">Demo</option><option value="live">Live</option></select></label><label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>Through<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div><p role="status">{message}</p>
    {mode === "demo" && <p>Masked historical patterns with fictional narratives. These results are separate from live reporting.</p>}
    {data?.suppressed && <p>Results are suppressed because this selection contains fewer than 10 distinct students.</p>}
    {totals && <><p>Coverage: {data?.coverageStart?.slice(0, 10)} through {data?.coverageEnd?.slice(0, 10)}. Monthly reporting uses America/Los_Angeles.</p><div className="metric-grid">{[["sessions", "Imported sessions"], ["studentCount", "Distinct student IDs"], ["hours", "Scheduled support hours"], ["completedSessions", "Completed status"], ["cancelledSessions", "Cancelled status"], ["scheduledSessions", "Scheduled status"], ["repeatStudents", "Students with repeat visits"]].map(([key, label]) => <article key={key}><strong>{totals[key] ?? "—"}</strong><span>{label}</span></article>)}</div>
      <p>{totals.absentSessions} of {totals.attendanceRecorded} sessions with recorded attendance were marked absent ({totals.absenceRate ?? "—"}%). Status conflicts remain flagged in the import.</p><p>Average booking lead time: {totals.averageWaitDays ?? "—"} days across {totals.waitDenominator} eligible records. Booking times after session start are excluded.</p>
      <p>Notes present: {totals.notesPresent} of {totals.sessions} sessions. Missing: {totals.missingNotes}; processing disabled: {totals.excludedNotes}; uncategorized: {totals.uncategorizedNotes}.</p><p>Follow-up was documented in {totals.followUpDocumented} sessions. This does not establish that follow-up happened or a concern was resolved.</p>
    </>}
    {data && <div className="record-list"><section><h2>Documented themes</h2><p>A session may have several themes. Counts describe documentation, not prevalence or diagnoses.</p><ul>{data.themes.map((item) => <li key={item.theme}>{themeLabel(item.theme)}: {item.suppressed ? "Suppressed (fewer than 10 students)" : `${item.sessions} sessions`}</li>)}</ul></section><section><h2>Themes among repeat visitors</h2><ul>{data.repeatThemes.map((item) => <li key={item.theme}>{themeLabel(item.theme)}: {item.suppressed ? "Suppressed" : `${item.sessions} sessions`}</li>)}</ul></section><section><h2>Monthly activity</h2><ul>{data.months.map((item) => <li key={item.month}>{item.month}: {item.suppressed ? "Suppressed" : `${item.sessions} sessions`}</li>)}</ul><details><summary>Themes over time</summary><ul>{data.monthlyThemes.map((item) => <li key={`${item.month}-${item.theme}`}>{item.month} · {themeLabel(item.theme)}: {item.suppressed ? "Suppressed" : item.sessions}</li>)}</ul></details></section><section><h2>Service demand</h2><ul>{data.services.map((item) => <li key={item.serviceKey}>{item.serviceKey.replaceAll("_", " ")}: {item.suppressed ? "Suppressed" : `${item.sessions} sessions`}</li>)}</ul></section><section><h2>Cohorts</h2><ul>{data.cohorts.map((item) => <li key={item.cohortLabel}>{item.cohortLabel}: {item.suppressed ? "Suppressed" : `${item.sessions} sessions`}</li>)}</ul></section></div>}
  </section>;
}
