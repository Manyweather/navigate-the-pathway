# Navigate the Pathway — Spec Addendum v0.2

**Extends:** PRODUCT_AND_SOFTWARE_SPECIFICATION.md v0.1 concept baseline
**Purpose of this file:** merge-ready new/updated sections, plus ready-to-paste Codex prompts, covering the rename, the startup explainer, the ongoing portfolio, pre-admission continuity, and the two program objectives translated into platform mechanics.
**Status:** draft for your review before it goes back into the main spec or into Codex.

---

## 0. Rename: Navigate the Pipeline → Navigate the Pathway

Section 23 of the baseline already flagged "Pipeline" as institutional-sounding and listed **Navigate: Pathways** as a candidate territory. This finalizes it.

**New working title: Navigate the Pathway (NtP).**

Why it fits better than "Pipeline" now that scope explicitly reaches back before admission and forward through it:

- "Pathway" carries direction and individual route without the one-directional, sorting-mechanism connotation of "pipeline."
- It matches the grant program's own language — the BREWSTER/NVSTAR proposal repeatedly uses "pathway to medicine" and "medical school pathway programming."
- It leaves room for the continuity story (§3 below): a pathway continues after admission; a pipeline usually implies you exit it.

**Global replacement:** "Navigate the Pipeline" → "Navigate the Pathway" throughout README.md, PRODUCT_AND_SOFTWARE_SPECIFICATION.md, and FIRST_SESSION_PRESENTATION_AND_PLAYTEST.md. In §23, mark "Navigate: Pathways" as **Selected** and move the rest to a "considered" list.

**Open question to confirm with stakeholders:** does the *program* (NVSTAR/BREWSTER grant name) stay separate from the *product* name, the way "Roseman" is an institution and "Navigate the Pathway" is the tool students use inside it? Recommend yes — keep them decoupled so the product name survives future grant cycles or additional partner schools.

---

## 1. New section 8.0 — Startup "How This Works" (student-facing)

Insert before existing §8.1 (First-session goal). This is deliberately **not** the Create-Your-Own-Adventure flow in §8 — it's a short, static, always-revisitable explainer, where CYOA is a one-time personalized experience. Students hit this first; CYOA is the interactive part that follows it.

### 8.0.1 Why this is a separate thing from the CYOA flow

The playtest doc (§1 of FIRST_SESSION_PRESENTATION_AND_PLAYTEST.md) is explicit that the product should "teach its own value with minimal presenter instruction" and that presenters shouldn't preview the feature list. That's right for the *interactive* flow — discovery should be earned. But a plain, boring "what is this and what will you be asked to do" screen is not the same thing as spoiling the experience, and its absence is a common source of first-run confusion in unmoderated (non-presenter) settings, i.e., real launch conditions where nobody is standing over the student's shoulder saying "just start."

So: §8.0 is orientation. §8.1–8.9 (CYOA) is the felt experience. Students pass through 8.0 once automatically, then can always return to it — CYOA they only get personalized once (with an explicit "redo" option elsewhere, not from here).

### 8.0.2 Placement and access

- Shown automatically on first authenticated launch, before the CYOA inventory begins.
- Always reachable afterward from **Me → How this works.**
- Never shown to advisors, facilitators, moderators, or administrators — this screen is written entirely in second-person student voice and would misrepresent the product if surfaced in an advisor context. Advisor orientation is a separate, not-yet-specified artifact (flagged as an open item in §6 below).
- Fully skippable after the first card; skipping never blocks CYOA or any other function.

### 8.0.3 Content (4 cards, phone-first, ~30 seconds to skim)

**Card 1 — What this is**
> Navigate the Pathway helps you turn what you're already doing — classes, work, service, research, caregiving, whatever it is — into a record you can actually use. Not just for one application. For the whole stretch between now and becoming the physician you're working toward.

**Card 2 — What this isn't**
> This doesn't predict admission, score your chances, or replace your advisor. It's a place to keep things accurate and build the story that's actually yours to tell.
(Reuses the boundary language already established in §2.3 of the baseline — do not introduce new claims here.)

**Card 3 — How it's private**
> Everything you write is private by default. You choose what to share, with who, and you can change your mind later. Never enter a patient's name or identifying details about anyone you're not allowed to identify.

**Card 4 — The five places you'll live**
> **Today** for your next move. **Journey** to see the whole map. **Capture** to log something fast. **Community** for your cohort. **Me** for your story, your people, and your settings.
Show this card with the same five-item structure as §7.1, in the same order, so the mental model matches the actual navigation the student lands in next.

