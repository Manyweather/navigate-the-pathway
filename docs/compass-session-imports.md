# Compass session imports

The import center accepts Penji session CSVs and normalized session CSVs. It provides a browser-local preview, private upload, scanned server preview, reviewed processing, and separate Demo/Live insights. This implementation does not call an external AI service or train a model.

## Activate

Apply `202609170001_oaca_session_themes.sql` and `202609170002_oaca_theme_analytics.sql` in migration order, then release the application and pilot API together. No deployment is performed by the implementation task. Keep the existing private-file scanner and scheduled Worker configured; files cannot progress without a clean scan. The scheduled handler processes one queued session or roster batch per invocation, independently of other scheduled tasks.

Existing imports default to Live and retain their original note-exclusion behavior. Existing unmatched historical records without a stable student key do not count as distinct students for minimum-group checks. New imports use account identity when resolved, otherwise a stable external-key hash. Demo records never resolve accounts, create student profiles, or trigger communications.

## Parsing and semantics

- Defaults: Demo selected in the new UI; the server defaults unspecified mode to Live. Timezone defaults to America/Los_Angeles; narrative coding is an explicit saved selection.
- Required fields: session identifier, student identifier, scheduled start, service, status, and either duration or end. Split Penji dates/times are resolved in the saved IANA timezone. Invalid dates and ambiguous/nonexistent DST times require correction.
- `Scheduled Length` and `Tutor Submitted Length` are decimal hours and become separate decimal-minute values. End/start times never determine attendance. Missing attendance remains unknown. Contradictions are warnings.
- CSV quoting, escaped quotes, multiline cells, BOMs, duplicate headers, and column counts are handled explicitly. Duplicate headings receive positional names rather than overwriting values. Use CSV for this processor; export XLSX sheets to CSV first.
- A batch retains row-numbered warnings and errors. Rejected rows do not enter analytics. Reimports count duplicates separately and do not replace previously reviewed themes or narratives.
- Date filters and month groups use America/Los_Angeles. Booking lead-time averages exclude bookings recorded after session start. Support hours represent scheduled duration, not delivered time. Absence rates use recorded Present/Absent attendance.

## Coded themes

`oaca-theme-rules.ts` owns the versioned rules and the generic fictional narrative templates. Nine multi-label topics cover study strategies, exams, time management, academic planning, wellbeing, study environment, resources/tutoring, careers, and follow-up. Matching uses phrase boundaries and clause-local explicit negation. It is conservative topic coding, not a semantic or clinical assessment. Unknown text stays uncategorized, and non-substantive notes stay missing.

Automatic matches retain rule IDs and source fields. Reviewer corrections override the effective theme list while retaining original matches and notes. Corrections are audited. Blank follow-up documentation never means a concern was resolved. No messages or tasks are automatically sent from theme matches.

Real narratives require MFA and an active advisor assignment to the student. Import capability alone does not grant real narrative access. Demo narratives require import-management access. PostgreSQL RLS and checked RPCs enforce this distinction; raw narratives do not enter aggregate results or application logs. The original-file retention policy is unchanged.

## Interfaces

Import metadata adds `datasetMode`, `timezone`, `narrativeProcessing`, and the server-owned rule version. The existing mapping/review routes remain, with mapping locked after approval. New routes provide scanned previews, failed-batch retries, authorized narrative lists/reads, and category corrections. `/api/oaca/analytics` accepts `datasetMode`, `from`, and `to` and returns totals, cohorts, services, months, themes, monthly themes, and repeat-visitor themes. Small groups are suppressed at 10 distinct students. Legacy API responses without mode separation are not presented as mode-filtered results.

Jobs use atomic claims, expiring leases, three automatic attempts, bounded backoff, and safe error codes. Import managers can retry an exhausted, reviewed, clean batch. Storage reads enforce a 25 MB byte limit regardless of Content-Length. The source-file scan is checked again before processing.

## Verification

The full application build and test command is `pnpm test`. Focused tests cover CSV parsing, DST, units, negation, missing values, scan gates, demo/live isolation, idempotency, access restrictions, corrections, and retries. Set `COMPASS_DEMO_CSV` to the generated file to include the 381-row queued-processing and aggregate-reconciliation test.

The local browser test uses an isolated fixture with no production connections. It checks the generated CSV preview, approval-to-insights transition, mode switching, and layout. Four existing TypeScript errors remain in advisor availability and workspace-switcher types; no new TypeScript errors were reported for this feature.
