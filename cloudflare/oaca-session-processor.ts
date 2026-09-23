import { normalizeSessionCsv, parseImportCsv } from "../app/production/oaca-session-import";
import type { OacaImportMapping } from "../app/production/oaca-import-model";

type Job = { id: string; job_id: string; file_id: string; dataset_type: string; import_timezone: string; narrative_processing: boolean; column_mapping: OacaImportMapping; cohort_label: string | null };
export type SessionImportServices = { rest<T>(path: string, options?: RequestInit): Promise<T>; readFile(path: string): Promise<string> };

export async function processSessionImport(services: SessionImportServices) {
  const job = await services.rest<Job | null>("rpc/oaca_claim_session_import", { method: "POST", body: "{}" });
  if (!job) return;
  try {
    const files = await services.rest<Array<{ storage_path: string; scan_status: string; original_name: string; size_bytes: number }>>(`platform_files?id=eq.${job.file_id}&select=storage_path,scan_status,original_name,size_bytes`);
    const file = files[0];
    if (!file || file.scan_status !== "clean") throw new Error("security_scan_incomplete");
    if (!file.original_name.toLowerCase().endsWith(".csv") || file.size_bytes > 25 * 1024 * 1024) throw new Error("unsupported_file");
    const text = await services.readFile(file.storage_path);
    let rows: unknown[];
    try {
      if (job.dataset_type === "penji_sessions") rows = normalizeSessionCsv(text, { timezone: job.import_timezone, narrativeProcessing: job.narrative_processing, columnMapping: job.column_mapping, cohortLabel: job.cohort_label }).sessions;
      else rows = parseImportCsv(text).rows.map((row) => Object.fromEntries(Object.entries(job.column_mapping).filter(([, source]) => source).map(([key, source]) => [key, row[source!] || ""])));
    } catch { throw new Error("invalid_csv"); }
    await services.rest("rpc/oaca_process_import_batch", { method: "POST", body: JSON.stringify({ batch_id: job.id, normalized_rows: rows, processor_version: "compass-session-import-v2" }) });
  } catch (error) {
    const known = ["security_scan_incomplete", "unsupported_file", "invalid_csv"];
    const code = error instanceof Error && known.includes(error.message) ? error.message : "import_failed";
    await services.rest("rpc/oaca_fail_session_import", { method: "POST", body: JSON.stringify({ job_id: job.job_id, error_code: code }) });
  }
}

/** Enforce the byte cap even if storage metadata is stale or Content-Length is absent. */
export async function boundedCsvText(response: Response, maximum = 25 * 1024 * 1024) {
  if (!response.ok || !response.body) throw new Error("private_file_unavailable");
  const reader = response.body.getReader(); const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0; let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > maximum) { await reader.cancel(); throw new Error("unsupported_file"); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
