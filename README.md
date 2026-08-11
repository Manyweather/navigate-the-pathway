# Navigate the Pathway

Navigate the Pathway is a phone-first, media-first concept prototype for premedical juniors and seniors. It helps students capture experience evidence, reflect on learning, test study strategies, map support, participate in a cohort, and prepare selected work for advising and application drafting.

This repository is public. The hosted demonstration uses a shared playtest gate, but every included record is fictional and every student-created entry stays in the current browser.

## Implemented demonstration behavior

- Six open map stations with visual missions, tap-through diagrams, station stamps, and a four-destination dock
- Rosie the Roadrunner as the reusable guide for welcome, privacy, recommendations, saved work, and return moments
- Muted autoplay-once media behavior with captions, transcript, replay, skip, reduced-motion support, and poster fallbacks
- Eight route recommendations based on student-selected readiness context, never GPA, MCAT, demographics, personality labels, or message volume
- Courses, study experiments, detailed and quick experience capture, service reflection, support mapping, community participation, Story Studio, Portfolio history, advising packets, and application-note export
- Privacy signal detection, autosaved drafts, experience revision history, returning-user recovery, and device-data controls
- Fictional advisor and pilot-administration views with immediate packet revocation and expiration boundaries
- One browser-local state model at `navigate.pathway.demo.v1`, with one-time recovery from `navigate-demo:v3` and `navigate.pipeline.progress.v1`
- Server-side playtest-code comparison and a signed 12-hour `HttpOnly` access cookie

## Deliberately not implemented

- Student accounts, institutional authentication, or identity records
- Supabase, D1, email, analytics, or external message delivery
- Real student, patient, research-participant, admissions, or advising records
- Admissions scoring, predictions, rankings, streaks, or competitive points
- Production community moderation operations or research instruments

The Supabase SQL file under [`docs/architecture/`](docs/architecture/) is a production-shaped reference only. It is not imported by the application.

## Local development

Requirements: Node 22.13 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

Create a local `.env.local` that defines `NAVIGATE_ACCESS_CODE` and a separate, high-entropy `NAVIGATE_SESSION_SECRET`. Environment files are ignored by Git. Never commit a real playtest code or session secret.

Run the complete verification pass with:

```bash
pnpm lint
pnpm test
```

## Repository landmarks

- `app/journey-experience.tsx`: preserved media-first student district and missions
- `app/components/feature-workspaces.tsx`: expanded station, portfolio, advisor, and pilot workflows
- `app/prototype-store.tsx`: versioned state, persistence, and legacy migrations
- `app/access-session.ts`: constant-time code comparison and HMAC session cookies
- `docs/spec/`: supplied product, playtest, architecture, and v0.2 handoff specifications
- `docs/architecture/supabase-schema.sql`: dormant architecture reference

## Delivery and licensing

The preserved visual baseline is tagged `frontend-media-v4`. Unified work is developed on `agent/merge-v02-pathway` and reviewed through a draft pull request.

No open-source license is included. Roseman University must approve a licensing position before one is added.
