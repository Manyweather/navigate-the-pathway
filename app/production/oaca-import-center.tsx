"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PilotApiClient } from "./api-client";
import type { AuthorizationContext } from "./types";
import {
  oacaHistoricalBaseline,
  oacaImportDatasets,
  parseCsvHeader,
  suggestImportMapping,
  validateImportMapping,
  validateImportUpload,
  type OacaImportDataset,
  type OacaImportMapping,
} from "./oaca-import-model";

export type OacaImportBatch = {
  id: string;
  fileId: string;
  sourceSystem: string;
  datasetType: OacaImportDataset;
  cohortLabel: string | null;
  periodStartsOn: string | null;
  periodEndsOn: string | null;
  containsRealStudentData: boolean;
  sourceHeaders: string[];
  columnMapping: OacaImportMapping;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  matchedStudents: number;
  qualitySummary: Record<string, unknown>;
  requestedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  completedAt: string | null;
  issues: Array<{ id: number; rowNumber: number; severity: string; code: string; fieldKey: string | null; message: string }>;
};

export type OacaAggregateAnalytics = {
  minimumGroupSize?: number;
  coverageStart?: string | null;
  coverageEnd?: string | null;
  totals?: { sessions?: number; studentCount?: number; hours?: number; completionRate?: number | null; noShowRate?: number | null; rescheduleRate?: number | null; averageWaitDays?: number | null };
  services?: Array<{ serviceKey: string; studentCount: number; sessions: number | null; hours: number | null; suppressed: boolean }>;
  cohorts?: Array<{ cohortLabel: string; studentCount: number; sessions: number | null; hours: number | null; noShowRate: number | null; suppressed: boolean }>;
};

function MappingEditor({ batch, api, reload }: { batch: OacaImportBatch; api: PilotApiClient; reload: () => Promise<void> }) {
  const suggested = useMemo(() => ({ ...suggestImportMapping(batch.datasetType, batch.sourceHeaders), ...batch.columnMapping }), [batch]);
  const [mapping, setMapping] = useState<OacaImportMapping>(suggested);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const check = validateImportMapping(batch.datasetType, mapping);
  const save = async () => {
    setBusy(true); setMessage("");
    try { await api.request("/api/oaca/imports/mapping", { method: "POST", body: { batchId: batch.id, columnMapping: mapping } }); setMessage("Mapping saved. The import is ready for independent review."); await reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The mapping could not be saved."); }
    finally { setBusy(false); }
  };
  return <div className="import-mapping"><h3>Map source columns</h3><p>Compass guessed exact and common Penji headings. Confirm each required field before review.</p><div className="mapping-grid">{oacaImportDatasets[batch.datasetType].fields.map((field) => <label key={field.key}><span>{field.label}{field.required ? " *" : ""}</span><select value={mapping[field.key] || ""} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value || null }))}><option value="">Not imported</option>{batch.sourceHeaders.map((header) => <option key={header} value={header}>{header}</option>)}</select><small>{field.description}</small></label>)}</div>{check.missing.length ? <p className="form-message">Missing: {check.missing.join(", ").replaceAll("_", " ")}</p> : null}{check.duplicateSourceColumns.length ? <p className="form-message">A source column can be used only once.</p> : null}<button className="primary-button" disabled={busy || !check.valid} onClick={() => void save()}>{busy ? "Saving…" : "Save mapping for review"}</button><p className="form-message" aria-live="polite">{message}</p></div>;
}

