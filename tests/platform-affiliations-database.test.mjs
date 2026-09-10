import assert from "node:assert/strict";
import test from "node:test";
import { testDatabase } from "./workspace-database.mjs";

const university = "40000000-0000-4000-8000-000000000001";
const student = "40000000-0000-4000-8000-000000000002";
const otherStudent = "40000000-0000-4000-8000-000000000003";
const creator = "40000000-0000-4000-8000-000000000004";

async function asUser(db, userId, sql, params = [], aal = "aal2") {
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [userId, JSON.stringify({ sub: userId, aal })]);
  await db.exec("set role authenticated");
  try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
}

test("student affiliations stay self-owned while Creator access spans every experience", async () => {
  const db = await testDatabase("202609100009");
  try {
    await db.exec(`
      insert into public.organizations(id,name,slug) values('${university}','Roseman University','roseman-affiliations');
      insert into auth.users(id,email,email_confirmed_at) values
        ('${student}','student@roseman.edu',now()),
        ('${otherStudent}','other@roseman.edu',now()),
        ('${creator}','creator@roseman.edu',now());
      insert into public.profiles(user_id,display_name,status,active_organization_id) values
        ('${student}','Student','active','${university}'),
        ('${otherStudent}','Other Student','active','${university}'),
        ('${creator}','Platform Creator','active','${university}');
      insert into public.experience_role_assignments(user_id,experience_key,role,organization_id) values
        ('${student}','oaca','student','${university}'),
        ('${otherStudent}','oaca','student','${university}');
    `);
    const catalog = await db.query("select id from public.genesis_organizations where college='College of Medicine' order by name limit 2");
    const organizationIds = catalog.rows.map((row) => row.id);
    const saved = await asUser(db, student, "select public.platform_save_student_affiliations($1::jsonb) result", [JSON.stringify({ organizationIds, studentCouncil: true })]);
    assert.deepEqual(saved.rows[0].result, { interestGroupCount: 2, studentCouncil: true });
    const own = await asUser(db, student, "select affiliation_type,organization_id,designation from public.platform_student_affiliations order by affiliation_type,organization_id");
    assert.equal(own.rows.length, 3);
    assert.equal(own.rows.some((row) => row.affiliation_type === "student_council" && row.designation === "student_council"), true);
    const hidden = await asUser(db, otherStudent, "select count(*)::int count from public.platform_student_affiliations where student_id=$1", [student]);
    assert.equal(hidden.rows[0].count, 0);
    await assert.rejects(() => asUser(db, student, "select public.platform_save_student_affiliations($1::jsonb)", [JSON.stringify({ organizationIds: ["00000000-0000-4000-8000-000000000099"], studentCouncil: false })]), /current Roseman directory/i);

    await db.query("insert into public.permission_assignments(user_id,permission_key,organization_id,granted_by) values($1,'platform.creator',$2,$1)", [creator, university]);
    const roles = await db.query("select experience_key,role from public.experience_role_assignments where user_id=$1 and revoked_at is null order by experience_key,role", [creator]);
    assert.deepEqual(roles.rows, [
      { experience_key: "genesis", role: "administrator" },
      { experience_key: "genesis", role: "creator" },
      { experience_key: "oaca", role: "administrator" },
      { experience_key: "oaca", role: "creator" },
      { experience_key: "pathway", role: "creator" },
    ]);
    const genesisScope = await db.query("select count(*)::int count from public.genesis_organization_memberships where user_id=$1 and role='administrator' and status='approved'", [creator]);
    assert.equal(genesisScope.rows[0].count, 20);
    const memberships = await asUser(db, creator, "select public.current_experience_memberships() result");
    assert.deepEqual(memberships.rows[0].result.map((item) => item.experienceKey), ["pathway", "oaca", "genesis"]);
    for (const membership of memberships.rows[0].result) assert.equal(membership.roles.includes("creator"), true);
  } finally { await db.close(); }
});
