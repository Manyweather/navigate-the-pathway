# Shared event coordination deployment status

Updated September 29, 2026.

## Applied staging changes

- Supabase project: `dfbytiqdufhtlhowumxa` (`navigate-pathway-staging`).
- Applied migration: `202609280001_shared_event_coordination.sql`.
- A subsequent linked database dry run reported the remote database up to date with no pending migrations.
- Deployed API: `navigate-pathway-pilot-api-staging`.
- Worker version: `e88abc55-d98d-4d94-bb06-7f6040429eea`.
- API origin: `https://navigate-pathway-pilot-api-staging.bmanyweather.workers.dev`.
- Signed-out GET requests to `/api/shared-events/workspace` and `/api/shared-events/report` both returned HTTP 401 with `authentication_required`, without event data.

## Validation already completed

- Production builds and full test suite: 202 passed, one skipped.
- Full lint: no errors; 39 existing warnings.
- Focused shared-event tests: six passed after the final DOCX relationship change.
- Local browser walkthroughs covered the Impact student calendar/request boundaries and OACA staff coordination/calendar overlay.
- DOCX package structure was checked; visual Word rendering remains unverified because LibreOffice is unavailable on this host.

## Publication and remaining verification

- Newer Compass Site `appgprj_6ab6df5a438c8191a2d0258749b2a4ac`: the current Sites connection returns `Sites project not found`. Restore the OACA connection or editor access before publishing the interface.
- Legacy Site `appgprj_6a738599e3d88191a3d7a98ab21993c7`: previously verified accessible at version 65; no new interface publication was made in this deployment step. Preserve its existing redirect behavior.
- The bundled Sites workflow script is now present locally; its previous absence is no longer the blocker.
- Complete authenticated staff walkthroughs and public demo checks after interface publication. Anonymous API checks do not establish successful authenticated workflows.
- Preserve and review the existing uncommitted access/Facilities changes with shared-event changes when preparing the final source version.

This update targets the staff staging environment with fictional student records. It does not establish real-student production readiness.
