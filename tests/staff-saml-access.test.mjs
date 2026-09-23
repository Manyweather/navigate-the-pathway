import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { testDatabase } from "./workspace-database.mjs";

let db;
const org=id(),program=id(),gmail=id(),roseman=id(),other=id(),roster=id(),provider=id();

before(async()=>{
  db=await testDatabase();
  await db.query("insert into public.organizations(id,name,slug) values($1,'Roseman','roseman')",[org]);
  await db.query("insert into public.programs(id,organization_id,name,slug) values($1,$2,'Medicine','medicine')",[program,org]);
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'creator@gmail.test',now()),($2,'creator@roseman.edu',now()),($3,'other@roseman.edu',now())",[gmail,roseman,other]);
  await db.query("insert into public.profiles(user_id,display_name,active_organization_id,active_program_id,status) values($1,'Creator recovery',$2,$3,'active')",[gmail,org,program]);
  await db.query("insert into public.role_assignments(user_id,role,organization_id,program_id,granted_by) values($1,'administrator',$2,$3,$1)",[gmail,org,program]);
  for(const capability of ['platform.creator','accounts.manage']) await db.query("insert into public.permission_assignments(user_id,permission_key,organization_id,program_id,granted_by) values($1,$2,$3,$4,$1)",[gmail,capability,org,program]);
  await db.query("insert into public.principal_assignments(user_id,principal_type,organization_id,program_id,designated_by) values($1,'creator',$2,$3,$1)",[gmail,org,program]);
  await db.query("insert into public.pilot_staff_roster_entries(id,organization_id,program_id,email,display_name,roles,workspace_roles,approved_by) values($1,$2,$3,'creator@roseman.edu','Roseman Creator',array['administrator','creator'],'{\"oaca\":[\"creator\"],\"pathway\":[\"creator\"]}',$4)",[roster,org,program,gmail]);
  await db.query("insert into public.pilot_pending_sso_identities(auth_user_id,email,sso_provider_id) values($1,'creator@roseman.edu',$2),($3,'other@roseman.edu',$2)",[roseman,provider,other]);
});
after(async()=>{await db?.close();});

test('pending SAML identity requires an exact approved roster row',async()=>{
  await assert.rejects(db.query("select public.pilot_approve_sso_identity($1,$2,$3)",[other,roster,gmail]),/exactly match/i);
  assert.equal((await db.query("select count(*)::int count from public.profiles where user_id=$1",[other])).rows[0].count,0);
});

test('Creator approval provisions the profile and workspace roles atomically',async()=>{
  const approved=(await db.query("select public.pilot_approve_sso_identity($1,$2,$3) result",[roseman,roster,gmail])).rows[0].result;
  assert.equal(approved.status,'approved');
  assert.equal((await db.query("select status from public.profiles where user_id=$1",[roseman])).rows[0].status,'active');
  const memberships=(await db.query("select experience_key,role from public.experience_role_assignments where user_id=$1 and revoked_at is null",[roseman])).rows;
  assert.ok(memberships.some(item=>item.experience_key==='oaca'&&item.role==='creator'));
  assert.ok(memberships.some(item=>item.experience_key==='pathway'&&item.role==='creator'));
});

test('exact SAML provider satisfies the database MFA gate while another provider does not',async()=>{
  await db.query("insert into public.pilot_auth_configuration(singleton,roseman_sso_provider_id,trust_roseman_saml_as_mfa) values(true,$1,true) on conflict(singleton) do update set roseman_sso_provider_id=excluded.roseman_sso_provider_id,trust_roseman_saml_as_mfa=true",[provider]);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({aal:'aal1',amr:[{method:'sso/saml',provider}]})]);
  assert.equal((await db.query("select public.staff_mfa_verified() ok")).rows[0].ok,true);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({aal:'aal1',amr:[{method:'sso/saml',provider:id()}]})]);
  assert.equal((await db.query("select public.staff_mfa_verified() ok")).rows[0].ok,false);
});

test('canonical Creator merge transfers ownership and leaves one active Creator permission',async()=>{
  const result=(await db.query("select public.pilot_merge_canonical_accounts($1,$2,$3,'backup-verified') result",[roseman,gmail,gmail])).rows[0].result;
  assert.equal(result.merged,true); assert.equal(result.oneCreatorVerified,true);
  assert.equal((await db.query("select count(*)::int count from public.permission_assignments where organization_id=$1 and permission_key='platform.creator' and revoked_at is null",[org])).rows[0].count,1);
  assert.equal((await db.query("select user_id from public.principal_assignments where organization_id=$1 and principal_type='creator' and revoked_at is null",[org])).rows[0].user_id,roseman);
  assert.equal((await db.query("select canonical_user_id from public.account_auth_identities where auth_user_id=$1",[gmail])).rows[0].canonical_user_id,roseman);
});

