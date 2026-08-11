# Navigate the Pathway — PI Architecture Views

**Version:** 0.2
**Audience:** Principal investigator, program leadership, advisors, privacy/IRB stakeholders, and implementation partners
**Purpose:** Show how the product works from the student, advisor, evaluation, and longitudinal-continuity perspectives.

---

## 1. Student user architecture

This view shows how a student moves from orientation to one useful action, how source records become a living Portfolio, and how the student controls any outward sharing.

```mermaid
flowchart LR
    SIGNIN["Student signs in"] --> ORIENT["How This Works<br/>student-only orientation"]
    ORIENT --> CYOA["Create Your Own Adventure<br/>strengths, needs, and one first route"]
    CYOA --> TODAY["Today<br/>one manageable suggested action"]

    TODAY --> JOURNEY["Journey<br/>five domains and prep plan"]
    TODAY --> CAPTURE["Capture<br/>fast evidence entry"]
    TODAY --> COMMUNITY["Community<br/>cohort participation"]
    TODAY --> ME["Me<br/>story, people, habits, and settings"]

    CAPTURE --> VAULT["Experience Vault"]
    CAPTURE --> REFLECT["Reflection Journal"]
    JOURNEY --> PLAN["Personalized Prep Plan"]
    ME --> STORY["Story Studio"]
    ME --> LEARN["Learning Lab"]
    ME --> SUPPORT["Support Constellation"]

    VAULT --> PORTFOLIO["Ongoing Student Portfolio"]
    REFLECT --> PORTFOLIO
    PLAN --> PORTFOLIO
    STORY --> PORTFOLIO
    LEARN --> PORTFOLIO
    SUPPORT --> PORTFOLIO

    PORTFOLIO --> SHARE["Student selects a bounded slice"]
    SHARE --> PACKET["Advisor or application-preparation packet"]
    PACKET --> FEEDBACK["Questions, comments, and next actions"]
    FEEDBACK --> TODAY

    PORTFOLIO -. "Private by default" .-> CONTROL["Student controls visibility,<br/>revocation, and export"]
```

### What this architecture communicates

- The Portfolio is assembled from source records; it is not a second copy of the student's data.
- The product reduces complexity through **Today**, while the full ecosystem remains available.
- The student shares a bounded purpose-specific packet, never the whole Portfolio by default.
- Advisor feedback returns to the student's own next-action loop rather than becoming an admissions judgment.

---

## 2. Advisor user architecture

This view shows how advisors coach from information a student intentionally shared, with contextual technique prompts and without access to private or research-governed data.

```mermaid
flowchart LR
    STUDENT["Student"] --> SELECT["Selects artifacts,<br/>questions, and sharing window"]
    SELECT --> SHARE["Bounded advisor share"]
    SHARE --> AUTHZ["Role and scope authorization"]

    AUTHZ --> PACKET["Advisor packet view<br/>only released content"]
    LIBRARY["Versioned coaching-prompt library<br/>reflective listening, open questions,<br/>evoking awareness"] --> CONSOLE["Advisor Coaching Console"]
    PACKET --> CONSOLE

    CONSOLE --> PREP["Prepare for conversation"]
    PREP --> COACH["Student-centered coaching conversation"]
    COACH --> COMMENT["Comment or question<br/>on shared artifact"]
    COMMENT --> STUDENT

    COACH --> LOG["Optional private one-tap<br/>technique self-log"]
    LOG --> AGG["De-identified, minimum-cell<br/>practice-engagement reporting"]

    PRIVATE["Private journal, unshared Portfolio,<br/>private contacts"] -. "No access path" .-> PACKET
    INSTRUMENTS["GRIT, MacLeod Clark, BRS,<br/>and other instrument data"] -. "Excluded from data source" .-> CONSOLE
```

### What this architecture communicates

- Advisor access begins with an explicit student share and ends at the scope of that share.
- The console coaches the advisor's technique; it does not score the student or the advisor.
- Private journal content, unshared Portfolio content, private contacts, and validated instrument data never enter the advisor view.
- Practice logs are advisor-private and become program data only through de-identification and minimum-cell aggregation.

---

## 3. Program evaluation and research-data architecture

This view separates routine product improvement from consented research measurement. It is the most important governance diagram for PI, privacy, and IRB discussions.

