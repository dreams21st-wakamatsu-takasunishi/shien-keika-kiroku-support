import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createUnifiedLoginHandler} from '../supabase/functions/unified-login/handler.ts';
import {createStaffLoginHandler} from '../supabase/functions/staff-login/handler.ts';
const uuid='11111111-1111-4111-8111-111111111111',device='a'.repeat(64),code='TEST123456';
function fixture(patch={}){
 const calls=[],session={access_token:'fixture-access',refresh_token:'fixture-refresh'};
 const rows={organizations:{id:uuid,device_approval_enabled:true},recorder_profiles:{id:uuid,auth_user_id:uuid},profiles:{role:'staff',active:true},organization_devices:{id:uuid,status:'approved',device_kind:'facility_shared',owner_recorder_profile_id:null},...patch.rows};
 const service={rpc:async(name,args)=>{calls.push([name,args]);if(patch[name])return patch[name];return {data:name==='resolve_unified_login'?{method:patch.method||'staff',organizationCode:code}:name==='facility_privileged_email_required'?false:{schemaVersion:1,expiresAt:new Date(Date.now()+300000).toISOString(),staff:[{recorderId:uuid,displayName:'架空職員'}]},error:null};},
  from:table=>{
   const q={select(){return q;},eq(){return q;},ilike(){return q;},insert(){calls.push(['insert',table]);return q;},update(){calls.push(['update',table]);return q;},maybeSingle:async()=>({data:rows[table],error:null}),single:async()=>({data:rows[table],error:null}),then:resolve=>Promise.resolve({data:rows[table],error:null}).then(resolve)};return q;
  },auth:{admin:{getUserById:async()=>({data:{user:{id:uuid,email:'fixture@example.invalid'}},error:null})}}};
 const login={auth:{signInWithPassword:async args=>{calls.push(['password',args]);return patch.authError?{data:{session:null},error:{status:400}}:{data:{session},error:null};}}};
 return {calls,handle:createUnifiedLoginHandler(service,login),staff:createStaffLoginHandler(service,login)};
}
const request=(patch={})=>new Request('https://fixture.invalid/unified-login',{method:'POST',body:JSON.stringify({loginId:'staff001',password:'short6',deviceToken:device,organizationCode:code,...patch})});

test('email uses only password authentication, without organization lookup or facility fallback',async()=>{
 const {handle,calls}=fixture();const response=await handle(request({loginId:' manager@example.invalid ',organizationCode:''}));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).kind,'session');assert.deepEqual(calls,[['password',{email:'manager@example.invalid',password:'short6'}]]);
});
test('password failure never tries a second login method or returns account details',async()=>{
 for(const id of ['staff001','manager@example.invalid']){const {handle,calls}=fixture({authError:true});const response=await handle(request({loginId:id}));assert.equal(response.status,401);const result=await response.json();assert(!JSON.stringify(result).includes(uuid));assert.equal(calls.filter(c=>c[0]==='password').length,1);assert(!calls.some(c=>c[0]==='begin_facility_choice_login'||c[0]==='insert'||c[0]==='update'));}
});
test('staff IDs use the existing authentication/device policy and accept passwords shorter than ten',async()=>{
 const {handle,calls}=fixture();const response=await handle(request({role:'admin',userId:'attacker',method:'facility'}));assert.equal(response.status,200);const result=await response.json();assert.equal(result.kind,'session');assert.equal(result.organizationCode,code);assert.equal(calls.find(c=>c[0]==='password')[1].password,'short6');assert(!calls.some(c=>c[0]==='begin_facility_choice_login'));
});
test('personal pending/revoked/other-owner devices remain denied after successful individual authentication',async()=>{
 for(const row of [{status:'pending',device_kind:'personal',owner_recorder_profile_id:uuid},{status:'revoked',device_kind:'personal',owner_recorder_profile_id:uuid},{status:'approved',device_kind:'personal',owner_recorder_profile_id:'other'}]){
  const {handle}=fixture({rows:{organization_devices:{id:uuid,...row}}});assert.equal((await handle(request())).status,403);
 }
});
test('privileged email requirement is not bypassed by the unified staff route',async()=>{
 const {handle,calls}=fixture({facility_privileged_email_required:{data:true,error:null}});assert.equal((await handle(request())).status,401);assert(!calls.some(c=>c[0]==='password'));
});
test('facility route returns a short-lived choice, never an authenticated session',async()=>{
 const {handle,calls}=fixture({method:'facility'});const response=await handle(request({loginId:'facility',password:'fixture-common-password'}));assert.equal(response.status,200);const body=await response.json();assert.equal(body.kind,'facility');assert.equal(body.choice.staff[0].displayName,'架空職員');assert.equal(body.session,undefined);assert(!calls.some(c=>c[0]==='password'));
});
test('facility restrictions/rate limits are preserved and cannot fall back to staff authentication',async()=>{
 for(const reason of ['invalid','rate']){const {handle,calls}=fixture({method:'facility',begin_facility_choice_login:{data:{errorCode:reason},error:null}});const response=await handle(request({password:'fixture-common-password'}));assert.equal(response.status,reason==='rate'?429:401);assert(!calls.some(c=>c[0]==='password'));}
});
test('ambiguous or unknown IDs fail closed without exposing their routing classification',async()=>{
 const messages=[];for(const reason of ['invalid','ambiguous']){const {handle,calls}=fixture({resolve_unified_login:{data:{error:reason},error:null}});const response=await handle(request());assert.equal(response.status,401);messages.push(await response.json());assert.equal(calls.length,1);}assert.deepEqual(messages[0],messages[1]);
});
test('unknown/new/multiple-organization browser requires initial organization setup without disclosure',async()=>{
 const {handle,calls}=fixture({resolve_unified_login:{data:{error:'organization_required'},error:null}});const response=await handle(request({organizationCode:''}));assert.equal(response.status,400);assert.equal((await response.json()).code,'ORGANIZATION_REQUIRED');assert.equal(calls.length,1);
});
test('empty passwords, malformed bodies and client routing overrides cannot authenticate',async()=>{
 for(const change of [{password:''},{deviceToken:'bad'},{loginId:'not an id'},{organizationCode:'bad'},{loginId:'a@b'}]){const {handle,calls}=fixture();assert.equal((await handle(request(change))).status,400);assert.equal(calls.length,0);}
 const {handle}=fixture();assert.equal((await handle(new Request('https://fixture.invalid',{method:'POST',body:'{'}))).status,400);assert.equal((await handle(new Request('https://fixture.invalid',{method:'POST',body:'x'.repeat(5000)}))).status,400);
});
test('legacy individual endpoint also removes the ten-character login rejection',async()=>{
 const {staff,calls}=fixture();const result=await staff(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({organizationCode:code,employeeCode:'staff001',password:'short6',deviceToken:device})}));assert.equal(result.status,200);assert.equal(calls.find(c=>c[0]==='password')[1].password,'short6');
});
test('registration removes only the independent ten-character rule; existing secrets and device guards are not changed',()=>{
 const manager=readFileSync('supabase/functions/manage-recorder-login/index.ts','utf8'),ui=readFileSync('src/components/RecorderProfileManager.tsx','utf8'),auth=readFileSync('src/components/AuthScreen.tsx','utf8');
 assert(!manager.includes('password.length < 10'));assert(!ui.includes('loginPassword.length < 10'));assert(!ui.includes('minLength={10}'));assert(!auth.includes('minLength='));assert(manager.includes("from('facility_login_credentials')"));assert(!auth.includes('setLoginMethod'));
});
