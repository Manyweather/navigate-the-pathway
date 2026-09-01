<p align="center">
  <img src="public/og.png" alt="Navigate the Pathway through a Southwestern landscape" width="100%" />
</p>

<h1 align="center">Navigate the Pathway</h1>

<p align="center">
  A phone-first, media-first learning experience for premedical juniors and seniors.
</p>

<p align="center">
  <a href="https://manyweather.github.io/navigate-the-pathway/"><strong>Open the live prototype</strong></a>
  &nbsp;|&nbsp;
  <a href="docs/spec/PRODUCT_AND_SOFTWARE_SPECIFICATION.md">Read the product specification</a>
</p>

<p align="center">
  <a href="https://github.com/Manyweather/navigate-the-pathway/actions/workflows/ci.yml"><img src="https://github.com/Manyweather/navigate-the-pathway/actions/workflows/ci.yml/badge.svg?branch=main" alt="Prototype checks" /></a>
  <img src="https://img.shields.io/badge/status-public%20demo%20%2B%20production%20pilot%20foundation-7B1837" alt="Public demonstration and production pilot foundation" />
  <img src="https://img.shields.io/badge/license-pending%20Roseman%20approval-C69214" alt="License pending Roseman University approval" />
</p>

## What students experience

Students begin with a brief adaptive setup, explore a visual district, complete short missions, save application-ready evidence, and return to a map that reflects their progress. Rosie the Roadrunner offers guidance without turning the experience into a points competition.

| Explore | Practice | Prepare |
| --- | --- | --- |
| Six open stations, a pilot checklist, and eight recommended starting routes | Visual stations, tap-through diagrams, attendance practice, survey shells, and reflection prompts | Portfolio documents, Story Studio, advising packets, and application-note export |
| Phone-first map, four-destination dock, and quick capture | Low-pressure cohort participation and support mapping | Student-selected sharing with expiration and revocation controls |

## The six-station district

- **Course Camp:** courses, questions, follow-up plans, and study strategies
- **Experience Vault:** quick capture, detailed experiences, hours, moments, and revisions
- **Compassion Commons:** service, context, barriers, compassionate responses, and reflection
- **Cohort Commons:** community participation and support-network building
- **Reflection Studio:** reflection, story building, and evidence development
- **Application Outlook:** advising preparation, Portfolio review, and application export

Every station stays available. Recommendations identify a useful next destination without points, rankings, streak pressure, or locked content.

## Media-first design

- Short screens with one clear action
- Rosie poses for welcome, privacy, recommendations, saved work, and returning moments
- [Rosie speech and HeyGen script review](docs/content/ROSIE_SPEECH_HEYGEN_REVIEW.md) for narration approval before voice production
- Muted autoplay-once media with captions, transcript, replay, skip, and poster fallbacks
- Touch, mouse, and keyboard support across phone, tablet, and desktop layouts
- Reduced-motion behavior and accessibility text for visual content

## Two deliberately separate releases

The GitHub Pages site remains a fictional, browser-local demonstration. The new invite-only application lives at `/app` in the server build and is backed by a separate Cloudflare Worker API plus Supabase Auth, Postgres, and Storage. The authenticated pilot is not part of the static GitHub Pages bundle.

The production foundation now includes Student, Advisor, and Administrator dashboards; organization, program, cohort, and advisor-assignment scopes; staff MFA enforcement; Sessions and Attendance; private Portfolio records; student-controlled advising packets; administrator-defined survey waves; and an isolated evaluation schema. See [the production runbook](docs/production/README.md).

## Demonstration boundaries

This is a fictional, browser-local product demonstration. It is not an admissions portal or admissions decision tool.

- Student-created entries stay on the current device.
- Route recommendations never use GPA, MCAT, demographics, personality labels, or message volume.
- Reviewer views use fictional records and expose only active, student-selected packet items.
- No real accounts, Supabase records, email, analytics, or external message delivery are active in the GitHub Pages demonstration.
- No real student, patient, research-participant, admissions, or advising records should be entered.

The GitHub Pages prototype uses a shared playtest access gate backed by a Cloudflare Worker. Access-code comparison and session signing happen at the edge, and secrets are never stored in GitHub or the browser bundle. The static application files remain public, so this is a playtest gate rather than institutional authentication.

## Architecture at a glance

```mermaid
flowchart LR
    A[Adaptive setup] --> B[Recommended route]
    B --> C[Six-station district]
    C --> D[Visual mission]
    D --> E[Saved artifact]
    E --> F[Portfolio and advising]
    E --> C
```

The public prototype uses the versioned browser-local state key `navigate.pathway.demo.v2`, with one-time recovery from the earlier unified, donor, and media-first formats. The production pilot never imports those fictional records. Its deployable Supabase migration is under [`supabase/migrations/`](supabase/migrations/).

The earlier Sites deployment remains available as a rollback while GitHub Pages is the primary student-facing address.

## Local development

Requirements: Node 22.13 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

For local access-gate testing, create an ignored `.env.local` containing `NAVIGATE_ACCESS_CODE` and a separate high-entropy `NAVIGATE_SESSION_SECRET`. Never commit real playtest credentials.

Run the verification suite with:

```bash
pnpm lint
pnpm test
```

## Repository guide

- [`app/journey-experience.tsx`](app/journey-experience.tsx): media-first student district and missions
- [`app/components/feature-workspaces.tsx`](app/components/feature-workspaces.tsx): station routing and reviewer views
- [`app/components/pilot-workspaces.tsx`](app/components/pilot-workspaces.tsx): attendance, survey, curriculum, course-snapshot, Portfolio, advisor, and admin pilot workflows
- [`app/curriculum-data.ts`](app/curriculum-data.ts): transcribed 2025-2026 curriculum references and review annotations
- [`app/prototype-store.tsx`](app/prototype-store.tsx): state, persistence, and legacy migrations
- [`app/access-session.ts`](app/access-session.ts): constant-time code comparison and signed session cookies
- [`app/production/`](app/production/): invite-only role dashboards, Supabase session handling, staff MFA, and authenticated survey workspace
- [`cloudflare/pilot-api.ts`](cloudflare/pilot-api.ts): production pilot API boundary and evaluation access audit logging
- [`supabase/migrations/`](supabase/migrations/): production schema, RLS, evaluation isolation, and server functions
- [`docs/production/README.md`](docs/production/README.md): environment, deployment, approval, and launch runbook
- [`docs/spec/`](docs/spec/): product, playtest, architecture, and v0.2 handoff specifications
- [`docs/content/AAMC_2027_ORGANIZATION_GUIDANCE.md`](docs/content/AAMC_2027_ORGANIZATION_GUIDANCE.md): coursework and experience organization mapped from the 2027 AMCAS guide
- [`docs/architecture/supabase-schema.sql`](docs/architecture/supabase-schema.sql): dormant production architecture reference
- [`docs/architecture/PILOT_DEMO_ARCHITECTURE.md`](docs/architecture/PILOT_DEMO_ARCHITECTURE.md): current safety boundary, migration, production gaps, and unresolved decisions

The preserved media-first visual baseline is tagged [`frontend-media-v4`](https://github.com/Manyweather/navigate-the-pathway/releases/tag/frontend-media-v4).

## Licensing

No open-source license is included. Roseman University must approve a licensing position before one is added.
