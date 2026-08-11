# Navigate the Pathway v0.2 prototype handoff

## Start here

The current working prototype source is in [`pathway-prototype`](pathway-prototype). It is a fictional, browser-persistent demonstration with separate Student, Advisor, and Pilot Administration views.

For a second pair of eyes, send the dated handoff ZIP beside this document. It contains the source, tests, assets, database contract, and planning documents, but excludes dependencies, build output, caches, local browser state, credentials, and environment files.

## Run the prototype

Open a terminal in `pathway-prototype`, then run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000/`. Use the visible Student Pathway and Advisor Pathway controls to change demonstration views. Pilot Administration opens from the advisor workspace.

## What is implemented

- Fictional-example start screen, student orientation, skippable intake, eight starting routes, and reviewer presets
- Complete student workflows for Courses, Experiences, Reflections, Study Strategies, Support Network, Community, Story Building, and Advising
- Browser-persistent structured drafts and returning-user recovery
- Private My Work timeline, descriptive domain history, private check-in history, search/filter, and action markers without scores or readiness judgments
- Personal application export built only from completed saved entries, with print/PDF, local text download, linked evidence titles, missing-detail prompts, and AMCAS-oriented character-count guidance
- Private-first advising shares with explicit advisor selection, exact preview, expiration, revocation, and immediate advisor visibility boundaries
- Asynchronous advisor workflow and an explanatory Pilot Administration area
- Accessibility, privacy-language, route-logic, selector-boundary, server-render, and export tests

## Important boundaries

- All included records are fictional demonstration data.
- The browser stores fictional state locally under `navigate-demo:v3`.
- Authentication, email, Supabase connectivity, production analytics, and real-record collection are not active.
- `supabase/schema.sql` is a future production contract only.
- The application export is a personal download. It never reads or changes the advising share.
- Real pilot activation still requires institutional privacy, program-evaluation, and possible IRB decisions.

## Suggested review path

1. Open the public example screen and enter the student example.
2. Complete or autofill intake and inspect the recommended starting door.
3. Save an experience, reflection, or story fragment and reopen it from My Work.
4. Open Download for applications and verify grouping, linked titles, missing-detail prompts, character guidance, print layout, and text download.
5. Prepare an advising share, preview the exact entries, then inspect the advisor pathway.
6. Revoke access and confirm selected evidence disappears from the advisor view.
7. Open Pilot Administration and review the PI orientation, readiness decisions, moderation, relationships, sources, and reviewer scenarios.

## Verification commands

```bash
npm run build
node --experimental-strip-types --test tests/*.test.mjs
```

The standard lint command currently also discovers Finder-generated duplicate files whose names end in ` 2`. Those duplicate files are not part of the dated handoff ZIP. Lint the canonical source files or remove the duplicate copies after confirming they are not needed.