Optional 5th card only if the student's account already indicates post-admission continuity is enabled (see §3): **"Your record doesn't reset."** — one line previewing that their evidence carries forward. Omit this card entirely for schools/cohorts where continuity isn't configured, so it never sets an expectation the platform can't yet deliver.

### 8.0.4 New functional requirements

| ID | Requirement |
| --- | --- |
| ORNT-01 | Show the four-card explainer once automatically on first launch, before CYOA begins. |
| ORNT-02 | Make the explainer reachable at any time from Me, with no re-authentication friction. |
| ORNT-03 | Never show this screen, or any variant of it, to non-student roles. |
| ORNT-04 | Skipping at any point after Card 1 must not block or delay account setup or CYOA. |
| ORNT-05 | Card content is CMS-editable per §13.11 (no redeploy needed), version-controlled like admissions content. |
| ORNT-06 | Card 5 (continuity teaser) renders conditionally on a cohort/tenant flag; false by default. |

---

## 2. New section 9.10 — Ongoing Student Portfolio

Insert after existing §9.9 (Application Packet). The Portfolio is the connective, always-current layer that the baseline's individual modules (Experience Vault, Story Studio, Journey domains, Application Packet) already produce pieces of but don't yet present as one continuous artifact.

### 9.10.1 What makes it different from what already exists

| Existing artifact | Scope | The Portfolio's relationship to it |
| --- | --- | --- |
| Journey Map (§9.2) | Planning state across five domains, right now | Portfolio shows the *history* of domain states, not just the current one |
| Experience Vault (§9.3) | Individual experience records | Portfolio renders them as one chronological timeline |
| Story Studio (§9.5) | Drafting workspace for application material | Portfolio surfaces finished/selected fragments, not the drafting mess |
| Application Packet (§9.9) | A bounded export, scoped to one application cycle | Portfolio is never "exported and done" — it's the living source the Packet is pulled from |

The Packet answers "what do I send this cycle." The Portfolio answers "what is true about my path so far, and where am I now" — and it keeps answering that after the cycle ends, whether the outcome was admission, a gap year, or reapplication.

### 9.10.2 Structure

- **Header:** current phase (see 9.10.3), target cycle or "exploring," last-updated date. No composite score, no percentage, no letter grade — consistent with the existing prohibition on a single readiness number (§18.4).
- **Five-domain summary:** the same five domains from §7.3, each showing current state *and* a small history strip (e.g., "Not mapped → In progress → Ready to discuss," with dates), so growth is visible without being scored.
- **Evidence timeline:** reverse-chronological feed combining experience entries, reflections, milestones reached, Learning Lab experiment outcomes, and support-contact activations. This is the closest thing to a CV in the product, but it stays evidence-and-reflection-first rather than bullet-and-metric-first — an entry shows role, dates, and the linked reflection, not just a title and hour count.
- **Growth Signals panel:** private, self-report only. Short trend indicators the student sets themselves (e.g., a monthly one-tap "how steady do you feel about this path" check-in), never a score derived from journal content, message activity, or any validated instrument (see §4 below — this is a hard boundary, not a style choice).
- **Story highlights:** student-selected fragments from Story Studio, the pieces they've decided represent them, distinct from the full draft history.
- **Competency evidence map:** pulled from §9.3's evidence_links, shown as coverage across the taxonomy, not a checklist of "AAMC boxes."
- **Support Constellation summary:** who's in it, not their private contact details.

### 9.10.3 Portfolio phases

Replacing any implicit notion of a single "readiness" state with an explicit, low-stakes phase label the student sets or confirms (never auto-assigned from GPA/MCAT/etc., per the existing branch-logic prohibition in §8.5):

`Exploring → Preparing → Applying → Deciding → Admitted → Matriculated`

A student can sit in "Exploring" for years and that's fine — the phase describes orientation to the process, not progress toward it. "Admitted" and "Matriculated" only appear where continuity (§3) is configured for that cohort.

### 9.10.4 Visibility

Follows §12 exactly: the full Portfolio is private to the student by default. What an advisor sees is still the bounded, explicitly-released packet — the Portfolio does not create a new bulk-share surface. Practically: the Application Packet (§9.9) becomes "export/share a slice of my Portfolio for this purpose," rather than a separately-maintained document.

### 9.10.5 New functional requirements

