import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {clients,cli,supportRef} from './lesson-operation-client.mjs';
if(!process.argv.includes('--run-fictional-test'))throw Error('Use --run-fictional-test');
const {support}=clients(),run=randomUUID(),orgs=[randomUUID(),randomUUID()],staff=[],devices=[],childIds=[];
const check=r=>{if(r.error)throw Error('Isolated facility login test failed: '+r.error.code+' '+(r.error.message?.match(/constraint "([a-zA-Z0-9_]+)"/)?.[1]||''));return r.data;};
const anon=JSON.parse(cli(['projects','api-keys','--project-ref',supportRef,'--reveal','-o','json'])).find(row=>row.name==='anon').api_key;
const makeClient=token=>createClient(`https://${supportRef}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:token?{'x-support-device-token':token}:{}}});
const gatePassword=randomBytes(24).toString('hex'),loginId='fixture-facility';
let code;
try{
 for(const id of orgs)check(await support.from('organizations').insert({id,name:'施設選択ログイン・隔離試験',device_approval_enabled:true,shared_staff_login_allowed:true}));
 code=check(await support.from('organizations').select('staff_login_code').eq('id',orgs[0]).single()).staff_login_code;
 for(let i=0;i<4;i++){
  const role=i===0?'admin':i===3?'manager':'staff',row={org:orgs[0],invitationId:randomUUID(),email:`facility-check-${run}-${i}@example.com`,password:randomBytes(24).toString('hex'),client:makeClient()};staff.push(row);
  check(await support.from('member_invitations').insert({id:row.invitationId,organization_id:row.org,email:row.email,role}));
  row.id=check(await support.auth.admin.createUser({email:row.email,password:row.password,email_confirm:true,user_metadata:{display_name:`架空施設職員${i}`,needs_password_setup:false}})).user.id;
  check(await support.from('profiles').update({role,active:true}).eq('id',row.id));
  row.recorderId=check(await support.from('profiles').select('recorder_profile_id').eq('id',row.id).single()).recorder_profile_id;
  if(!row.recorderId){row.recorderId=randomUUID();check(await support.from('recorder_profiles').insert({id:row.recorderId,organization_id:row.org,display_name:`架空施設職員${i}`,pin_configured:false,auth_user_id:row.id,individual_login_enabled:true}));check(await support.from('profiles').update({recorder_profile_id:row.recorderId}).eq('id',row.id));}
  check(await row.client.auth.signInWithPassword({email:row.email,password:row.password}));
 }
 for(const [kind,status] of [['facility_shared','approved'],['facility_shared','approved'],['personal','approved'],['facility_shared','pending'],['facility_shared','revoked']]){
  const token=randomBytes(32).toString('hex'),row={id:randomUUID(),token,kind,status};devices.push(row);
  check(await support.from('organization_devices').insert({id:row.id,organization_id:orgs[0],token_hash:createHash('sha256').update(token).digest('hex'),label:`隔離試験端末${devices.length}`,device_kind:kind,status,owner_recorder_profile_id:kind==='personal'?staff[1].recorderId:null,transport_mode_only:kind==='personal',approved_at:status==='approved'?new Date().toISOString():null}));
 }
 for(const org of orgs){const id=`facility-child-${run}-${org}`;childIds.push(id);check(await support.from('children').insert({id,organization_id:org,name:'施設ログイン・架空児童',birth_date:'2018-01-01'}));}
 const before=check(await support.from('profiles').select('id,organization_id,role,recorder_profile_id').in('id',staff.map(row=>row.id)).order('id'));
 let config=check(await staff[0].client.rpc('get_facility_login_configuration'));assert.equal(config.enabled,false);assert.equal(config.eligibleCount,2);assert.equal(config.privilegedEmailPending,0);
 const setConfig=(patch={})=>staff[0].client.rpc('set_facility_login_configuration',{p_enabled:true,p_login_id:loginId,p_password:gatePassword,p_revision:config.revision,...patch});
 assert((await staff[1].client.rpc('set_facility_login_configuration',{p_enabled:true,p_login_id:loginId,p_password:gatePassword,p_revision:0})).error,'staff cannot configure shared credentials');
 config=check(await setConfig());assert.equal(config.enabled,true);
 const publicClient=makeClient();
 const call=(body)=>publicClient.functions.invoke('facility-login',{body});
 const begin=(device=devices[0].token,patch={})=>call({action:'begin',organizationCode:code,loginId,password:gatePassword,deviceToken:device,...patch});
 const select=(choice,recorderId=staff[1].recorderId,device=devices[0].token)=>call({action:'select',ticket:choice.ticket,recorderId,deviceToken:device});
 assert.equal((await begin(randomBytes(32).toString('hex'))).error?.context.status,403);
 for(const device of devices.slice(2))assert.equal((await begin(device.token)).error?.context.status,403,'only approved facility-shared devices');
 const choice=check(await begin());assert.equal(choice.staff.length,2);assert(!JSON.stringify(choice).includes(staff[0].id));assert(choice.staff.every(row=>[staff[1].recorderId,staff[2].recorderId].includes(row.recorderId)));
 assert(!JSON.stringify(choice).includes(gatePassword));assert.equal(choice.session,undefined);
 assert.equal((await select(choice,staff[0].recorderId)).error?.context.status,403,'cannot select administrator');
 assert.equal((await select(choice,staff[3].recorderId)).error?.context.status,403,'cannot select manager');
 assert.equal((await select(choice,staff[1].recorderId,devices[1].token)).error?.context.status,403,'ticket bound to one approved device');
 const result=check(await select(choice)),sessionClient=makeClient(devices[0].token);check(await sessionClient.auth.setSession(result.session));
 assert.equal(check(await sessionClient.auth.getUser()).user.id,staff[1].id,'existing individual Auth identity reused');
 assert.equal(check(await sessionClient.rpc('current_recorder_profile_id')),staff[1].recorderId);
 assert.equal(check(await sessionClient.rpc('get_current_facility_login_state')).facilityLogin,true);
 assert.equal(check(await sessionClient.rpc('facility_session_allowed')),true);
 assert.deepEqual(check(await sessionClient.from('children').select('id')).map(row=>row.id),[childIds[0]],'organization RLS maintained');
 assert.equal((await select(choice)).error?.context.status,403,'consumed ticket cannot mint another session');
 assert((await publicClient.from('facility_login_credentials').select('*')).error);assert((await sessionClient.from('facility_login_sessions').select('*')).error);
 const copiedClient=makeClient(devices[1].token);check(await copiedClient.auth.setSession(result.session));assert.equal(check(await copiedClient.rpc('facility_session_allowed')),false);assert.equal(check(await copiedClient.from('children').select('id')).length,0,'copied JWT cannot read on another device');
 check(await sessionClient.auth.refreshSession());assert.equal(check(await sessionClient.rpc('facility_session_allowed')),true,'refresh keeps binding');
 check(await support.from('organization_devices').update({status:'revoked'}).eq('id',devices[0].id));assert.equal(check(await sessionClient.rpc('facility_session_allowed')),false);assert.equal(check(await sessionClient.from('children').select('id')).length,0);
 check(await support.from('organization_devices').update({status:'approved'}).eq('id',devices[0].id));
 check(await support.from('profiles').update({role:'admin'}).eq('id',staff[1].id));assert.equal(check(await sessionClient.rpc('facility_session_allowed')),false);assert.equal(check(await sessionClient.rpc('current_user_role')),null);
 assert.equal((await sessionClient.functions.invoke('manage-member',{body:{action:'update',userId:staff[2].id,role:'admin'},headers:{'x-support-device-token':devices[0].token}})).error?.context.status,403,'promotion cannot elevate a choice-issued session');
 check(await support.from('profiles').update({role:'staff'}).eq('id',staff[1].id));
 check(await support.auth.admin.updateUserById(staff[1].id,{ban_duration:'1h'}));assert.equal(check(await sessionClient.rpc('facility_session_allowed')),false);check(await support.auth.admin.updateUserById(staff[1].id,{ban_duration:'none'}));
 const expiring=check(await begin());check(await support.from('facility_login_challenges').update({expires_at:'2020-01-01T00:00:00Z'}).eq('token_hash',createHash('sha256').update(expiring.ticket).digest('hex')));assert.equal((await select(expiring)).error?.context.status,403);
 const stale=check(await begin());check(await support.from('profiles').update({active:false}).eq('id',staff[2].id));assert.equal((await select(stale,staff[2].recorderId)).error?.context.status,403);check(await support.from('profiles').update({active:true}).eq('id',staff[2].id));
 check(await support.from('recorder_profiles').update({auth_user_id:null,individual_login_enabled:false}).eq('id',staff[2].recorderId));
 check(await support.from('organizations').update({shared_staff_login_allowed:false}).eq('id',orgs[0]));
 const emailChoice=check(await begin()),emailResult=check(await select(emailChoice,staff[2].recorderId)),emailSession=makeClient(devices[0].token);check(await emailSession.auth.setSession(emailResult.session));
 assert.equal(check(await emailSession.rpc('facility_session_allowed')),true,'email-only general staff can be selected without enabling legacy shared login');
 assert.equal(check(await emailSession.rpc('current_organization_id')),orgs[0]);assert.equal(check(await emailSession.rpc('current_recorder_profile_id')),staff[2].recorderId);
 assert.equal(check(await emailSession.rpc('get_current_facility_login_state')).deviceId,devices[0].id);assert.equal(check(await emailSession.from('children').select('id')).length,1);
 check(await support.from('organizations').update({shared_staff_login_allowed:true}).eq('id',orgs[0]));
 check(await support.from('recorder_profiles').update({auth_user_id:staff[2].id,individual_login_enabled:true}).eq('id',staff[2].recorderId));
 const otp=makeClient(),link=check(await support.auth.admin.generateLink({type:'magiclink',email:staff[0].email}));check(await otp.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'email'}));
 assert.equal(check(await otp.rpc('facility_session_allowed')),false,'privileged OTP session cannot bypass email/password requirement');
 assert.equal((await otp.functions.invoke('manage-member',{body:{action:'update',userId:staff[2].id,role:'admin'}})).error?.context.status,403);
 check(await support.from('recorder_profiles').update({auth_user_id:staff[3].id,individual_login_enabled:true,individual_login_role:'manager',employee_code:'fixture-manager'}).eq('id',staff[3].recorderId));
 assert.equal((await publicClient.functions.invoke('staff-login',{body:{organizationCode:code,employeeCode:'fixture-manager',password:staff[3].password,deviceToken:devices[0].token}})).error?.context.status,403,'privileged staff-ID login rejected in facility mode');
 config=check(await setConfig({p_password:null}));assert.equal(check(await sessionClient.rpc('facility_session_allowed')),false,'rotation/revision invalidates issued sessions');assert.equal((await select(stale)).error?.context.status,403,'rotation invalidates pending selection');
 const deletingDeviceChoice=check(await begin(devices[1].token)),deletingDeviceResult=check(await select(deletingDeviceChoice,staff[1].recorderId,devices[1].token)),deletingDeviceClient=makeClient(devices[1].token);
 check(await deletingDeviceClient.auth.setSession(deletingDeviceResult.session));assert.equal(check(await deletingDeviceClient.rpc('facility_session_allowed')),true);
 check(await support.from('organization_devices').delete().eq('id',devices[1].id).eq('organization_id',orgs[0]));
 assert.equal(check(await deletingDeviceClient.rpc('facility_session_allowed')),false,'device deletion retains denial instead of returning to legacy session rules');
 assert.equal(check(await support.from('facility_login_sessions').select('session_id').eq('device_id',devices[1].id)).length,1,'deleted device retains session tombstone');
 for(let i=0;i<5;i++)assert.equal((await begin(devices[0].token,{password:'wrong-password-fixture'})).error?.context.status,403);
 assert.equal((await begin()).error?.context.status,429,'failed attempts persist and enforce rate limit');
 assert.equal(check(await staff[0].client.rpc('facility_session_allowed')),true,'administrator email/password retains access');
 assert.equal(check(await staff[3].client.rpc('facility_session_allowed')),true,'manager email/password retains access');
 assert.equal(check(await support.rpc('facility_privileged_email_required',{p_user:staff[3].id})),true);
 assert.deepEqual(check(await support.from('profiles').select('id,organization_id,role,recorder_profile_id').in('id',staff.map(row=>row.id)).order('id')),before,'original account and recorder bindings retained');
 const audits=check(await support.from('facility_login_sessions').select('user_id,recorder_id,device_id,credential_revision').eq('organization_id',orgs[0]));assert.equal(audits.length,3);assert(audits.some(row=>row.user_id===staff[1].id&&row.device_id===devices[0].id));
 check(await support.auth.admin.deleteUser(staff[2].id));staff[2].deleted=true;
 const removedStaff=await emailSession.rpc('facility_session_allowed');assert(removedStaff.data===false||removedStaff.error,'removed staff cannot use old session');
 console.log('PASS: live no-PIN existing-staff choice, approved shared-device restriction, role exclusion, ticket expiry/replay/device binding, RLS/refresh/revocation/promotion/ban/credential rotation, failure rate limits, admin/manager password access and audit');
}finally{
 const errors=[],clean=async(query,label)=>{try{check(await query);}catch{errors.push(label);}};
 await clean(support.from('facility_login_sessions').delete().in('organization_id',orgs),'session fixtures');await clean(support.from('facility_login_challenges').delete().in('organization_id',orgs),'challenge fixtures');
 await clean(support.from('facility_login_credentials').delete().in('organization_id',orgs),'credential fixtures');
 await clean(support.from('organization_devices').delete().in('organization_id',orgs),'device fixtures');
 if(childIds.length)await clean(support.from('children').delete().in('id',childIds),'child fixtures');
 for(const row of staff){await row.client.auth.signOut({scope:'local'});if(row.id&&!row.deleted)await clean(support.auth.admin.deleteUser(row.id),'fictional staff auth');if(row.recorderId)await clean(support.from('recorder_profiles').delete().eq('id',row.recorderId).eq('organization_id',row.org),'fictional recorder');await clean(support.from('member_invitations').delete().eq('id',row.invitationId),'fictional invitation');}
 for(const id of orgs)await clean(support.from('organizations').delete().eq('id',id),'fictional organization');
 if(errors.length)throw Error('Fixture cleanup needs attention: '+errors.join(', '));
 assert.equal(check(await support.from('organizations').select('id').in('id',orgs)).length,0);
 console.log('PASS: isolated fixture removal confirmed; no operational Auth/password/child/learning data changed or restored');
}
