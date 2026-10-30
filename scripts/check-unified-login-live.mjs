// Explicitly opted-in, isolated fictional identities only. Cleans up its exact IDs.
import assert from 'node:assert/strict';import {randomUUID,randomBytes,createHash} from 'node:crypto';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {createClient} from '@supabase/supabase-js';
if(!process.argv.includes('--run-fictional-test'))throw Error('--run-fictional-test required');
const ref='cyqrxhknpboidvetdfgn';if(readFileSync('supabase/.temp/project-ref','utf8').trim()!==ref)throw Error('Linked project mismatch');
const keysResult=spawnSync('powershell.exe',['-NoProfile','-Command',`npx.cmd supabase --dns-resolver https projects api-keys --project-ref ${ref} --reveal -o json`],{encoding:'utf8',timeout:120000});
if(keysResult.status)throw Error('Test credential unavailable; output withheld');
const keys=JSON.parse(keysResult.stdout),secret=keys.find(k=>k.name==='service_role')?.api_key,anon=keys.find(k=>k.name==='anon')?.api_key;
if(!secret||!anon)throw Error('Test credential unavailable');
const base=`https://${ref}.supabase.co`,options={auth:{persistSession:false,autoRefreshToken:false}},service=createClient(base,secret,options);
const client=token=>createClient(base,anon,{...options,global:{headers:token?{'x-support-device-token':token}:{}}});
const check=result=>{if(result.error)throw Error('Fictional test operation failed: '+(result.error.code||'unknown'));return result.data;};
const org=randomUUID(),run=randomUUID(),staff=[],devices=[],commonPassword=randomBytes(18).toString('hex');let checks=0;
mkdirSync('output',{recursive:true});
const manifestPath='output/unified-login-live-'+run+'.json';
const manifest=()=>writeFileSync(manifestPath,JSON.stringify({organizationId:org,runId:run,staff:staff.map(s=>({id:s.id,recorderId:s.recorderId,invitationId:s.invitationId})),devices:devices.map(d=>d.id)}));
manifest();
const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
const call=async(body)=>{const response=await fetch(base+'/functions/v1/unified-login',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
try{
 check(await service.from('organizations').insert({id:org,name:'統一ログイン・架空試験',device_approval_enabled:true,shared_staff_login_allowed:false}));
 const code=check(await service.from('organizations').select('staff_login_code').eq('id',org).single()).staff_login_code;
 for(const role of ['admin','staff']){
  const row={invitationId:randomUUID(),email:`unified-${run}-${role}@example.com`,password:role==='staff'?randomBytes(4).toString('hex'):randomBytes(18).toString('hex')};staff.push(row);
  check(await service.from('member_invitations').insert({id:row.invitationId,organization_id:org,email:row.email,role}));
  manifest();row.id=check(await service.auth.admin.createUser({email:row.email,password:row.password,email_confirm:true,user_metadata:{display_name:'架空ログイン職員'+role,needs_password_setup:false,...(role==='staff'?{login_method:'staff_id'}:{})}})).user.id;manifest();
  const profile=check(await service.from('profiles').select('recorder_profile_id').eq('id',row.id).single());
  const existing=check(await service.from('recorder_profiles').select('id,auth_user_id').eq('organization_id',org).eq('display_name','架空ログイン職員'+role).eq('active',true).maybeSingle());
  if(existing?.auth_user_id&&existing.auth_user_id!==row.id)throw Error('Fictional recorder identity mismatch');
  row.recorderId=profile.recorder_profile_id||existing?.id||randomUUID();
  manifest();
  if(!profile.recorder_profile_id&&!existing)check(await service.from('recorder_profiles').insert({id:row.recorderId,organization_id:org,display_name:'架空ログイン職員'+role,auth_user_id:row.id,individual_login_enabled:true}));
  check(await service.from('profiles').update({recorder_profile_id:row.recorderId,role,active:true}).eq('id',row.id));
  check(await service.from('recorder_profiles').update({auth_user_id:row.id,individual_login_enabled:true,individual_login_role:'staff',...(role==='staff'?{employee_code:'fixture-staff'}:{})}).eq('id',row.recorderId));
 }
 for(const [kind,status] of [['facility_shared','approved'],['personal','approved'],['personal','pending'],['personal','revoked']]){
  const row={id:randomUUID(),token:randomBytes(32).toString('hex'),kind,status};devices.push(row);
  check(await service.from('organization_devices').insert({id:row.id,organization_id:org,token_hash:createHash('sha256').update(row.token).digest('hex'),label:'架空ログイン端末'+devices.length,device_kind:kind,status,owner_recorder_profile_id:kind==='personal'?staff[1].recorderId:null,transport_mode_only:kind==='personal'}));
 }
 const admin=await call({loginId:staff[0].email,password:staff[0].password,deviceToken:devices[0].token});equal(admin.status,200);
 const adminClient=client(devices[0].token);check(await adminClient.auth.setSession(admin.body.session));equal(check(await adminClient.auth.getUser()).user.id,staff[0].id);
 check(await adminClient.rpc('set_facility_login_configuration',{p_enabled:true,p_login_id:'fixture-facility',p_password:commonPassword,p_revision:0}));
 check(await adminClient.functions.invoke('manage-recorder-login',{body:{action:'configure',recorderProfileId:staff[1].recorderId,employeeCode:'fixture-staff',password:staff[1].password,loginRole:'staff'}}));checks++;
 // A six-to-nine-character existing password is accepted by the unified/legacy flow.
 const individual=await call({loginId:'fixture-staff',password:staff[1].password,deviceToken:devices[1].token,role:'admin',userId:staff[0].id,method:'facility'});equal(individual.status,200);equal(individual.body.organizationCode,code);
 const personal=client(devices[1].token);check(await personal.auth.setSession(individual.body.session));equal(check(await personal.auth.getUser()).user.id,staff[1].id);
 const access=check(await personal.rpc('get_current_staff_device_access',{p_device_token:devices[1].token}));equal(access[0].field_mode_only,true);equal(check(await personal.rpc('current_user_role')),'staff');
 for(const row of devices.slice(2))equal((await call({loginId:'fixture-staff',password:staff[1].password,organizationCode:code,deviceToken:row.token})).status,403);
 equal((await call({loginId:'fixture-facility',password:commonPassword,deviceToken:devices[1].token})).status,401);
 equal((await call({loginId:'fixture-staff',password:staff[1].password,deviceToken:randomBytes(32).toString('hex')})).body.code,'ORGANIZATION_REQUIRED');
 const choice=await call({loginId:'fixture-facility',password:commonPassword,deviceToken:devices[0].token});equal(choice.status,200);equal(choice.body.kind,'facility');equal(choice.body.session,undefined);equal(choice.body.choice.staff.map(r=>r.recorderId),[staff[1].recorderId]);
 const publicClient=client(devices[0].token),selected=check(await publicClient.functions.invoke('facility-login',{body:{action:'select',ticket:choice.body.choice.ticket,recorderId:staff[1].recorderId,deviceToken:devices[0].token}}));
 const chosen=client(devices[0].token);check(await chosen.auth.setSession(selected.session));equal(check(await chosen.auth.getUser()).user.id,staff[1].id);equal(check(await chosen.rpc('facility_session_allowed')),true);
 equal((await service.from('recorder_profiles').update({employee_code:'fixture-facility'}).eq('id',staff[1].recorderId)).error?.code,'23505');
 equal(check(await service.from('recorder_profiles').select('employee_code').eq('id',staff[1].recorderId).single()).employee_code,'fixture-staff');
 console.log(JSON.stringify({passed:true,checks,fictionalOnly:true,shortIndividualPasswordAccepted:true,personalFacilityDenied:true,existingIndividualIdentityRetained:true}));
}finally{
 const errors=[];const clean=async(query,label)=>{try{check(await query);}catch{errors.push(label);}};
 for(const table of ['facility_login_sessions','facility_login_challenges','facility_login_credentials','organization_devices'])await clean(service.from(table).delete().eq('organization_id',org),table);
 for(const row of staff){if(row.id)await clean(service.auth.admin.deleteUser(row.id),'fictional Auth');if(row.recorderId)await clean(service.from('recorder_profiles').delete().eq('id',row.recorderId).eq('organization_id',org),'fictional recorder');await clean(service.from('member_invitations').delete().eq('id',row.invitationId),'fictional invitation');}
 await clean(service.from('organizations').delete().eq('id',org),'fictional organization');
 if(errors.length)throw Error('Fictional cleanup needs attention: '+errors.join(', '));
 equal(check(await service.from('organizations').select('id').eq('id',org)),[]);
 console.log(JSON.stringify({cleanupConfirmed:true,realAccountsChanged:0,realRecordsAccessed:0}));
}
