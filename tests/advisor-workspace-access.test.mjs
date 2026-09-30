import test from 'node:test';
import assert from 'node:assert/strict';
import { experienceRoute } from '../cloudflare/experience-api.ts';

function services(roles,capabilities,mode,mfaSatisfied=true) {
  const calls=[];
  return {calls,user:{id:'staff',aal:'aal1',mfaSatisfied,mode},
    rpc:async(name)=>{calls.push(name);return name==='current_experience_memberships'?[{experienceKey:'oaca',status:'active',featureEnabled:true,roles,capabilities}]:{};},
    context:async()=>({}),service:async()=>[],audit:async()=>{}};
}
function request(workspace) {return new Request(`https://compass.test/api/oaca/advisor/bootstrap?workspace=${workspace}`,{headers:{'x-navigate-experience':'oaca'}});}

test('advisor service choices are enforced before the database RPC',async()=>{
  const academic=services(['advisor'],['oaca.advisor.academic'],'advisor');
  assert.equal((await experienceRoute(request('academic'),academic)).status,200);
  await assert.rejects(experienceRoute(request('career'),academic),/capability/);
  const career=services(['advisor'],['oaca.advisor.career'],'advisor');
  assert.equal((await experienceRoute(request('career'),career)).status,200);
  await assert.rejects(experienceRoute(request('academic'),career),/capability/);
});
test('Creator Advisor mode is limited to academic; Creator mode retains broader access',async()=>{
  assert.equal((await experienceRoute(request('academic'),services(['creator'],[],'advisor'))).status,200);
  await assert.rejects(experienceRoute(request('career'),services(['creator'],[],'advisor')),/Creator or Administrator view/);
  assert.equal((await experienceRoute(request('career'),services(['creator'],[],'creator'))).status,200);
});
test('an unverified staff session cannot read advisor data',async()=>{
  const denied=services(['advisor'],['oaca.advisor.academic'],'advisor',false);
  await assert.rejects(experienceRoute(request('academic'),denied),/second factor/);
  assert.ok(!denied.calls.includes('oaca_advisor_workspace'));
});
