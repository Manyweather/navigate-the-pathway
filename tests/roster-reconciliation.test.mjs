import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import { testDatabase } from './workspace-database.mjs';

test('roster edits replace access, email changes deny it, and revocation preserves history', async () => {
  const db = await testDatabase();
  try {
    const org=id(), admin=id(), staff=id(), roster=id(), provider=id();
    await db.query("insert into public.organizations(id,name,slug) values($1,'Example','example')",[org]);
    await db.query("insert into auth.users(id,email) values($1,'admin@roseman.edu'),($2,'staff@roseman.edu')",[admin,staff]);
    await db.query("insert into public.profiles(user_id,display_name,active_organization_id,status) values($1,'Creator',$2,'active')",[admin,org]);
    await db.query("insert into public.permission_assignments(user_id,permission_key,organization_id,granted_by) values($1,'platform.creator',$2,$1)",[admin,org]);
    await db.query("insert into public.pilot_staff_roster_entries(id,organization_id,email,display_name,roles,workspace_roles,view_bundle,approved_by) values($1,$2,'staff@roseman.edu','Staff',array['advisor'],'{\"oaca\":[\"advisor\"],\"pathway\":[\"staff\"]}','{\"capabilities\":[\"oaca.advisor.academic\"]}',$3)",[roster,org,admin]);
    await db.query("insert into public.pilot_pending_sso_identities(auth_user_id,email,sso_provider_id) values($1,'staff@roseman.edu',$2)",[staff,provider]);
    await db.query('select public.pilot_approve_sso_identity($1,$2,$3)',[staff,roster,admin]);
    const active = async () => (await db.query('select experience_key,role from public.experience_role_assignments where user_id=$1 and revoked_at is null',[staff])).rows;
    assert.equal((await active()).length,2);
    await db.query("update public.pilot_staff_roster_entries set roles='{}',workspace_roles='{\"facilities\":[\"requester\"]}',view_bundle='{}' where id=$1",[roster]);
    assert.deepEqual(await active(),[{experience_key:'facilities',role:'requester'}]);
    assert.equal((await db.query('select count(*)::int n from public.experience_capability_assignments where user_id=$1 and revoked_at is null',[staff])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from public.role_assignments where user_id=$1 and revoked_at is null',[staff])).rows[0].n,0);
    await db.query("update public.pilot_staff_roster_entries set email='changed@roseman.edu' where id=$1",[roster]);
    assert.deepEqual(await active(),[]);
    await db.query("update public.pilot_staff_roster_entries set email='staff@roseman.edu' where id=$1",[roster]);
    assert.equal((await active()).length,1);
    await db.query("update public.pilot_staff_roster_entries set status='revoked' where id=$1",[roster]);
    assert.deepEqual(await active(),[]);
    assert.equal((await db.query('select count(*)::int n from public.experience_role_assignments where user_id=$1',[staff])).rows[0].n,3);
    assert.ok((await db.query("select count(*)::int n from public.audit_events where event_type='roster_grants_reconciled' and subject_id=$1",[roster])).rows[0].n>=4);
  } finally { await db.close(); }
});
