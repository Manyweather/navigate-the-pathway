import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { assignedModes, modeContext, modeAllowsPath, surveysForAudience } from '../app/production/dashboard-mode.ts';
import { AppHeader } from '../app/production/production-pilot-app.tsx';
import { pilotAccountTestHelpers } from '../cloudflare/pilot-api.ts';
const context={userId:'primary',displayName:'Test',roles:['student','advisor','administrator'],principalType:'creator',capabilities:['platform.creator','accounts.manage','program.configure','evaluation.identifiable_results'],aal:'aal2'};
test('dashboard switching reduces visible privileges and privileged API routes',()=>{
 assert.deepEqual(assignedModes(context),['creator','student','advisor','administrator']);
 for(const role of ['student','advisor']){const effective=modeContext(context,role);assert.equal(effective.principalType,null);assert.deepEqual(effective.capabilities,[]);assert.deepEqual(effective.roles,[role]);for(const path of ['/api/governance/account-identities/merge','/api/admin/accounts','/api/workspace/access_update','/api/evaluation/summary'])assert.equal(modeAllowsPath(role,path,'POST'),false);}
 assert.equal(modeAllowsPath('administrator','/api/governance/requests','GET'),false);
 assert.equal(modeAllowsPath('creator','/api/governance/requests','GET'),true);
 assert.equal(modeAllowsPath('principal_investigator','/api/admin/accounts','POST'),true);
});
test('shared tools appear between the brand and account and student mode omits administrative tools',()=>{
 const html=renderToStaticMarkup(createElement(AppHeader,{context,role:'student',api:{},onRole(){},onReview(){},onSignOut(){}}));
 for(const label of ['Notifications','Calendar','Appointments','Messages','Support'])assert.match(html,new RegExp('aria-label="'+label+'"'));
 assert.ok(html.indexOf('Portal tools')>html.indexOf('Navigate The Pathway'));
 assert.ok(html.indexOf('Portal tools')<html.indexOf('production-account'));
 assert.doesNotMatch(html,/Roster import|Access controls|Page views|Program tools/);
 const creator=renderToStaticMarkup(createElement(AppHeader,{context,role:'creator',api:{},onRole(){},onReview(){},onSignOut(){}})); assert.match(creator,/Account|Program tools/);assert.match(creator,/Roster import/);
});
test('student surveys exclude ACCS and advisor MacLeod without hiding distinct waves or submission dates',()=>{
 const rows=[{id:'a',instrumentSlug:'macleod-clark-professional-identity-scale',waveId:'baseline',waveLabel:'Baseline',status:'submitted',submittedAt:'2026-09-08T21:00:00Z'}, {id:'b',instrumentSlug:'macleod-clark-professional-identity-scale-advisor',audience:'advisor',waveLabel:'Baseline'}, {id:'c',instrumentSlug:'advisor-coaching-competency-scale',audience:'student',waveLabel:'Baseline'}];
 const result=surveysForAudience([...rows,{...rows[0],id:'duplicate',status:'not_started'},{...rows[0],id:'next',waveId:'final'}],'student');
 assert.deepEqual(result.map(r=>r.id),['a','next']);assert.equal(result[0].submittedAt,rows[0].submittedAt);
 assert.deepEqual(surveysForAudience(rows,'advisor').map(r=>r.id),['b','c']);
});
test('merged sign-in aliases collapse into one student and historical activity follows the primary profile',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>{
 const path=new URL(url).pathname;
 if(path==='/rest/v1/role_assignments')return Response.json([{user_id:'primary',role:'student'},{user_id:'secondary',role:'student'}]);
 if(path==='/rest/v1/profiles')return Response.json([{user_id:'primary',display_name:'Primary',status:'active'},{user_id:'secondary',display_name:'Old',status:'archived'}]);
 if(path==='/auth/v1/admin/users')return Response.json({users:[{id:'primary',email:'one@example.test'},{id:'secondary',email:'two@example.test',last_sign_in_at:'2026-09-08T12:00:00Z'}]});
 if(path==='/rest/v1/account_auth_identities')return Response.json([{auth_user_id:'primary',canonical_user_id:'primary',email:'one@example.test',is_primary:true},{auth_user_id:'secondary',canonical_user_id:'primary',email:'two@example.test',is_primary:false}]);
 if(path==='/rest/v1/audit_events' && options.method==='POST')return new Response(null,{status:204});
 if(path==='/rest/v1/audit_events')return Response.json([{actor_id:'secondary',subject_id:'session',event_type:'user_session_opened',created_at:'2026-09-08T12:00:00Z',metadata:{role:'student'}}]);
 return Response.json([]);
 };
 try {const result=await pilotAccountTestHelpers.adminUserAccessLog({SUPABASE_URL:'https://test.invalid'}, {id:'primary',aal:'aal2',sessionId:'current'}, {...context,activeOrganizationId:'org'});assert.equal(result.students.length,1);assert.equal(result.people.length,1);assert.deepEqual(result.students[0].secondaryEmails,['two@example.test']);assert.equal(result.sessions[0].userId,'primary');assert.equal(result.students[0].lastAuthSignInAt,'2026-09-08T12:00:00Z');}finally{globalThis.fetch=original;}
});
