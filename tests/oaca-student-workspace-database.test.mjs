import assert from "node:assert/strict";
import test from "node:test";
import { testDatabase } from "./workspace-database.mjs";

const org = "61000000-0000-4000-8000-000000000001";
const admin = "61000000-0000-4000-8000-000000000002";
const first = "61000000-0000-4000-8000-000000000003";
const second = "61000000-0000-4000-8000-000000000004";

async function asUser(db, userId, sql, params = []) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [userId, JSON.stringify({ sub: userId, aal: "aal2" })]);
  await db.exec("set role authenticated");
  try { return await db.query(sql, params); }
  finally { await db.exec("reset role"); }
}

test("student event registration is idempotent and cancellation promotes the waitlist", async () => {
  const db = await testDatabase("202609110006");
  try {
    await db.exec("create function public.digest(value text, algorithm text) returns bytea language sql immutable as $$select decode(md5(value)||md5(value||'x'),'hex')$$");
    await db.exec(`
      insert into public.organizations(id,name,slug) values('${org}','Roseman University','compass-student-workspace');
      insert into auth.users(id,email,email_confirmed_at) values
        ('${admin}','events-admin@roseman.edu',now()),
        ('${first}','first-student@roseman.edu',now()),
        ('${second}','second-student@roseman.edu',now());
      insert into public.profiles(user_id,display_name,status,active_organization_id) values
        ('${admin}','Event Administrator','active','${org}'),
        ('${first}','First Student','active','${org}'),
        ('${second}','Second Student','active','${org}');
      insert into public.experience_role_assignments(user_id,experience_key,role,organization_id) values
        ('${admin}','oaca','administrator','${org}'),
        ('${first}','oaca','student','${org}'),
        ('${second}','oaca','student','${org}');
    `);

    const created = await asUser(db, admin, "select (saved).id id,(saved).status status,(saved).publication_error publication_error from (select public.oaca_create_event($1::jsonb) saved) created", [JSON.stringify({
      title: "Compass community lab",
      description: "Practice and connect.",
      category: "Community",
      accessibilityDetails: "Contact the host for access support.",
      publicCatalog: true,
      startsAt: "2030-10-01T18:00:00-07:00",
      endsAt: "2030-10-01T19:00:00-07:00",
      modality: "in_person",
      location: "Innovation Hall",
      capacity: 1,
      audience: { includeAllMembers: true },
      coordinatorUserIds: [admin],
      attendeeNotificationRules: [],
      coordinatorAlertRules: [],
      action: "publish",
    })]);
    const eventId = created.rows[0].id;
    assert.equal(created.rows[0].status, "published", created.rows[0].publication_error || "event should publish");

    const registered = await asUser(db, first, "select (public.oaca_register_event($1::jsonb)).status status", [JSON.stringify({ eventId })]);
    assert.equal(registered.rows[0].status, "registered");
    const repeated = await asUser(db, first, "select (public.oaca_register_event($1::jsonb)).status status", [JSON.stringify({ eventId })]);
    assert.equal(repeated.rows[0].status, "registered");
    const waitlisted = await asUser(db, second, "select (public.oaca_register_event($1::jsonb)).status status", [JSON.stringify({ eventId })]);
    assert.equal(waitlisted.rows[0].status, "waitlisted");

    const cancelled = await asUser(db, first, "select public.oaca_cancel_event_registration($1::jsonb) result", [JSON.stringify({ eventId })]);
    assert.equal(cancelled.rows[0].result.promoted, true);
    const promoted = await db.query("select status from public.oaca_event_registrations where event_id=$1 and student_id=$2", [eventId, second]);
    assert.equal(promoted.rows[0].status, "registered");
    const promotionNotice = await db.query("select category from public.platform_notifications where event_id=$1 and user_id=$2", [eventId, second]);
    assert.equal(promotionNotice.rows.some((row) => row.category === "waitlist_promotion"), true);

    const feed = await asUser(db, second, "select public.oaca_event_feed('{}'::jsonb) feed");
    const item = feed.rows[0].feed.find((candidate) => candidate.id === eventId);
    assert.equal(item.registrationStatus, "registered");
    assert.equal(item.category, "Community");
    assert.equal(item.accessibilityDetails, "Contact the host for access support.");
    assert.equal(item.publicCatalog, true);
  } finally {
    await db.close();
  }
});
