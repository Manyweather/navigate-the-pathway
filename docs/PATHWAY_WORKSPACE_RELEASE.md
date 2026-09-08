# Pathway workspace release

This release extends the existing Supabase pilot, its Cloudflare API, and the current Sites frontend. It adds shared navigation with in-memory draft preservation, scoped access management, student page analytics, roster imports, manual support reviews, appointment acceptance and rescheduling, portal notifications, participant-only appointment chats, and a separate restricted DM inbox.

## Account and data operations

The deployed project had the original pilot schema but no Supabase migration ledger. Its schema and account records were inspected before additive changes. A snapshot of all 46 application/evaluation tables and their function definitions was exported; all 68 records were restored and compared exactly in isolated PostgreSQL. The private backup and verification manifest are stored outside the repository. Authentication users, their credentials, and storage objects are not deleted by the merge.

The requested primary/secondary accounts were resolved by their actual authentication IDs. The merge preview checked every authentication relationship, duplicate survey assignments and pilot survey artifacts, lifecycle holds, role conflicts, ambiguous ownership, and duplicate private conversations/calendar connections. The authorized merge completed, and both identities resolve to the same primary profile with their combined roles. Historical authorship remains attached to its original identity. The archived secondary profile is retained for provenance.

Migrations `202609010003` and `202609080001` through `202609080006` are additive and recorded in the new ledger. Earlier baseline migrations must not be replayed blindly: inspect the existing schema and reconcile their history first.

## Operating the workspaces

- Creator and PI use **Access controls** to select a person, role or permission, and scope. Their role selector contains assigned roles. Principal ownership uses the existing governance workflow; general access controls cannot remove the last Creator or change one's own access.
- **Roster import** downloads CSV or Excel templates. Upload, validate, preview, then commit. Rows distinguish existing users, new users, errors, and successful imports. Failed rows can be retried; invalid rows require correction and a new preview. Account invitations are a separate explicit action and do not run during import. Existing independent secondary accounts require the explicit merge workflow.
- **Page views** shows totals, unique students, and visit history. The trusted Cloudflare edge supplies the full IP address. Page events exclude page content, answers, messages, and query strings. Retried event IDs deduplicate. The scheduled maintenance job clears IP values after 30 days; report responses also hide expired IP values before cleanup runs.
- **Support** uses student-selected goals, barriers, deadlines, and an optional existing shared advising packet. Staff write evidence-linked support actions and record review/follow-up status. Students see only reviewed, explicitly shared actions. Source revocation/expiry removes derived access on subsequent reads.
- **Appointments** requires the other participant's acceptance. Reschedule proposals preserve the confirmed booking until renewed acceptance. Database locks prevent overlapping portal bookings; connected provider availability is checked before acceptance. Dates are stored in UTC with a selected time zone. Ambiguous or nonexistent local DST times require choosing another time.
- **Messages** separates appointment chats from DMs. Appointment acceptance creates its thread; cancellation makes it read-only. Reads/writes recheck current participant and scope permissions. Two student accounts cannot DM even when either has other roles. Creator ownership does not grant access to private conversation contents. Messages have pagination, unread state, reporting, and send limits.

## Calendar configuration

The Google and Microsoft buttons display **Not configured** until their application credentials are available. Configure these Worker secrets through the deployment environment:

| Secret | Purpose |
| --- | --- |
| `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` | Google OAuth application |
| `MICROSOFT_CALENDAR_CLIENT_ID` / `MICROSOFT_CALENDAR_CLIENT_SECRET` | Microsoft identity application |
| `CALENDAR_ENCRYPTION_KEY` | Random 32-byte base64url key for AES-GCM credentials |
| `CALENDAR_CALLBACK_URL` | Exact HTTPS API origin plus `/api/calendar/callback` |
| `ALLOWED_ORIGINS` | Existing permitted portal origin(s) |

Register the exact callback URL with both providers. The public notification endpoint is `/api/calendar/webhook`. Users select availability calendars and a writable destination. Confirmed appointments and published sessions synchronize; provider edits do not accept portal rescheduling. Provider event mappings, stable event identifiers, encrypted refresh credentials, authenticated notifications, subscription renewal, and periodic reconciliation support retries and missed provider notifications. Disconnect removes stored credentials. Apple Calendar is supported by connecting the user's Google/Outlook calendar or importing the portal's ICS file. Direct iCloud integration is deferred.

Google/Microsoft OAuth and provider writes still require a live credentialed acceptance test before enabling those integrations. No credentials were invented, and no external calendar was connected during release verification.

## Deliberately disabled

AI generation returns **Not configured**. No AI model or generated forecasts are used. Appointment email templates and suppressed delivery records are prepared, with no sender running. The delivery eligibility helper requires an activation timestamp and rejects suppressed or pre-activation jobs, preventing historical replay when email is introduced. Existing explicit authentication invitations remain available.

Cheryl's specific designation and Discord linking remain deferred. There is no Discord button, voice/video calling, or Discord message synchronization in this release.

## Verification

The build, public-demo build, lint, TypeScript check, and Worker dry run passed. The automated suite covers CSV/Excel round trips, DST gaps/ambiguity, OAuth-state rejection, webhook authentication and deduplication, encryption, disabled AI/email, database authorization and MFA, booking conflicts and rescheduling, private chats, support revocation, IP cleanup, roster retry, account-merge conflicts, immutable authorship, file ownership, and rollback after injected failure.

The live fictional staging smoke test exercised booking, acceptance, participant chat, Creator chat denial, support sharing/revocation, page deduplication, and suppressed email. Its entire transaction was rolled back. Browser checks verified appointment draft preservation through Back and the disabled service states. Existing lint warnings concern image guidance and hook dependency analysis; there are no lint errors.

Use `supabase/tests/pathway_workspace_smoke.sql` for the rollback-only database smoke test. Keep backup snapshots, identity details, credentials, and restore manifests outside source control. Check scheduled job failures and `last_synced_at` during provider rollout. Do not expose page analytics or research data to AI inputs.

## Dashboard refinement (September 8, 2026)

Creator and PI now have explicit dashboard modes. The active mode narrows visible controls and the API's route access; workspace and survey database functions also enforce the selected mode. Shared Notifications, Calendar, Appointments, Messages, and Support tools are in the header. Administrative tools use a dropdown. The role explanation appears on login and role changes, with a manual review button.

Student survey lists exclude advisor instruments, including ACCS and the advisor MacLeod Clark assignment. Distinct survey waves remain separate. Submission timestamps are shown wherever available. The pathway action is labeled “Update my journey.”

Account Lifecycle supports manual profile creation by Creator/PI with MFA and account-management permission. Creation is retry-safe and creates student enrollment when applicable. It does not send email; invitation delivery remains an explicit subsequent action. Existing emails never merge through account creation or the add-email form. Merge preview retains conflict and backup checks. Error messages explain duplicate emails, archived profiles, missing scope/MFA, and merge conflicts.

Operational directories count canonical profiles and aggregate their linked sign-in identities and historical activity. Merged archived profiles do not count as separate students. Migration `202609080007` was applied after checking the deployed ledger. The complete suite passed 91 tests, including database audience/role restrictions, manual creation and repeat safety, and canonical student counts.
