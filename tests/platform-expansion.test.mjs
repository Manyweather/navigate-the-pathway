import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  acceptedUploadTypes,
  canTransitionOacaAppointment,
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

test("Navigate exposes three isolated experience destinations", () => {
  assert.deepEqual(Object.keys(experiences), ["pathway", "oaca", "genesis"]);
  assert.equal(experiences.pathway.href, "/app/pathway");
  assert.equal(experiences.oaca.href, "/app/oaca");
  assert.equal(experiences.genesis.href, "/app/genesis");
  for (const role of ["faculty", "staff", "administrator", "creator", "principal_investigator", "mentor", "community_liaison"]) assert.equal(staffMfaRoles.has(role), true);
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
  const [foundation, catalog, actions, oacaPolicies, oacaImports, oacaOutreach, eventOperations, affiliations] = await Promise.all([
    readFile(new URL("../supabase/migrations/202609100001_three_experience_platform.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100002_genesis_organization_catalog.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100003_experience_vertical_slice_actions.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100005_oaca_policy_operations.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100006_oaca_secure_data_ingestion.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100007_oaca_events_outreach.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100008_oaca_event_operations.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609100009_student_affiliations_platform_creator.sql", import.meta.url), "utf8"),
  ]);
  assert.match(foundation, /insert into public\.experience_role_assignments[\s\S]*from public\.role_assignments/i);
  assert.match(foundation, /public\.current_profile_user_id\(\)/);
  assert.match(foundation, /prevent_genesis_snapshot_changes/);
  assert.match(foundation, /create policy oaca_messages_participants/);
  assert.doesNotMatch(foundation, /oaca_messages.*administrator/i);
  assert.doesNotMatch(foundation + catalog + actions + oacaPolicies + oacaImports + oacaOutreach + eventOperations + affiliations, /\b(drop table|truncate|delete from public\.profiles|alter table public\.role_assignments drop)\b/i);
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
  for (const family of ["/api/platform/", "/api/oaca/", "/api/genesis/"]) assert.match(worker + api, new RegExp(family.replaceAll("/", "\\/")));
  for (const endpoint of ["/api/platform/affiliations", "/api/oaca/events", "/api/oaca/events/attendance", "/api/oaca/events/check-in", "/api/oaca/event-imports", "/api/oaca/event-notifications", "/api/oaca/event-messages", "/api/platform/push-subscriptions", "/api/oaca/campaigns", "/api/oaca/nudges", "/api/oaca/forms/respond"]) assert.match(api, new RegExp(endpoint.replaceAll("/", "\\/")));
});

test("phone-first pilot screens include the required privacy and approval guardrails", async () => {
  const [hub, oaca, genesis, worksheet, eventWorkspace, signInSource, styles] = await Promise.all([
    readFile(new URL("../app/production/navigate-hub-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/oaca-compass-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/genesis-impact-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/oaca-worksheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/oaca-event-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/production/production-pilot-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const signIn = signInSource.slice(signInSource.indexOf("export function SignIn"), signInSource.indexOf("export function MfaGate"));
  assert.match(signIn, /Three experiences\. One sign-in\./);
  for (const experience of ["OACA Compass", "Navigate the Pathway", "GENESIS Impact Studio"]) assert.match(signIn, new RegExp(experience));
  assert.match(signIn, /Roseman Microsoft SSO is coming soon/);
  assert.match(signIn, /Sign-in is taking too long/);
  assert.doesNotMatch(signIn, /navigate-pathway-mark/);
  assert.match(hub, /only|active/);
  assert.match(hub, /Student Council/);
  assert.match(hub, /same Roseman directory used in GENESIS/);
  assert.match(oaca, /Required milestones are reminders, not limits/);
  assert.match(oaca, /Schedule for a student/);
  assert.match(oaca, /Current agreement acknowledged/);
  assert.match(oaca, /Protected staff working notes/);
  assert.match(oaca, /student-facing recap/i);
  assert.match(oaca, /Secure data imports/);
  assert.match(oaca, /OacaImportCenter/);
  assert.match(oaca, /Events and updates/);
  assert.match(oaca, /Appointment nudges/);
  assert.match(eventWorkspace, /Run the room from one place/);
  assert.match(eventWorkspace, /Register \+ present/);
  assert.match(eventWorkspace, /Create 5-minute code/);
  assert.match(eventWorkspace, /Compass notifications/);
  assert.match(eventWorkspace, /Notification preferences and quiet hours/);
  assert.match(genesis, /Not yet available/);
  assert.match(genesis, /immutable/);
  assert.match(genesis, /mentor and liaison approvals are both recorded/i);
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