| ID | Requirement |
| --- | --- |
| PORT-01 | Render the evidence timeline from existing experience, reflection, milestone, and support-activation records without duplicating storage. |
| PORT-02 | Domain history strips show state transitions with dates; states are edited only through their originating module (Journey, Vault, etc.), never edited directly on the Portfolio view. |
| PORT-03 | Growth Signals entries are student-authored and student-deleted at will; never auto-populated from any other data source. |
| PORT-04 | Portfolio phase is student-set with a suggested default; changing it never triggers a notification to advisors or facilitators. |
| PORT-05 | No portfolio view, student or advisor-facing, may display a composite score, percentile, or single readiness number. |

---

## 3. New section 9.11 — Pre-admission feed-forward and the Continuity Bridge

Insert after 9.10. This is the mechanism behind your instruction that "these main concepts extend past being admitted."

### 3.1 What already feeds forward, reframed

Nothing here requires new modules — it requires the existing modules to be *described* (in copy, in onboarding, in the data model) as building toward something that outlasts the application, not just toward submitting it:

- **Experience Vault → CV foundation.** Already structured as a longitudinal record (§9.3); the reframe is narrative, not technical: this is the base layer of a CV/portfolio that keeps growing after matriculation, not a bin that gets emptied into one AMCAS export and abandoned.
- **Cohort Commons → carried relationships.** Peer ties built pre-admission (study pods, cohort channels, §9.8) are currently scoped to the pre-admission cohort. Feed-forward means a student's cohort connections *can* persist into a matriculated cohort space, if that space exists and the student opts in.
- **Learning Lab → carried habits.** Study strategy experiments (§9.6) are exactly the self-regulation habits medical school requires. The product should say this explicitly at the moment a student reaches "Admitted," not leave it implied.

### 3.2 The Continuity Bridge (explicitly out of MVP — Phase 3+)

This is the actual boundary-crossing mechanic, and it needs its own governance decision before it's built, consistent with the baseline's existing caution about the post-admission Levels Planner (§2.1: "explicitly excluded... These learners have not been admitted"). That exclusion was about *sourcing this product's design* from Levels Planner — it does not preclude this product later *feeding into* a matriculated experience once one exists for these students. Recommend treating that as a separate, later decision:

- **Trigger:** student's Portfolio phase reaches "Admitted," confirmed by the student and, where available, institutional enrollment data — never inferred from application content.
- **What carries forward, with explicit student consent at the bridge point:** Experience Vault history, Story Studio fragments, Support Constellation, and Learning Lab habit history become the seed data for whatever matriculated-student product exists (Levels Planner or a successor).
- **What does not carry forward automatically:** cohort channel membership (new consent per §9.8's existing moderation/retention rules), and any research-governed instrument data (§4 — that stays in its own separately-consented store regardless of phase).
- **Governance flag:** requires the same stakeholder decisions the README's "Recommended next workshop" already lists (admissions-content owner, advisor visibility defaults) plus a new one — *who owns the matriculated-side product this bridges into, and under what data-sharing agreement.*

Recommend this stays a documented Phase 3 item, not a Phase 1/2 build target — it depends on a downstream product that may not exist yet.

---

## 4. Data mechanism for the two program objectives

This is the "backend objectives incorporated into platform mechanics" piece. Two important design principles up front, both extensions of guardrails already in the baseline:

1. **Validated instrument scores are program-evaluation data, not product data.** GRIT, MacLeod Clark, Brief Resilience Scale, and the Advisor Coaching Competency Scale (ACCS) are collected under informed consent as research instruments (per the BREWSTER proposal's baseline/end-of-year administration). They must live in a separately-governed data class — never merged into `student_profiles`, never used in branch logic (§8.5 already forbids exactly this kind of input), and **never rendered back to the student or advisor as an in-app score.** This isn't a new rule so much as the existing §18.4 prohibited-metrics list applied to a new data source.
2. **The platform's job is to build the underlying behaviors, not to re-implement the instruments.** Just like Learning Lab already builds self-regulation without diagnosing anything (§13.6, LEARN-05), the mechanics below build grit-relevant, identity-relevant, and resilience-relevant behavior through existing product loops — the instruments then measure whether that worked, externally.

### 4.1 Objective 1 — student confidence, persistence, readiness

| Construct measured externally | Platform mechanic that builds it | Where it already lives / what's new |
| --- | --- | --- |
| **GRIT** (consistency of interest, perseverance of effort) | The Notice→Choose→Try→Check→Reflect→Adjust cycle, run repeatedly, with setbacks reframed as "keep/adjust/replace" rather than failure | Existing Learning Lab (§9.6) — no new module. New: a private, non-scored **Persistence Trail** on the Portfolio showing experiment count and adjust/replace history over time, never a streak, never shamed if broken |
| **MacLeod Clark professional identity** (belonging, pride, not hiding the pursuit) | Reflection prompts and Journey domain 5 ("Emerging physician identity," §7.3) that explicitly invite identity language; Story Studio theme board surfacing repeated identity-relevant language back to the student; Cohort "celebrate" post type (§9.8) | Existing domain + existing Story Studio + existing Cohort post type — reframe reflection prompt library to include identity-specific prompts (e.g., "When did you feel most like you belonged in this work?") |
| **Brief Resilience Scale** (bouncing back from setbacks) | Learning Lab's non-punitive setback handling; Support Constellation activation prompted specifically after a logged setback; a reflection template triggered when a student marks an experience or experiment "harder than expected" | Mostly existing — new: a **setback tag** available on any experience/experiment entry that, when used, surfaces (never forces) a Support Constellation check and a resilience-specific reflection prompt |
| **Personalized prep plan + program completion** (the ≥75–80% target itself) | A first-class, trackable plan object, not just implied by scattered Journey/quest state | New — see 4.2 |

### 4.2 New data entities — student side

| Entity | Purpose | Governance |
| --- | --- | --- |
| `prep_plan` | The personalized plan referenced by the objective — target cycle, domains in focus, plan version, created/updated dates | Student-owned; student/advisor-shared per standard visibility rules |
| `prep_plan_actions` | Individual planned actions, each linked to a Journey milestone, Learning Lab experiment, Support Constellation contact, or Cohort quest; status: planned / in progress / completed / revised | Same as parent plan |
| `program_enrollment` | Links a student to a specific program cohort (e.g., an NVSTAR cohort year); tracks consent status for research instruments, enrollment date, completion status | Program-administrator scope; drives the completion-rate metric |
| `instrument_administrations` / `instrument_scores` | GRIT, MacLeod Clark, BRS, Pre-Health Application Self-Assessment responses and timestamps | **Separate, IRB/consent-governed schema.** Not joined to routine analytics tables. Access limited to a new Research/Evaluation Coordinator role (§4.4). Never exposed via product UI. |

**Completion criteria for `prep_plan_actions`** should be CMS-editable (per CMS-01), not hardcoded — e.g., program administrators define what counts as "completed a plan" for their cohort (a specific count of actions across domains, within a program window). This keeps the ≥75–80% threshold auditable and adjustable per cohort without a deploy.

### 4.3 Objective 2 — advisor coaching competency

Your framing — "advisors viewing student portal will be coached through how to assess data to coach based on individual student data" — is a real-time, in-context scaffold, distinct from the ACCS assessment itself (which per the proposal is a post-program skills assessment, administered separately). The platform's job is the daily-practice layer underneath that eventual assessment.

**New module: Advisor Coaching Console**, attached to the existing bounded packet view (§13.8, ADV-02/03). When an advisor opens a student's shared packet:

- The platform surfaces **contextual coaching prompts** keyed to what's actually in the shared artifact — e.g., a flagged prerequisite uncertainty surfaces a suggested open-ended question rather than a direct answer; a shallow reflection surfaces a reflective-listening prompt; a support-network gap surfaces a question that invites the student to name it themselves.
- Every prompt is tagged to a specific ICF core competency (the same framework the proposal already cites) — reflective listening, powerful/open-ended questioning, evoking awareness — so the coaching library stays anchored to what the ACCS will later assess, without the console pretending to be the assessment.
- Advisors can self-log which technique they used in a conversation (optional, low-friction, one tap) — this builds a private **Advisor Practice Trail**, the advisor-side mirror of the student Persistence Trail, and gives the program a behavioral proxy for coaching-skill engagement between baseline and the post-program ACCS.
- The console **never shows raw scores from the student's GRIT/MacLeod Clark/BRS data** — consistent with the proposal's own methodology table, which marks advisors "NO" for all three of those instruments. Advisors coach from what the student chose to share, scaffolded by technique, not from psychometric output.

### 4.4 New data entities — advisor side

| Entity | Purpose | Governance |
| --- | --- | --- |
| `coaching_prompts` | Content library: trigger type, ICF competency tag, prompt text, do/don't guidance | CMS-editable, versioned, same governance as other prompt libraries |
| `coaching_practice_logs` | Advisor's self-logged technique use per shared-packet conversation | Advisor-private; aggregated (de-identified, minimum-cell) for program reporting only |
| Role addition: **Research/Evaluation Coordinator** | Custody of `instrument_administrations`/`instrument_scores` and cross-referencing `program_enrollment` completion data for evaluation reporting | Most restricted role in §12's table — narrower than Program analyst, which still shouldn't touch instrument data |

### 4.5 New metrics (extend §18.3) and a new prohibited item (extend §18.4)

Add to supporting metrics:
- prep plan completion rate (per 4.2's configurable criteria) — the direct platform-side proxy for the ≥75–80% target;
- program completion rate from `program_enrollment`;
- advisor coaching-prompt engagement rate and Advisor Practice Trail activity — the platform-side proxy feeding toward the ACCS objective;
- setback-tag → support-activation follow-through rate (resilience-adjacent, behavioral, self-report only).

Add to explicitly prohibited metrics:
- any GRIT, MacLeod Clark, or Brief Resilience Scale score, raw or composite, rendered in-product to a student or advisor;
- any coaching-competency score inferred from `coaching_practice_logs` alone (self-logged practice counts as engagement data, not a proficiency measurement — proficiency stays with the external ACCS assessment).

---

## 5. Open decisions to confirm before this goes to Codex

1. Does §8.0 gate CYOA (must-pass-through) or run fully parallel (student can jump straight to CYOA and find §8.0 later from Me)? Current draft assumes gate-then-skippable.
2. Confirm Portfolio phase labels (`Exploring → Preparing → Applying → Deciding → Admitted → Matriculated`) read right to actual students — worth a quick card-sort per the existing Phase 0 discovery plan (§19).
3. Confirm the Continuity Bridge really is Phase 3+ and not something a pilot partner is expecting sooner — this has real governance dependencies outside this product's control.
4. Confirm the Research/Evaluation Coordinator role and the separate instrument-data schema before any survey integration work starts — this is the piece most likely to need actual IRB/privacy-office sign-off, not just product judgment.

---

## 6. Ready-to-paste Codex prompts

Each is scoped to one deliverable and references the section above it draws from. Written assuming Codex is working against the existing prototype and has this spec (or this addendum) in context — adjust file/component names once I can see the actual prototype structure.

**Prompt A — Startup explainer**
> Build the student-facing "How this works" startup screen per Spec Addendum §1 (section 8.0). Four swipeable/scrollable cards, phone-first, skippable after card 1, shown once automatically on first authenticated launch and always reachable from Me → How this works. Card copy is exactly as written in §8.0.3. Do not show this to any non-student role. Card content should pull from a CMS-editable source, not be hardcoded, per ORNT-05.

**Prompt B — Ongoing Portfolio view**
> Build the Portfolio view per Spec Addendum §2 (section 9.10): header with phase and last-updated date, five-domain summary with history strips, reverse-chronological evidence timeline sourced from existing experience/reflection/milestone/support records, a student-authored-only Growth Signals panel, Story Studio highlights, competency evidence map, and Support Constellation summary. No composite score anywhere on this view. Application Packet export should pull from Portfolio data rather than maintaining a separate copy.

**Prompt C — Prep plan tracking**
> Add `prep_plan` and `prep_plan_actions` per Spec Addendum §4.2. Each action links to an existing Journey milestone, Learning Lab experiment, Support Constellation contact, or Cohort quest. Completion criteria per cohort should be admin-configurable, not hardcoded. Expose plan completion state on the Portfolio (§9.10) without a numeric score.

**Prompt D — Advisor Coaching Console**
> Build the Advisor Coaching Console per Spec Addendum §4.3, attached to the existing bounded packet view. Surface contextual coaching prompts (from a `coaching_prompts` library, tagged to ICF competencies: reflective listening, open-ended questioning, evoking awareness) keyed to what's present in the specific shared artifact the advisor is viewing. Add an optional one-tap self-log of technique used, stored in `coaching_practice_logs`. This console must never display any GRIT, MacLeod Clark, or Brief Resilience Scale data — those do not exist in this view's data source at all.

**Prompt E — Rename pass**
> Global rename "Navigate the Pipeline" → "Navigate the Pathway" across all copy, docs, and any hardcoded strings in the prototype. Leave the underlying program/grant name (NVSTAR) untouched — it refers to the funded program, not the product.

---

*End of addendum.*