export function OacaImportCenter({ api, supabase, context, batches, reload, onBack }: { api: PilotApiClient; supabase: SupabaseClient; context: AuthorizationContext; batches: OacaImportBatch[]; reload: () => Promise<void>; onBack: () => void }) {
  const [datasetType, setDatasetType] = useState<OacaImportDataset>("penji_sessions");
  const [cohortLabel, setCohortLabel] = useState(oacaHistoricalBaseline.cohortLabel);
  const [periodStartsOn, setPeriodStartsOn] = useState(oacaHistoricalBaseline.coverageStartsOn);
  const [periodEndsOn, setPeriodEndsOn] = useState("");
  const [attested, setAttested] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) { setMessage("Choose a CSV or XLSX file."); return; }
    const invalid = validateImportUpload(file);
    if (invalid) { setMessage(invalid); return; }
    if (!attested) { setMessage("Confirm the data-minimization statement before uploading."); return; }
    setBusy(true); setMessage("Encrypting the upload in transit and placing it in private quarantine…");
    try {
      const sourceHeaders = file.name.toLowerCase().endsWith(".csv") ? parseCsvHeader(await file.slice(0, 262144).text()) : oacaImportDatasets[datasetType].fields.map((field) => field.key);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const storagePath = `${context.userId}/oaca/imports/${crypto.randomUUID()}-${safeName}`;
      const uploaded = await supabase.storage.from("platform-files").upload(storagePath, file, { contentType: file.type || (file.name.toLowerCase().endsWith(".csv") ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), upsert: false });
      if (uploaded.error) throw new Error("The private upload could not be completed.");
      const fileRecord = await api.request<{ id: string }>("/api/platform/files", { method: "POST", body: { experienceKey: "oaca", storagePath, originalName: file.name, mimeType: file.type || (file.name.toLowerCase().endsWith(".csv") ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), sizeBytes: file.size, purpose: "oaca_import" } });
      await api.request("/api/oaca/imports", { method: "POST", body: { fileId: fileRecord.id, sourceSystem: datasetType === "penji_sessions" ? "penji" : "student_information_system", datasetType, cohortLabel, periodStartsOn: periodStartsOn || null, periodEndsOn: periodEndsOn || null, containsRealStudentData: true, sourceHeaders } });
      setMessage("Upload received. Compass will not map or read the file until its security scan is clean."); setFile(null); await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The import could not be created."); }
    finally { setBusy(false); }
  };

  const review = async (batchId: string, decision: "approve" | "reject") => {
    setBusy(true); setMessage("");
    try { await api.request("/api/oaca/imports/review", { method: "POST", body: { batchId, decision } }); setMessage(decision === "approve" ? "Import approved and queued for normalized processing." : "Import rejected. The original remains archived for the audit record."); await reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The review decision could not be recorded."); }
    finally { setBusy(false); }
  };

  return <section className="experience-panel"><button className="workspace-back text-button" onClick={onBack}>← Staff home</button><div className="section-heading"><div><p className="kicker">Secure data intake</p><h1>Bring OACA history into Compass.</h1></div><span className="status-chip status-chip--confirmed">Private and audited</span></div><p className="policy-intro">Begin with the Class of 2029 and Penji activity from August 2025. Uploads stay in private quarantine until scanning, mapping, validation, and review are complete.</p><div className="security-control-grid"><article><strong>Original preserved</strong><p>The uploaded file is private, immutable, and linked to an audit history.</p></article><article><strong>Identifiers separated</strong><p>External student keys become one-way hashes after account matching.</p></article><article><strong>Notes minimized</strong><p>Free-text notes are excluded from the analytics record by default.</p></article><article><strong>Two-person approval</strong><p>Real student data requires a second authorized reviewer before processing.</p></article></div><form className="experience-form import-form" onSubmit={submit}><h2>Start an import</h2><label><span>Dataset</span><select value={datasetType} onChange={(event) => setDatasetType(event.target.value as OacaImportDataset)}>{Object.entries(oacaImportDatasets).map(([key, dataset]) => <option key={key} value={key}>{dataset.label}</option>)}</select><small>{oacaImportDatasets[datasetType].description}</small></label><label><span>Cohort</span><input required value={cohortLabel} onChange={(event) => setCohortLabel(event.target.value)} /></label><div className="form-row"><label><span>Coverage starts</span><input type="date" value={periodStartsOn} onChange={(event) => setPeriodStartsOn(event.target.value)} /></label><label><span>Coverage ends</span><input type="date" value={periodEndsOn} onChange={(event) => setPeriodEndsOn(event.target.value)} /></label></div><label className="file-drop"><span>{file ? file.name : "Choose a CSV or XLSX file"}</span><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><label className="check-row"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} /><span>I removed patient information, private message bodies, and free-text notes that are not necessary for this import.</span></label><div className="workspace-actions"><button className="primary-button" disabled={busy}>{busy ? "Uploading…" : "Upload to private quarantine"}</button><a className="secondary-button" href="/resources/oaca-compass-data-import-template.xlsx" download>Download import template</a></div><p className="form-message" aria-live="polite">{message}</p></form><div className="record-list import-history"><h2>Import history</h2>{batches.map((batch) => <article key={batch.id}><div className="workspace-row"><div><span className={`status-chip status-chip--${batch.status.includes("completed") ? "confirmed" : batch.status === "rejected" || batch.status === "failed" ? "declined" : "pending"}`}>{batch.status.replaceAll("_", " ")}</span><h3>{oacaImportDatasets[batch.datasetType].label}</h3></div><small>{new Date(batch.createdAt).toLocaleString()}</small></div><p>{batch.cohortLabel || "Cohort not assigned"}{batch.periodStartsOn ? ` · from ${new Date(`${batch.periodStartsOn}T12:00:00`).toLocaleDateString()}` : ""}</p>{batch.status === "awaiting_scan" ? <p>Security scan pending. Mapping and review stay locked.</p> : null}{batch.status === "needs_mapping" ? <MappingEditor batch={batch} api={api} reload={reload} /> : null}{batch.status === "ready_for_review" ? <div className="review-card"><strong>Ready for independent review</strong><p>Confirm the mapping and data scope. The person who uploaded real student data cannot approve their own batch.</p><div className="workspace-actions"><button className="primary-button" disabled={busy || batch.requestedBy === context.userId} onClick={() => void review(batch.id, "approve")}>Approve and queue</button><button className="text-button" disabled={busy} onClick={() => void review(batch.id, "reject")}>Reject</button></div></div> : null}{batch.completedAt ? <dl><div><dt>Valid rows</dt><dd>{batch.validRows.toLocaleString()}</dd></div><div><dt>Needs correction</dt><dd>{batch.invalidRows.toLocaleString()}</dd></div><div><dt>Matched student rows</dt><dd>{batch.matchedStudents.toLocaleString()}</dd></div></dl> : null}{batch.issues.length ? <details><summary>{batch.issues.length} validation issue{batch.issues.length === 1 ? "" : "s"}</summary><ul>{batch.issues.slice(0, 20).map((issue) => <li key={issue.id}>Row {issue.rowNumber}: {issue.message}</li>)}</ul></details> : null}</article>)}{!batches.length ? <div className="empty-state"><h2>No imports yet</h2><p>Use the form above to establish the Class of 2029 baseline.</p></div> : null}</div></section>;
}

