# Navigate the Pathway Production Pilot

This directory describes the invite-only application. It is separate from the fictional GitHub Pages demonstration and does not import browser-local prototype records.

## Implemented foundation

- Supabase invitation accounts with verified email
- Role assignments scoped to organization, program, and cohort
- Student, Advisor, and Administrator dashboards
- A staging-only account fixture that can hold all three roles
- MFA assurance-level enforcement for Advisor and Administrator API access
- Advisor access limited to assigned students
- Student-controlled advising packets with expiration and revocation boundaries
- Sessions, attendance, corrections, and audit history
- Administrator-defined survey waves with no hardcoded pre/post schedule
- Protected survey drafts, atomic submission, immutable submitted response sets, and revision tables
- A separate non-public `evaluation` schema for instrument content, consent, responses, scoring definitions, and approved scores
- A normal-schema completion projection containing no answers or scores
- The `evaluation.identifiable_results` capability with staff MFA and audit logging

## Required environments

### Supabase

Create separate staging and production projects. Apply the checked-in migrations to staging first. Set the single locked `public.pilot_runtime_config` row to `staging` only in staging and leave it as `production` in production.

Enable email invitations. Require verified email. Configure the application URL as an allowed redirect. Staff enroll a TOTP factor at first access; the API rejects Advisor and Administrator requests unless the access token has `aal2`.

Create a private Storage bucket for Portfolio files. Storage policies must use the same student-owner, active packet, assigned advisor, organization, and program boundaries as the database. Do not make a Portfolio bucket public.

### Cloudflare Worker API

Configuration: `cloudflare/wrangler.pilot.jsonc`

Required Worker secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS`
- `INVITE_REDIRECT_URL`

Set secrets independently for `staging` and `production`. Never put their values in source, Wrangler configuration, build logs, documentation, or client-side variables.

The service-role key is used only for Supabase Auth invitation creation. Application data requests use the signed-in user token so RLS and security-definer authorization functions remain authoritative.

### Application build

The `/app` client requires these public build variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PILOT_API_URL`

The Supabase anon key is designed for browser use and provides no authorization by itself. RLS, scoped role assignments, MFA, and server functions protect records.

## Instrument release workflow

The repository contains instrument names, audiences, and item counts only. It does not contain copyrighted prompts, response options, consent wording, or scoring keys.

Before an instrument version can move to `approved`, an authorized data owner must load its protected content and document:

1. wording and version provenance;
2. permission or reuse authority;
3. expected item and open-response counts;
4. approved consent and withdrawal rules;
5. PI confirmation for wording conflicts;
6. scoring-owner approval if a calculation is used;
7. accessibility and security review.

The MacLeod Clark version remains blocked until the PI resolves the grant wording conflict. Short Grit remains blocked until the intended reuse and distribution comply with its restrictions.

Students and advisors receive completion status only. Survey answers, calculations, readiness labels, percentiles, and response summaries are not returned to their dashboards. Survey data is never used by route recommendations, advising recommendations, attendance, application preparation, community features, or routine analytics.

## Staging tri-role fixture

1. Invite a fictional staging account normally.
2. Sign in as an existing staging Administrator with MFA.
3. Call `configure_staging_tri_role_fixture(target_user_id)` for the fictional user UUID.

The function refuses to run unless `app.pilot_environment` is `staging`. Do not configure or call it in production.

## Deployment order

1. Complete the approval checklist below.
2. Create staging Supabase and apply the migration.
3. Configure staging Worker secrets.
4. Run `pnpm pilot-api:check`.
5. Deploy with `pnpm pilot-api:deploy:staging`.
6. Configure the server application build variables and deploy `/app`.
7. Create fictional users and run role, RLS, MFA, cross-scope, autosave, submission, accessibility, and recovery tests.
8. Repeat backup restore and security review.
9. Create the production Supabase project, then repeat the deployment without the staging fixture.
10. Invite a limited real cohort only after written approval.

## Approval gates before real invitations

- written instrument permissions and scoring ownership;
- finalized consent and withdrawal rules;
- IRB and privacy determination;
- named operational and evaluation data owners;
- retention, deletion, and incident-response policy;
- security review and RLS denial evidence;
- backup recovery test;
- accessibility review;
- PI resolution of the MacLeod Clark wording conflict.

No full or partial Social Security number belongs anywhere in this application. Authenticated user UUIDs provide participant linkage.
