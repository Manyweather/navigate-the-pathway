# Compass Supabase SSO runbook

This runbook covers application SSO for the Compass staff pilot. It does not configure single sign-on for the Supabase administrative dashboard.

## Confirmed values

- Supabase project reference: `dfbytiqdufhtlhowumxa`
- Staff email domain: `roseman.edu`
- Service-provider Entity ID and metadata URL: `https://dfbytiqdufhtlhowumxa.supabase.co/auth/v1/sso/saml/metadata`
- Assertion Consumer Service (ACS) / Reply URL: `https://dfbytiqdufhtlhowumxa.supabase.co/auth/v1/sso/saml/acs`
- Single Logout URL advertised by Supabase: `https://dfbytiqdufhtlhowumxa.supabase.co/auth/v1/sso/saml/slo`
- Identity-provider metadata received from Roseman IT: `Compass - Med OACA Application.xml`
- Microsoft Entra tenant ID in the supplied metadata: `f9c6cbda-c9d9-4bef-bbb8-eddf74834e6e`
- Static signing certificate validity: September 17, 2026 at 18:41:08 UTC through September 17, 2029 at 18:41:08 UTC
- Required NameID format: email address or persistent ID

The public service-provider metadata endpoint currently returns `saml_provider_disabled`. This is expected until SAML is enabled in Supabase Authentication > Providers. Supabase project SAML requires a Pro plan or above.

## Ownership and credentials

Use a personal Gmail account only as a temporary Supabase project administrator when Roseman policy permits. Before pilot activation, add an institution-owned project owner or administrator and document a separate break-glass account.

Never place a Supabase access token, database password, Gmail password, Roseman password, Entra password, MFA code, SMTP password, or service-role key in this repository, a support ticket, or a Codex prompt. Authenticate the CLI interactively or set `SUPABASE_ACCESS_TOKEN` only in the local process environment. The repository ignores `.env*`, `.dev.vars*`, and Supabase's local `.temp` directory.

Supabase project administration and Compass authorization are separate. Administrative access to Supabase does not grant access to Compass. Compass staff access requires both a successful Roseman SAML login and an active entry in the approved Compass roster.

Record these ownership fields before upgrading or inviting staff. Do not leave any field assigned only to a personal account:

| Responsibility | Named owner | Backup owner | Review date |
|---|---|---|---|
| Pro billing and renewal | Pending | Pending | Before purchase |
| Spend cap and overage review | Pending | Pending | Before purchase |
| Institution-owned Supabase administration | Pending | Pending | Before pilot |
| Roseman Entra enterprise application | Pending | Pending | Before pilot |
| Compass release and rollback | Pending | Pending | Before pilot |

## One-time setup

1. Sign in to the Supabase dashboard with an account that has write access to the Compass project.
2. Confirm the project is on Pro or above and record the institutional billing owner.
3. Add an institution-owned Supabase owner or administrator.
4. In Authentication > Providers, enable SAML 2.0 support.
5. From this repository, authenticate the installed CLI without pasting credentials into chat:

   ```powershell
   pnpm exec supabase login
   ```

6. Verify current SSO state:

   ```powershell
   pnpm exec supabase sso info --project-ref dfbytiqdufhtlhowumxa
   ```

7. Prefer Roseman's tenant federation-metadata URL when IT supplies it. Until then, register the reviewed XML file:

   ```powershell
   pnpm exec supabase sso add --type saml `
     --project-ref dfbytiqdufhtlhowumxa `
     --metadata-file "C:\Users\bmanyweather\Downloads\Compass - Med OACA Application.xml" `
     --domains roseman.edu
   ```

8. Capture the returned provider ID and verify the connection without changing it:

   ```powershell
   pnpm exec supabase sso info --project-ref dfbytiqdufhtlhowumxa
   ```

9. If IT supplies a federation-metadata URL, update the provider to use the URL so certificate rotation does not depend on replacing a local XML file. Review `pnpm exec supabase sso update --help` before applying the update.
10. Apply database migration `202609230006_staff_saml_access.sql` and deploy the reviewed application and pilot API together.
11. Store the returned provider UUID as the protected `ROSEMAN_SSO_PROVIDER_ID` Worker secret. Store the linked Gmail address as `BREAK_GLASS_CREATOR_EMAIL`. Set neither value in source control.
12. Add these exact allowed redirect URLs in Supabase Auth URL Configuration for every enabled environment:
    - `https://<compass-host>/app/auth/callback`
    - `https://<compass-host>/app/creator-recovery`

