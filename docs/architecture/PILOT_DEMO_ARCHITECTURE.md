# Navigate the Pathway pilot demo architecture

## Current implementation

This release is a fictional, browser-local interaction demonstration. It adds attendance, survey-wave, curriculum-reference, course-snapshot, Portfolio-document metadata, advisor-summary, and pilot-administration interfaces to the existing media-first prototype.

The unified state is stored at `navigate.pathway.demo.v2`. A one-time reader migrates `navigate.pathway.demo.v1`, `navigate-demo:v3`, and `navigate.pipeline.progress.v1`. Legacy keys remain unchanged until the new version is successfully written. Clearing device data removes both current and legacy prototype keys. It does not alter the separate playtest access cookie.

## Deliberate safety boundary

The public prototype must contain only fictional demonstration records. It does not provide student identity, role-based authorization, institutional persistence, secure document storage, official attendance, approved survey instruments, grade records, transcript verification, analytics, email, or advising notifications.

Portfolio file bytes and file names are never written to prototype state. The browser may inspect a selected file in memory long enough to validate its type and size. Persisted data contains student-entered metadata only. Survey state records workflow status but no item responses.

The access-code page is a playtest gate, not authentication. Browser-local visibility controls demonstrate product intent but do not secure real records.

## Production requirements

Before real-student use, Roseman needs a private production environment with institutional identity, least-privilege roles, server-side authorization on every object, encrypted database and object storage, malware scanning, retention and deletion rules, audit events, incident response, accessibility review, FERPA/privacy review, and a documented research/IRB determination. Attendance schedules, survey instruments, curriculum interpretations, advising relationships, and notification rules require named institutional owners.

The reference schema in `pilot-schema.sql` is planning material only. It is not connected to the runtime.

## Permission model to preserve

- Students control Portfolio destinations and advising shares.
- Advisors receive read-only access to active, selected packet content.
- Expiration or revocation removes advisor visibility immediately.
- Administrators may correct attendance only with a reason and audit entry.
- Survey answers must never influence route recommendations.
- Curriculum comparison is descriptive and must not produce GPA, degree-progress, risk, eligibility, or admissions predictions.

## Unresolved decisions

- Approved attendance calendar, check-in windows, excused-absence policy, and warning threshold
- Approved pre/post survey instruments, versions, permissions, scoring prohibition, wave dates, and completion rules
- Institutional interpretation of curriculum duplicates, missing credit rows, and prerequisite relationships
- Authorized scenario text, named resources, resource owners, and review lifecycle
- File retention, maximum size, accepted formats, malware scanning, and export/deletion policy
- Advisor roster source, packet expiration defaults, comment retention, and escalation responsibilities
