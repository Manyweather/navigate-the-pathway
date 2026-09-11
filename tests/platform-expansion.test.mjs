import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  acceptedUploadTypes,
  canTransitionOacaAppointment,
  defaultWorkspaceFor,
  experiences,
  genesisEventCanPublish,
  maximumUploadBytes,
  oacaAdvisingMilestones,
  oacaAppointmentStates,
  oacaPolicyDocuments,
  oacaTutoringPolicy,
  staffMfaRoles,
  suppressSmallGroup,
} from "../app/production/platform-model.ts";
import { organizationCollegeOrder, organizationsForSelect, studentOrganizations } from "../app/production/student-organizations.ts";
import { SYNTHETIC_PERSONA_KEY, syntheticPreviewApi, syntheticPreviewContext, syntheticPreviewMemberships } from "../app/production/synthetic-preview.ts";
import { parseRecoveryCallback } from "../app/production/auth-recovery.ts";

test("Compass is the parent for three isolated workspace destinations", () => {
  assert.deepEqual(Object.keys(experiences), ["pathway", "oaca", "genesis"]);
  assert.equal(experiences.pathway.href, "/app/pathway");
  assert.equal(experiences.oaca.href, "/app/compass");
  assert.equal(experiences.oaca.name, "Compass");
  assert.equal(experiences.genesis.href, "/app/compass/impact");
  assert.equal(experiences.genesis.name, "Impact Workspace");
  assert.equal(defaultWorkspaceFor(syntheticPreviewMemberships, null), "compass");
  for (const role of ["faculty", "staff", "administrator", "creator", "principal_investigator", "mentor", "community_liaison"]) assert.equal(staffMfaRoles.has(role), true);
});

test("synthetic creator preview exposes all workspaces without production identities", async () => {
  assert.equal(syntheticPreviewContext.principalType, "creator");
  assert.equal(syntheticPreviewContext.aal, "aal2");
  assert.equal(syntheticPreviewMemberships.length, 3);
  assert.equal(syntheticPreviewMemberships.every((membership) => membership.roles.includes("creator")), true);
  const compass = await syntheticPreviewApi.request("/api/oaca/bootstrap");
  const impact = await syntheticPreviewApi.request("/api/genesis/bootstrap");
  assert.ok(compass.events.length && compass.appointments.length && compass.analytics);
  assert.ok(impact.organizations.length && impact.portfolios.length && impact.snapshots.length);
  assert.doesNotMatch(JSON.stringify({ compass, impact }), /@roseman\.edu/i);
  await syntheticPreviewApi.request("/api/oaca/appointments/cancel", { method: "POST", body: { appointmentId: "appointment-1" } });
  const updatedCompass = await syntheticPreviewApi.request("/api/oaca/bootstrap");
  assert.equal(updatedCompass.appointments.find((appointment) => appointment.id === "appointment-1")?.status, "cancelled");
});