export function OacaAnalyticsPanel({ analytics, onBack }: { analytics: OacaAggregateAnalytics | null; onBack: () => void }) {
  const totals = analytics?.totals;
  return <section className="experience-panel">
    <button className="workspace-back text-button" onClick={onBack}>← Staff home</button>
    <p className="kicker">Scoped analytics</p>
    <h1>Understand demand without ranking students.</h1>
    <p className="policy-intro">The first baseline is the Class of 2029, whose OACA history begins in August 2025. Current-versus-prior-class comparisons will activate only when a second eligible cohort exists.</p>
    <div className="metric-grid">
      <article><strong>{totals?.sessions?.toLocaleString() ?? "—"}</strong><span>Imported sessions</span><small>{analytics?.coverageStart ? `Since ${new Date(analytics.coverageStart).toLocaleDateString()}` : "Awaiting approved data"}</small></article>
      <article><strong>{totals?.hours?.toLocaleString() ?? "—"}</strong><span>Student support hours</span><small>Normalized session duration</small></article>
      <article><strong>{totals?.averageWaitDays ?? "—"}</strong><span>Average wait (days)</span><small>When requested-at data exists</small></article>
      <article><strong>{totals?.completionRate == null ? "—" : `${totals.completionRate}%`}</strong><span>Completion rate</span><small>Completed or attended status</small></article>
      <article><strong>{totals?.noShowRate == null ? "—" : `${totals.noShowRate}%`}</strong><span>No-show rate</span><small>Based on imported status</small></article>
      <article><strong>{totals?.rescheduleRate == null ? "—" : `${totals.rescheduleRate}%`}</strong><span>Reschedule rate</span><small>When Penji supplies reschedule history</small></article>
    </div>
    <div className="record-list analytics-cohorts"><h2>Cohort view</h2>
      {analytics?.cohorts?.map((cohort) => <article key={cohort.cohortLabel}><div className="workspace-row"><h3>{cohort.cohortLabel}</h3><span>{cohort.studentCount} students</span></div>{cohort.suppressed ? <p>Values suppressed because this group has fewer than {analytics.minimumGroupSize || 10} students.</p> : <dl><div><dt>Sessions</dt><dd>{cohort.sessions?.toLocaleString()}</dd></div><div><dt>Hours</dt><dd>{cohort.hours?.toLocaleString()}</dd></div><div><dt>No-show rate</dt><dd>{cohort.noShowRate == null ? "—" : `${cohort.noShowRate}%`}</dd></div></dl>}</article>)}
      {!analytics?.cohorts?.length ? <div className="empty-state"><h2>No approved history yet</h2><p>Metrics appear after a scanned, mapped, reviewed import completes.</p></div> : null}
    </div>
    <div className="privacy-note-card"><strong>Minimum reporting group: {analytics?.minimumGroupSize || 10} students</strong><p>Small cells are suppressed. Students are never ranked against identifiable peers.</p></div>
  </section>;
}