```mermaid
flowchart LR
    subgraph PRODUCT["Routine product system"]
        EVENTS["Privacy-filtered product events"]
        ENROLL["Program enrollment and<br/>completion state"]
        PLANS["Prep-plan completion under<br/>versioned cohort criteria"]
        COACHING["De-identified advisor<br/>prompt engagement"]
    end

    EVENTS --> AGGREGATE["Aggregate with<br/>minimum-cell suppression"]
    ENROLL --> AGGREGATE
    PLANS --> AGGREGATE
    COACHING --> AGGREGATE
    AGGREGATE --> PROGRAM["Program implementation metrics<br/>for PI and approved leadership"]

    subgraph RESEARCH["Separately governed evaluation system"]
        CONSENT["Separate informed consent<br/>and withdrawal state"] --> ADMIN["Instrument administration"]
        ADMIN --> STORE["Restricted instrument store<br/>GRIT, MacLeod Clark, BRS, ACCS, etc."]
        STORE --> ANALYSIS["Approved research analysis"]
    end

    LINK["Approved pseudonymous linkage<br/>to minimum necessary enrollment data"] --> ANALYSIS
    ANALYSIS --> EVALUATION["IRB/privacy-approved<br/>evaluation reporting"]

    PROGRAM --> PI["PI interpretation<br/>implementation + outcomes"]
    EVALUATION --> PI

    BOUNDARY["Hard boundary:<br/>no student UI, advisor UI, branch logic,<br/>notifications, or routine analytics access"] --- STORE
```

### What this architecture communicates

- Product metrics answer whether the program was used and completed as designed.
- Validated instruments answer research questions under separate consent and governance.
- The two streams may meet only through an approved, minimum-necessary, pseudonymous analysis process.
- Instrument scores are not coaching inputs and are never rendered to students or advisors.

---

## 4. Longitudinal continuity architecture

This view shows how the Pathway can extend beyond admission without making post-admission continuity an MVP promise.

```mermaid
flowchart LR
    EXPLORE["Exploring"] --> PREPARE["Preparing"]
    PREPARE --> APPLY["Applying"]
    APPLY --> DECIDE["Deciding"]
    DECIDE --> ADMITTED["Admitted<br/>student-confirmed"]

    ADMITTED --> ENABLED{"Continuity enabled<br/>for this cohort?"}
    ENABLED -- "No" --> REMAIN["Portfolio remains available<br/>in pre-admission product"]
    ENABLED -- "Yes" --> CONSENT{"Student consents<br/>at bridge point?"}
    CONSENT -- "No" --> REMAIN
    CONSENT -- "Yes" --> PACKAGE["Consent-scoped continuity package"]

    PACKAGE --> CARRY["May carry:<br/>Experience Vault history,<br/>selected Story fragments,<br/>Support Constellation,<br/>Learning Lab habit history"]
    PACKAGE --> EXCLUDE["Does not carry automatically:<br/>cohort membership or<br/>research-instrument data"]

    CARRY --> DOWNSTREAM["Separately governed<br/>matriculated-student product"]
    DOWNSTREAM --> MATRICULATED["Matriculated"]
```

### What this architecture communicates

- Phase labels describe orientation to the process, not an admissions-readiness score.
- The bridge is disabled by default and begins only after student confirmation, cohort enablement, and explicit consent.
- A downstream owner and data-sharing agreement must exist before implementation.
- Research data remains outside the bridge regardless of student phase.

---

## 5. PI decision architecture

```mermaid
flowchart TD
    PI["PI and program leadership"] --> PRODUCT["Product decisions"]
    PI --> GOVERNANCE["Governance decisions"]
    PI --> EVALUATION["Evaluation decisions"]
    PI --> CONTINUITY["Continuity decisions"]

    PRODUCT --> P1["Confirm first-login gate<br/>and Portfolio phase language"]
    PRODUCT --> P2["Approve Phase 1 and Phase 2<br/>implementation priorities"]

    GOVERNANCE --> G1["Confirm advisor visibility defaults"]
    GOVERNANCE --> G2["Name content, moderation,<br/>privacy, and evaluation owners"]

    EVALUATION --> E1["Approve completion definitions<br/>per program cohort"]
    EVALUATION --> E2["Approve instrument consent,<br/>schema, linkage, and reporting"]

    CONTINUITY --> C1["Keep bridge at Phase 3+ or reprioritize"]
    CONTINUITY --> C2["Identify downstream product owner<br/>and data-sharing agreement"]
```

## Recommended PI framing

> Navigate the Pathway is one student-owned evidence ecosystem with purpose-specific views. Students build and control the longitudinal record; advisors coach from bounded shares; program leaders see privacy-protected implementation measures; researchers analyze separately consented instruments; and post-admission continuity occurs only through an explicit, governed bridge.