test("Creator Preview personas are scoped before dashboard data is returned", async () => {
  const values = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) },
    dispatchEvent: () => true,
  };
  try {
    values.set(SYNTHETIC_PERSONA_KEY, "compass_student");
    const studentPlatform = await syntheticPreviewApi.request("/api/platform/experiences");
    assert.deepEqual(studentPlatform.memberships.map((item) => item.experienceKey), ["oaca"]);
    const studentCompass = await syntheticPreviewApi.request("/api/oaca/bootstrap");
    assert.deepEqual(studentCompass.assignedStudents, []);
    assert.equal(studentCompass.analytics, null);
    assert.equal(studentCompass.canManageImports, false);
    await assert.rejects(() => syntheticPreviewApi.request("/api/oaca/analytics", { method: "POST", body: {} }), /Student preview responses cannot access staff/);
    const affiliations = await syntheticPreviewApi.request("/api/platform/affiliations");
    assert.equal(affiliations.studentCouncil, true);
    assert.equal(affiliations.impactAccessStatus, "locked");

    values.set(SYNTHETIC_PERSONA_KEY, "impact_student");
    const impactStudent = await syntheticPreviewApi.request("/api/genesis/bootstrap");
    assert.equal(impactStudent.accessStatus, "active");
    assert.deepEqual(impactStudent.accessQueue, []);
    assert.deepEqual(impactStudent.notifications, []);

    values.set(SYNTHETIC_PERSONA_KEY, "community_liaison");
    const liaison = await syntheticPreviewApi.request("/api/genesis/bootstrap");
    assert.ok(liaison.accessQueue.length > 0);
    assert.ok(liaison.notifications.length > 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("password recovery takes priority over account loading and offers a safe preview fallback", async () => {
  const access = await readFile(new URL("../app/production/platform-access.tsx", import.meta.url), "utf8");
  const signIn = await readFile(new URL("../app/production/production-pilot-app.tsx", import.meta.url), "utf8");
  assert.match(access, /PASSWORD_RECOVERY/);
  assert.match(access, /recoveryMode/);
  assert.match(access, /recoveryError/);
  assert.match(access, /authReady/);
  assert.match(access, /signOut\(\{ scope: "local" \}\)/);
  assert.match(access, /Open the Creator preview/);
  assert.match(signIn, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(signIn, /Set new password/);
  assert.match(signIn, /same_password/);
  assert.match(signIn, /Send me a fresh reset link/);
  assert.match(signIn, /Supabase verified this recovery session/);
  assert.match(signIn, /email security scanning/);
  assert.match(signIn, /PasswordRecoveryProblem/);
  assert.match(access, /window\.history\.replaceState/);
});

test("password recovery callbacks reject Supabase errors before showing the password form", () => {
  const valid = parseRecoveryCallback("", "#access_token=valid&refresh_token=valid&type=recovery");
  assert.deepEqual(valid, { requested: true, errorCode: null, errorMessage: null });
  const rejected = parseRecoveryCallback("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid&type=recovery");
  assert.equal(rejected.requested, true);
  assert.equal(rejected.errorCode, "otp_expired");
  assert.match(rejected.errorMessage, /email security scan/);
  const ordinary = parseRecoveryCallback("?preview=creator", "");
  assert.deepEqual(ordinary, { requested: false, errorCode: null, errorMessage: null });
});

test("OACA state transitions preserve explicit approval and counterproposal semantics", () => {
  assert.deepEqual(oacaAppointmentStates, ["draft", "pending_approval", "counterproposed", "confirmed", "declined", "cancelled", "completed", "no_show"]);
  assert.equal(canTransitionOacaAppointment("pending_approval", "confirmed"), true);
  assert.equal(canTransitionOacaAppointment("confirmed", "counterproposed"), true);
  assert.equal(canTransitionOacaAppointment("counterproposed", "completed"), false);
  assert.equal(canTransitionOacaAppointment("cancelled", "confirmed"), false);
});

test("OACA policies preserve milestone access and enforce tutoring limits", () => {
  assert.equal(oacaPolicyDocuments.length, 5);
  assert.equal(oacaAdvisingMilestones.some((item) => item.key === "foundations_year_1_check_in" && item.timing.includes("first 4 weeks")), true);
  assert.equal(oacaAdvisingMilestones.some((item) => item.key === "clerkship_director_referral" && item.timing.includes("10 business days")), true);
  assert.equal(oacaAdvisingMilestones.some((item) => item.key === "career_year_2" && item.required), true);
  assert.equal(oacaTutoringPolicy.studentWeeklyMinutes, 120);
  assert.equal(oacaTutoringPolicy.examBlockMinutes, 240);
  assert.equal(oacaTutoringPolicy.bookingHorizonDays, 7);
  assert.equal(oacaTutoringPolicy.cancellationNoticeHours, 24);
  assert.equal(oacaTutoringPolicy.tutorHardWeeklyHours, 8);
});

test("shared upload and analytics controls use fixed privacy defaults", () => {
  assert.equal(maximumUploadBytes, 25 * 1024 * 1024);
  for (const mime of ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "image/jpeg", "image/png"]) assert.equal(acceptedUploadTypes.has(mime), true);
  assert.deepEqual(suppressSmallGroup({ count: 9, value: 42 }), { count: 9, value: null, suppressed: true });
  assert.deepEqual(suppressSmallGroup({ count: 10, value: 42 }), { count: 10, value: 42, suppressed: false });
  assert.equal(genesisEventCanPublish("2026-09-10T00:00:00Z", null), false);
  assert.equal(genesisEventCanPublish("2026-09-10T00:00:00Z", "2026-09-10T01:00:00Z"), true);
});

test("the complete organization catalog is ordered Medicine-first and gates the pilot", () => {
  const sorted = organizationsForSelect();
  assert.equal(organizationCollegeOrder[0], "College of Medicine");
  assert.equal(sorted[0].college, "College of Medicine");
  assert.equal(studentOrganizations.length, 63);
  assert.equal(studentOrganizations.filter((item) => item.college === "College of Medicine").length, 20);
  assert.equal(studentOrganizations.filter((item) => item.pilotAvailable).every((item) => item.college === "College of Medicine"), true);
  assert.equal(studentOrganizations.filter((item) => item.college !== "College of Medicine").every((item) => !item.pilotAvailable), true);
  for (const item of studentOrganizations) {
    assert.ok(item.name && item.campus && item.mission && item.advisor && item.sourceDate);
  }
});

test("platform migrations are additive, identity-aware, audited, and immutable where required", async () => {
  const [foundation, catalog, actions, oacaPolicies, oacaImports, oacaOutreach, eventOperations, affiliations, bookingRefinements, compassParent] = await Promise.all([
    readFile(new URL("../supabase/migrations/202609100001_three_experience_platform.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100002_genesis_organization_catalog.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100003_experience_vertical_slice_actions.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100005_oaca_policy_operations.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100006_oaca_secure_data_ingestion.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100007_oaca_events_outreach.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100008_oaca_event_operations.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100009_student_affiliations_platform_creator.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100010_oaca_student_booking_refinements.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609110001_compass_parent_platform.sql", import.meta.url), "utf8"),
  ]);
  assert.match(foundation, /insert into public\.experience_role_assignments[\s\S]*from public\.role_assignments/i);
  assert.match(foundation, /public\.current_profile_user_id\(\)/);
  assert.match(foundation, /prevent_genesis_snapshot_changes/);
  assert.match(foundation, /create policy oaca_messages_participants/);
  assert.doesNotMatch(foundation, /oaca_messages.*administrator/i);
  assert.doesNotMatch(foundation + catalog + actions + oacaPolicies + oacaImports + oacaOutreach + eventOperations + affiliations + bookingRefinements + compassParent, /\b(drop table|truncate|delete from public\.profiles|alter table public\.role_assignments drop)\b/i);
  assert.match(catalog, /'College of Medicine'.*true,1/);
  assert.match(actions, /service\.policy_status <> 'live_approved'/);
  assert.match(actions, /Approved organization membership is required to publish/);
  assert.match(actions, /Mentor review is required before publication/);
  assert.match(actions, /genesis_handoff_offered/);
  assert.match(oacaPolicies, /Students may schedule up to two hours of peer tutoring each week/);
  assert.match(oacaPolicies, /within 10 business days/);
  assert.match(oacaPolicies, /request_origin.*advisor/);
  assert.match(oacaPolicies, /oaca_advisor_create_appointment/);
  assert.match(oacaPolicies, /This request would exceed the two-hour weekly tutoring limit/);
  assert.match(oacaImports, /external_key_hash.*\^\[0-9a-f\]\{64\}\$/);
  assert.match(oacaImports, /A second authorized reviewer must approve real student data/);
  assert.match(oacaImports, /notesImported',false/);
  assert.match(oacaImports, /student_count<minimum_group/);
  assert.doesNotMatch(oacaImports, /\b(raw_notes|message_body|patient_id)\b/i);
  assert.match(oacaOutreach, /oaca_student_matches_audience/);
  assert.match(oacaOutreach, /Campaign media must pass security scanning before delivery/);
  assert.match(oacaOutreach, /A similar nudge was sent within the last 24 hours/);
  assert.match(oacaOutreach, /minimum_group integer:=10/);
  assert.match(oacaOutreach, /oaca_delivery_jobs/);
  assert.doesNotMatch(oacaOutreach, /\b(ip_address|raw_email|message_body)\b/i);
  assert.match(eventOperations, /attendance_version/);
  assert.match(eventOperations, /A second authorized reviewer may approve only after both scans are clean/);
  assert.match(eventOperations, /ignoredMetadata',true/);
  assert.match(eventOperations, /oaca_event_attendance_changes_immutable/);
  assert.match(eventOperations, /oaca_student_qr_tokens/);
  assert.match(eventOperations, /platform_notification_delivery_events/);
  assert.match(eventOperations, /STOPALL/);
  assert.match(eventOperations, /oaca_event_calendar_jobs/);
  assert.match(affiliations, /platform_student_affiliations/);
  assert.match(affiliations, /student_council/);
  assert.match(affiliations, /sync_platform_creator_access/);
  assert.match(affiliations, /These affiliations deliberately do not grant/);
  assert.match(bookingRefinements, /Academic drop-ins are limited to two visits per academic block/);
  assert.match(bookingRefinements, /oaca_one_active_permanent_student_qr/);
  assert.match(bookingRefinements, /deduplicated/);
  assert.match(compassParent, /platform_workspace_preferences/);
  assert.match(compassParent, /verification_status.*pending.*approved.*declined.*ended/s);
  assert.match(compassParent, /Student Council|student_council/i);
  assert.match(compassParent, /genesis_decide_affiliation/);
  assert.match(compassParent, /genesis_submit_event/);
  assert.match(compassParent, /genesis_decide_event/);
  assert.match(compassParent, /genesis_event_calendar_jobs/);
  assert.match(compassParent, /impact:event:submitted/);
  assert.match(compassParent, /enforce_genesis_student_write_affiliation/);
  assert.match(compassParent, /Impact editing is read-only until an interest-group affiliation is approved/);
});

test("Worker API requires matching experience context and keeps endpoint families stable", async () => {
  const [worker, api, client] = await Promise.all([
    readFile(new URL("../cloudflare/pilot-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../cloudflare/experience-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/production/api-client.ts", import.meta.url), "utf8"),
  ]);
  assert.match(worker, /x-navigate-experience/);
  assert.match(client, /"x-navigate-experience"/);
  assert.match(api, /request\.headers\.get\("x-navigate-experience"\) !== experienceKey/);
  assert.match(api, /const isCreator = membership\.roles\.includes\("creator"\)/);
  assert.match(api, /analyticsOrganizationIds = activeOrganizationIds\.filter\(\(organizationId\) => isCreator \|\|/);
  for (const family of ["/api/platform/", "/api/oaca/", "/api/genesis/"]) assert.match(worker + api, new RegExp(family.replaceAll("/", "\\/")));
  for (const endpoint of ["/api/platform/affiliations", "/api/platform/workspace-preference", "/api/oaca/events", "/api/oaca/events/attendance", "/api/oaca/events/check-in", "/api/oaca/event-imports", "/api/oaca/event-notifications", "/api/oaca/event-messages", "/api/platform/push-subscriptions", "/api/oaca/campaigns", "/api/oaca/nudges", "/api/oaca/forms/respond", "/api/genesis/access-requests/decide", "/api/genesis/events/submit", "/api/genesis/events/decision", "/api/genesis/calendar"]) assert.match(api, new RegExp(endpoint.replaceAll("/", "\\/")));
});

test("Compass is the published application identity and Creator Preview remains directly accessible", async () => {
  const [layout, appPage, signIn] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/production-pilot-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /applicationName: "Compass"/);
  assert.match(layout, /default: "Compass"/);
  assert.doesNotMatch(layout, /template: "%s \| Navigate"/);
  assert.match(appPage, /absolute: "Compass"/);
  assert.match(signIn, /href="\/app\?preview=creator"/);
  assert.match(signIn, /Explore the Creator Preview/);
});

test("phone-first pilot screens include the required privacy and approval guardrails", async () => {
  const [hub, oaca, engagement, genesis, worksheet, eventWorkspace, signInSource, styles, shell, assetUrl] = await Promise.all([
    readFile(new URL("../app/production/navigate-hub-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/oaca-compass-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/oaca-engagement-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/genesis-impact-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/oaca-worksheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/oaca-event-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/production-pilot-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/production/compass-platform-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/asset-url.ts", import.meta.url), "utf8"),
  ]);
  const signIn = signInSource.slice(signInSource.indexOf("export function SignIn"), signInSource.indexOf("export function MfaGate"));
  assert.doesNotMatch(signIn, /One Roseman account|Three experiences\. One sign-in\.|Your roles determine which separate workspaces appear/);
  assert.match(signIn, /Compass/);
  assert.doesNotMatch(signIn, /Available Roseman experiences|Navigate the Pathway<|Impact Studio</);
  assert.doesNotMatch(signIn, /OACA Compass/);
  assert.doesNotMatch(signIn, /GENESIS/);
  assert.doesNotMatch(signIn, /ExperienceGraphic/);
  assert.match(signIn, /Roseman Microsoft SSO/);
  assert.match(signIn, /Coming soon/);
  assert.match(signIn, /Sign-in is taking too long/);
  assert.doesNotMatch(signIn, /navigate-pathway-mark/);
  assert.match(signIn, /compass-emblem-v2\.png/);
  assert.match(signIn, /Roseman University student support/);
  assert.match(signIn, /Advising <span>·<\/span> Tutoring <span>·<\/span> Events/);
  assert.match(hub, /Opening your authorized workspace/);
  assert.match(hub, /defaultWorkspaceFor/);
  assert.match(hub, /access is pending administrator approval/i);
  assert.match(oaca, /Required milestones are reminders, not limits/);
  assert.match(oaca, /Schedule for a student/);
  assert.match(oaca, /Current agreement acknowledged/);
  assert.match(oaca, /Protected staff working notes/);
  assert.match(oaca, /student-facing recap/i);
  assert.match(oaca, /Secure data imports/);
  assert.match(oaca, /OacaImportCenter/);
  assert.match(oaca, /Request an Appointment/);
  assert.match(oaca, /Reason for visit/);
  assert.match(oaca, /General advising/);
  assert.match(oaca, /Academic drop-in/);
  assert.match(oaca, /up to two drop-in visits per academic block/);
  assert.match(oaca, /You will receive a notification when your appointment is confirmed/);
  assert.match(oaca, /<strong>Request<\/strong>/);
  assert.match(oaca, /<strong>Confirm<\/strong>/);
  assert.match(oaca, /<strong>Meet<\/strong>/);
  assert.match(oaca, /Rebook/);
  assert.match(oaca, />Later</);
  assert.match(oaca, /Creator pilot activity/);
  assert.match(oaca, /navigate\.creator\.compass-time\.v1/);
  assert.match(oaca, /key=\{previewPersona \|\| context\.userId\}/);
  assert.match(genesis, /key=\{previewPersona \|\| context\.userId\}/);
  assert.match(shell, /navigate\.creator\.preview-time\.v2/);
  assert.doesNotMatch(assetUrl, /document\.baseURI/);
  assert.match(oaca, /rucom-logo-white\.svg/);
  assert.match(oaca, /<strong>Compass<\/strong>/);
  assert.doesNotMatch(oaca, /<strong>OACA Compass<\/strong>/);
  assert.doesNotMatch(oaca, /Policies are mapped for sandbox validation/);
  assert.doesNotMatch(oaca, /<a href="\/app">All experiences<\/a>/);
  assert.match(oaca, /Appointment nudges/);
  assert.match(engagement, /<h1>Notifications<\/h1>/);
  assert.doesNotMatch(engagement, /Updates that need your attention/);
  assert.ok(engagement.indexOf('part="inbox"') < engagement.indexOf('part="settings"'));
  assert.match(eventWorkspace, /Run the room from one place/);
  assert.match(eventWorkspace, /Register \+ present/);
  assert.match(eventWorkspace, /permanent, identifier-free code/);
  assert.match(eventWorkspace, /Compass notifications/);
  assert.match(eventWorkspace, /Notification preferences and quiet hours/);
  assert.match(genesis, /Not yet available/);
  assert.match(genesis, /immutable/);
  assert.match(genesis, /dual-approved events reach the Impact calendar/i);
  assert.match(genesis, /Verify interest-group affiliations/);
  assert.match(genesis, /Every active Community Liaison/);
  assert.match(worksheet, /contains no name, email, or student identifier/i);
  assert.match(styles, /min-height:44px/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /@media print/);
});

test("the print-ready OACA worksheet ships as a valid one-page PDF artifact", async () => {
  const url = new URL("../public/resources/oaca-compass-visit-worksheet.pdf", import.meta.url);
  const [bytes, details] = await Promise.all([readFile(url), stat(url)]);
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  assert.ok(details.size > 2500);
  assert.match(bytes.toString("latin1"), /\/Count 1/);
});

test("the secure OACA import template ships as an Excel workbook", async () => {
  const url = new URL("../public/resources/oaca-compass-data-import-template.xlsx", import.meta.url);
  const [bytes, details] = await Promise.all([readFile(url), stat(url)]);
  assert.deepEqual([...bytes.subarray(0, 2)], [0x50, 0x4b]);
  assert.ok(details.size > 10000);
});