The application preserves callback parameters at `/app/auth/callback` until Supabase establishes the session. A callback clears saved demo state before routing. The normal staff entry exposes only Roseman Microsoft SSO. `/app/creator-recovery` is unindexed and reserved for the configured Gmail identity.

## Roster approval and Creator transition

An authenticated Roseman user without a Compass profile appears in Creator Controls as pending and receives no workspace data. Add one approved roster row with the exact `roseman.edu` email, role, and workspace assignments, then approve the single exact match. Missing or ambiguous matches remain denied.

Move the Creator identity in this order:

1. Keep the existing Gmail Creator session open with Supabase TOTP at AAL2.
2. Sign in once in a separate browser profile with the Roseman SAML identity so it appears in the pending queue.
3. Add the Roseman email to the approved roster with the Creator transition role and approve the exact match.
4. In Sign-in identities, preview a merge with the Roseman account as primary and Gmail as secondary.
5. Confirm the merge manifest, backup reference, protected authorship, audit history, appointments, tickets, exports, and release history.
6. Execute the reviewed merge. Verify both sign-ins resolve to the Roseman canonical user ID and exactly one active `platform.creator` permission remains.
7. Verify Gmail is accepted only through `/app/creator-recovery` and is denied at AAL1 until Supabase TOTP reaches AAL2.
8. Remove `CREATOR_BOOTSTRAP_EMAIL` only after the permanent permission and both recovery paths are verified.

The application deliberately does not use Supabase automatic identity linking for the SAML account. The audited `account_auth_identities` mapping remains authoritative.

## MFA policy finding

For this staff pilot, Compass treats only the exact provider UUID in `ROSEMAN_SSO_PROVIDER_ID` with JWT method `sso/saml` as satisfying the staff MFA gate. Another SAML provider, a matching email domain, password, or magic link does not qualify. Gmail recovery must reach Supabase `aal2` with TOTP.

This is an accepted pilot assumption while Roseman Conditional Access confirmation remains open. Record the confirmation as an operational finding and revisit this setting when IT provides the applicable MFA policy. The same exact-provider rule is enforced by the API and the database `staff_mfa_verified()` function.

## Entra configuration requested from IT

IT should configure the Compass enterprise application with the Entity ID and ACS URL above and confirm:

- Assignment is required.
- The pilot staff group is subject to Roseman Conditional Access and MFA.
- NameID is an email address or persistent identifier.
- Claims include verified email, display name, and preferably the Microsoft Entra object ID.
- A tenant federation-metadata URL is available for certificate rotation.

Do not infer Compass permissions from Entra group names or SAML attributes during this pilot. The server-side Compass roster and role matrix remain authoritative.

## Activation test

Keep staff invitations disabled until all three cases pass in the pilot environment:

1. An assigned Creator account can sign in and receives only Creator-authorized workspaces.
2. An assigned ordinary staff account can sign in and receives only its roster-defined dashboards and student-view scope.
3. An unassigned Roseman account is denied Compass access even if Entra authenticates it successfully.

Record the provider ID, tester identities, date, observed result, and reviewer. Do not copy SAML assertions or tokens into the test record.

Also test a saved Impact preview followed by both a SAML callback and a recovery callback. Each callback must clear the preview, establish the intended session, remove callback parameters only after success, and route according to server-issued membership. Exercise expired and reused links, missing parameters, offline behavior, the 15-second timeout, Retry, and Return to sign-in.

## Email delivery

The Supabase built-in Auth sender is a testing service. It currently permits two Auth emails per hour per project and sends only to project-team addresses. That limit can explain the observed delivery pattern even when Roseman filtering is not involved.

IT should still run Microsoft 365 message tracing and check quarantine before allowlisting anything. DNS changes are not needed to receive Supabase messages. SPF, DKIM, and DMARC become relevant when Compass uses a Roseman-owned From address through an approved custom SMTP provider.

Before the staff pilot, select an institution-approved transactional email service, configure custom SMTP, restrict pilot delivery to approved staff/test addresses, and test retries, duplicate suppression, and delivery status. Do not use the built-in sender for pilot notifications.

## Rollback

If SSO testing fails, disable the SAML provider in Supabase, restore the prior reviewed application and Worker versions, retain the provider ID and failure record, and keep the Gmail break-glass identity available with TOTP. Do not remove roster checks or enable general password access. Coordinate provider removal or replacement with IT because an incorrect provider or domain mapping can block every staff sign-in.
