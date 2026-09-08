import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { randomUUID as id } from "node:crypto";
import { testDatabase, act } from "./workspace-database.mjs";
let db;
const org = id(),
  program = id(),
  creator = id();
before(async () => {
  db = await testDatabase();
  await db.query(
    "insert into public.organizations(id,name,slug) values($1,'Merge test','merge-test')",
    [org],
  );
  await db.query(
    "insert into public.programs(id,organization_id,name,slug) values($1,$2,'Merge test','merge-test')",
    [program, org],
  );
  await user(creator, "creator@example.test");
  for (const cap of ["platform.creator", "accounts.manage"])
    await db.query(
      "insert into public.permission_assignments(user_id,permission_key,organization_id,program_id,granted_by) values($1,$2,$3,$4,$1)",
      [creator, cap, org, program],
    );
});
after(async () => db?.close());
async function user(uid, email) {
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
    [uid, email],
  );
  await db.query(
    "insert into public.profiles(user_id,display_name,active_organization_id,active_program_id,status) values($1,'Merge fixture',$2,$3,'active')",
    [uid, org, program],
  );
  await db.query(
    "insert into public.role_assignments(user_id,role,organization_id,program_id,granted_by) values($1,'student',$2,$3,$1)",
    [uid, org, program],
  );
}
const preview = async (a, b) =>
  (
    await db.query("select public.pathway_merge_preview($1,$2,$3) result", [
      a,
      b,
      creator,
    ])
  ).rows[0].result;
const merge = async (a, b) =>
  (
    await db.query(
      "select public.pathway_merge_accounts($1,$2,$3,'fictional-restore-verified') result",
      [a, b, creator],
    )
  ).rows[0].result;
async function survey(uid, waveId = null) {
  const version = id(),
    consent = id(),
    wave = waveId || id(),
    assignment = id();
  if (!waveId) {
    await db.query(
      "insert into evaluation.instrument_versions(id,instrument_id,version_label,source_reference) select $1,id,$2,'fixture' from evaluation.instrument_definitions limit 1",
      [version, id()],
    );
    await db.query(
      "insert into evaluation.consent_versions(id,organization_id,program_id,title,body,version_label) values($1,$2,$3,'Fixture','Fixture','1')",
      [consent, org, program],
    );
    await db.query(
      "insert into evaluation.waves(id,organization_id,program_id,instrument_version_id,consent_version_id,label,audience,created_by) values($1,$2,$3,$4,$5,'Fixture','student',$6)",
      [wave, org, program, version, consent, creator],
    );
  }
  await db.query(
    "insert into evaluation.assignments(id,wave_id,user_id,organization_id,program_id) values($1,$2,$3,$4,$5)",
    [assignment, wave, uid, org, program],
  );
  return { assignment, wave, version };
}

test("Gmail primary merge resolves both emails and extra sign-ins, preserves files, surveys and authorship", async () => {
  const a = id(),
    b = id(),
    alias = id();
  await user(a, "bmanyweather1@gmail.com");
  await user(b, "bmanyweather@roseman.edu");
  await db.query(
    "insert into auth.users(id,email) values($1,'additional@example.test')",
    [alias],
  );
  await db.query(
    "update public.account_auth_identities set canonical_user_id=$1,is_primary=false where auth_user_id=$2",
    [b, alias],
  );
  const artifact = id();
  await db.query(
    "insert into public.artifacts(id,student_id,organization_id,program_id,station,artifact_type,title,content) values($1,$2,$3,$4,'evidence','experience','Fixture','{}')",
    [artifact, b, org, program],
  );
  const s = await survey(b),
    response = id();
  await db.query(
    "insert into evaluation.response_sets(id,assignment_id,user_id,instrument_version_id,status,submitted_at) values($1,$2,$3,$4,'submitted',now())",
    [response, s.assignment, b, s.version],
  );
  assert.equal((await preview(a, b)).ready, true);
  assert.equal((await merge(a, b)).merged, true);
  const identities = (
    await db.query(
      "select auth_user_id,canonical_user_id,is_primary from public.account_auth_identities where canonical_user_id=$1",
      [a],
    )
  ).rows;
  assert.equal(identities.length, 3);
  assert.equal(identities.find((x) => x.is_primary).auth_user_id, a);
  for (const login of [a, b, alias]) {
    await act(db, login, "appointments");
    assert.equal(
      (await db.query("select public.current_profile_user_id() id")).rows[0].id,
      a,
    );
    assert.equal(
      (
        await db.query("select public.portfolio_object_is_owned($1) ok", [
          alias + "/portfolio/cv.pdf",
        ])
      ).rows[0].ok,
      true,
    );
  }
  assert.equal(
    (
      await db.query("select student_id from public.artifacts where id=$1", [
        artifact,
      ])
    ).rows[0].student_id,
    a,
  );
  assert.equal(
    (
      await db.query("select user_id from evaluation.assignments where id=$1", [
        s.assignment,
      ])
    ).rows[0].user_id,
    a,
  );
  assert.equal(
    (
      await db.query(
        "select user_id from evaluation.response_sets where id=$1",
        [response],
      )
    ).rows[0].user_id,
    b,
  );
  assert.equal(
    (
      await db.query(
        "select count(*) n from auth.users where id=any($1::uuid[])",
        [[a, b, alias]],
      )
    ).rows[0].n,
    3,
  );
  assert.equal((await preview(a, b)).ready, false);
});
test("survey conflicts block before touching identities and records", async () => {
  const a = id(),
    b = id();
  await user(a, id() + "@example.test");
  await user(b, id() + "@example.test");
  const s = await survey(a);
  await survey(b, s.wave);
  assert.match(JSON.stringify((await preview(a, b)).issues), /survey wave/);
  await assert.rejects(merge(a, b), /Merge blocked/);
  assert.equal(
    (
      await db.query(
        "select canonical_user_id from public.account_auth_identities where auth_user_id=$1",
        [b],
      )
    ).rows[0].canonical_user_id,
    b,
  );
});
test("duplicate role rows survive safely and any late failure rolls the transaction back", async () => {
  const a = id(),
    b = id();
  await user(a, id() + "@example.test");
  await user(b, id() + "@example.test");
  await db.exec(
    "create function public.test_block_merge() returns trigger language plpgsql as $$begin raise exception 'Injected failure'; end$$; create trigger test_block_merge before update on public.profiles for each row execute function public.test_block_merge();",
  );
  await assert.rejects(merge(a, b), /Injected failure/);
  assert.equal(
    (
      await db.query(
        "select canonical_user_id from public.account_auth_identities where auth_user_id=$1",
        [b],
      )
    ).rows[0].canonical_user_id,
    b,
  );
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.pathway_account_merges where secondary_user_id=$1",
        [b],
      )
    ).rows[0].n,
    0,
  );
  await db.exec(
    "drop trigger test_block_merge on public.profiles; drop function public.test_block_merge()",
  );
  await merge(a, b);
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.role_assignments where user_id=$1",
        [a],
      )
    ).rows[0].n,
    1,
  );
});
