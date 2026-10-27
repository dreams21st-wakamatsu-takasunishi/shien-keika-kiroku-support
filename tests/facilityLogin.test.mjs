import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFacilityLoginHandler} from '../supabase/functions/facility-login/handler.ts';
const ids=Array.from({length:4},(_,i)=>`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`),device='a'.repeat(64),ticket='b'.repeat(64);
const user={id:ids[0],email:'staff@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',user_metadata:{}};
function fixture(patch={}){
 const calls=[],token='e30.'+Buffer.from(JSON.stringify({sub:user.id,session_id:ids[2]})).toString('base64url')+'.signature';
 const service={rpc:async(name,args)=>{calls.push([name,args]);return patch[name]||{data:name==='begin_facility_choice_login'?{schemaVersion:1,expiresAt:new Date(Date.now()+300000).toISOString(),staff:[{recorderId:ids[1],displayName:'架空職員',userId:'DO_NOT_RETURN'}]}:name==='consume_facility_choice_login'?{userId:user.id,challengeId:ids[3]}:true,error:null};},auth:{admin:{
  getUserById:async()=>{calls.push(['user']);return {data:{user:{...user,...patch.user}},error:null};},
  mfa:{listFactors:async()=>{calls.push(['factors']);return patch.factors||{data:{factors:[]},error:null};}},
  generateLink:async()=>{calls.push(['link']);return patch.link||{data:{user,properties:{hashed_token:'SERVER_ONLY'}},error:null};},
  signOut:async()=>{calls.push(['revoke']);return {error:null};}
 }}};
 const login={auth:{verifyOtp:async()=>{calls.push(['verify']);return patch.verify||{data:{user,session:{user,access_token:token,refresh_token:'REFRESH_SECRET'}},error:null};}}};
 return {calls,handle:createFacilityLoginHandler(service,login)};
}
const request=(patch={})=>new Request('https://test.invalid/facility',{method:'POST',body:JSON.stringify({action:'select',deviceToken:device,ticket,recorderId:ids[1],...patch})});
test('facility gate returns only short-lived selection and roster, not a login session or Auth identity',async()=>{
 const {calls,handle}=fixture(),response=await handle(request({action:'begin',organizationCode:'TEST123456',loginId:'facility',password:'a-long-common-password',role:'admin',userId:'attacker'}));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const data=await response.json();
 assert.deepEqual(data.staff,[{recorderId:ids[1],displayName:'架空職員'}]);assert.equal(data.session,undefined);assert(!JSON.stringify(data).includes('DO_NOT_RETURN'));assert.equal(calls.length,1);
 assert.equal(calls[0][0],'begin_facility_choice_login');assert(!Object.hasOwn(calls[0][1],'role'));
});
test('selection derives the existing account server-side and requires device-bound final registration',async()=>{
 const {calls,handle}=fixture(),response=await handle(request({userId:'attacker',role:'admin',pin:'not-required'}));assert.equal(response.status,200);
 const data=await response.json();assert(data.session.access_token);assert(data.session.refresh_token);assert(!JSON.stringify(data).includes('SERVER_ONLY'));
 assert.deepEqual(calls[0],['consume_facility_choice_login',{p_ticket:ticket,p_device:device,p_recorder:ids[1]}]);
 assert(calls.some(row=>row[0]==='finish_facility_choice_login'&&row[1].p_user===user.id&&row[1].p_session===ids[2]));
});
test('unapproved/changed/expired/replayed selection cannot reach session issuance',async()=>{
 for(const code of ['expired','invalid','unavailable']){
  const {calls,handle}=fixture({consume_facility_choice_login:{data:{errorCode:code},error:null}});assert.equal((await handle(request())).status,403);assert(!calls.some(row=>row[0]==='link'));
 }
 for(const patch of [{deviceToken:'bad'},{ticket:'bad'},{recorderId:'bad'},{action:'admin'}]){const {calls,handle}=fixture();assert.equal((await handle(request(patch))).status,400);assert.equal(calls.length,0);}
});
test('account suspension, initial setup and MFA never become passwordless privileged access',async()=>{
 for(const userPatch of [{is_anonymous:true},{is_sso_user:true},{email_confirmed_at:null},{deleted_at:'2026-01-01'},{banned_until:'2099-01-01'},{user_metadata:{needs_password_setup:true}}]){
  const {calls,handle}=fixture({user:userPatch});assert.equal((await handle(request())).status,403);assert(!calls.some(row=>row[0]==='link'));
 }
 for(const factors of [{data:{factors:[{status:'verified'}]},error:null},{data:null,error:{}}]){const {calls,handle}=fixture({factors});assert([403,503].includes((await handle(request())).status));assert(!calls.some(row=>row[0]==='link'));}
});
test('identity mismatches and final permission race withhold and revoke tokens',async()=>{
 for(const patch of [{link:{data:{user:{id:ids[1]},properties:{hashed_token:'secret'}},error:null}},{finish_facility_choice_login:{data:false,error:null}},{verify:{data:{user,session:{user,access_token:'invalid',refresh_token:'secret'}},error:null}}]){
  const {calls,handle}=fixture(patch),response=await handle(request());assert.equal(response.status,503);assert(!JSON.stringify(await response.json()).includes('secret'));
  if(patch.finish_facility_choice_login)assert(calls.some(row=>row[0]==='revoke'));
 }
});
test('common credential failures/rate limits do not disclose passwords or user lists',async()=>{
 for(const code of ['invalid','rate']){const {handle}=fixture({begin_facility_choice_login:{data:{errorCode:code},error:null}});const response=await handle(request({action:'begin',organizationCode:'TEST123456',loginId:'facility',password:'a-long-common-password'}));assert.equal(response.status,code==='rate'?429:403);assert(!JSON.stringify(await response.json()).includes('password'));}
});
test('RLS/session source retains creator identities, no PIN, strict devices and protected tables',()=>{
 const sql=readFileSync('supabase/migrations/202610150003_facility_choice_login.sql','utf8');
 for(const token of ['p.role=\'staff\'','d.device_kind=\'facility_shared\'','d.status=\'approved\'','credential_revision','for update','public.facility_session_allowed()','auth.jwt()->\'amr\'','auth.mfa_factors'])assert(sql.includes(token),token);
 assert(!sql.includes('verify_recorder_pin'));assert(!sql.includes('update auth.users'));assert(!sql.includes('update public.profiles'));
 for(const name of ['invite-member','manage-member','manage-recorder-login','optimize-transport-route','geocode-transport-locations','calculate-transport-matrix','send-announcement-notification','send-transport-notification']){
  const source=readFileSync(`supabase/functions/${name}/index.ts`,'utf8');assert(source.includes("rpc('facility_session_allowed')"),name);
 }
});
