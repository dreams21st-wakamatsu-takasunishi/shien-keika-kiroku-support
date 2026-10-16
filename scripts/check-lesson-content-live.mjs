import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {clients,cli,supportRef,lessonRef} from './lesson-operation-client.mjs';
if(!process.argv.includes('--run-fictional-test'))throw Error('Use --run-fictional-test');
const {support,lesson}=clients(),run=randomUUID(),orgs=[randomUUID(),randomUUID()],campuses=[`content-${run}`,`other-${run}`];
const actors=[],students=[];
const ok=r=>{if(r.error)throw Error('Content API fixture check failed: '+r.error.code);return r.data;};
const anon=ref=>JSON.parse(cli(['projects','api-keys','--project-ref',ref,'--reveal','-o','json'])).find(v=>v.name==='anon').api_key;
const supportAnon=anon(supportRef),lessonAnon=anon(lessonRef);
const client=(ref,key)=>createClient(`https://${ref}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false}});
try{
 for(const id of orgs)ok(await support.from('organizations').insert({id,name:'教材・ごほうび隔離試験'}));
 for(let i=0;i<2;i++){
  const actor={org:orgs[i],invitation:randomUUID(),email:`content-staff-${run}-${i}@example.com`,password:randomBytes(24).toString('hex'),client:client(supportRef,supportAnon)};actors.push(actor);
  ok(await support.from('member_invitations').insert({id:actor.invitation,organization_id:actor.org,email:actor.email,role:'admin'}));
  actor.id=ok(await support.auth.admin.createUser({email:actor.email,password:actor.password,email_confirm:true,user_metadata:{display_name:'教材・架空職員'}})).user.id;
  ok(await support.from('profiles').update({role:'admin',active:true}).eq('id',actor.id));
  actor.recorder=ok(await support.from('profiles').select('recorder_profile_id').eq('id',actor.id).single()).recorder_profile_id;
  ok(await actor.client.auth.signInWithPassword({email:actor.email,password:actor.password}));
  ok(await lesson.from('lesson_support_scopes').insert({support_project_ref:supportRef,organization_id:actor.org,data_table:'user_data',campus_id:campuses[i],enabled:true}));
  const student={id:`student_content_${run}_${i}`,email:`content-student-${run}-${i}@example.com`,password:randomBytes(24).toString('hex'),client:client(lessonRef,lessonAnon),data:{displayName:'架空教材児童',campusId:campuses[i],coins:17,items:['keep'],textRecords:{tt_keep:{score:3}}}};students.push(student);
  student.auth=ok(await lesson.auth.admin.createUser({email:student.email,password:student.password,email_confirm:true})).user.id;
  ok(await lesson.from('user_data').insert({id:student.id,data:student.data}));
  ok(await lesson.from('lesson_user_access').insert({auth_user_id:student.auth,user_data_id:student.id,role:'student',scope_type:'all',scope_value:''}));
  ok(await lesson.from('lesson_support_students').insert({support_project_ref:supportRef,organization_id:actor.org,data_table:'user_data',campus_id:campuses[i],student_id:student.id,enabled:true,support_child_id:`fictional-child-${i}`,support_link_id:randomUUID()}));
  ok(await student.client.auth.signInWithPassword({email:student.email,password:student.password}));
 }
 const call=(body,i=0)=>actors[i].client.functions.invoke('lesson-managed-content',{body});
 for(let i=0;i<2;i++){const list=ok(await call({action:'list'},i));assert.deepEqual(list.campuses.map(c=>c.id),[campuses[i]]);}
 let snapshot=ok(await call({action:'get',campusId:campuses[0]}));
 const task={id:`tt_${run}`,title:'架空文章課題',content:'{漢字|かんじ}\nあいうえお',time:3,star:1,targetGroup:'',hidden:false};
 const request={action:'save',campusId:campuses[0],revision:snapshot.revision,fingerprint:snapshot.fingerprint,operationId:randomUUID(),kind:'textTasks',item:task,confirmed:true};
 const saved=ok(await call(request)),retry=ok(await call(request));assert.deepEqual(saved,retry);assert(saved.content.textTasks.some(v=>v.id===task.id));
 assert.equal((await call({...request,operationId:randomUUID()})).error?.context?.status,409);
 assert.equal((await call({...request,confirmed:false})).error?.context?.status,400);
 assert.equal((await call({action:'get',campusId:campuses[1]})).error?.context?.status,403);
 assert.equal((await call({action:'get',campusId:'public'})).error?.context?.status,400);
 const theme={id:`ct_${run}`,name:'架空プレゼント',distribution:'present',hidden:false,bg:'#ffffff',text:'#123456',btnBg:'#006655',btnText:'#ffffff'};
 const gift={...request,revision:saved.revision,fingerprint:saved.fingerprint,operationId:randomUUID(),kind:'customThemes',item:theme};
 const gifted=ok(await call(gift));assert.equal(gifted.giftedCount,1);assert.deepEqual(ok(await call(gift)),gifted);
 const foreign=ok(await call({action:'get',campusId:campuses[1]},1));
 ok(await call({...request,campusId:campuses[1],revision:foreign.revision,fingerprint:foreign.fingerprint,operationId:randomUUID(),item:{...task,id:`tt_foreign_${run}`}},1));
 for(let i=0;i<2;i++){
  assert.deepEqual(ok(await lesson.from('user_data').select('data').eq('id',students[i].id).single()).data,students[i].data,'progress unchanged');
  const catalogs=ok(await students[i].client.from('lesson_campus_content').select('campus_id,content').eq('data_table','user_data'));
  assert.deepEqual(catalogs.map(row=>row.campus_id),[campuses[i]],'student sees own trusted campus only');
  const grants=ok(await students[i].client.from('lesson_reward_grants').select('student_id,reward_id').eq('data_table','user_data'));
  assert.equal(grants.length,i===0?1:0);assert(grants.every(v=>v.student_id===students[i].id));
  assert((await students[i].client.rpc('manage_support_content',{p:{action:'list'}})).error,'student cannot mutate catalog');
 }
 ok(await lesson.from('user_data').update({data:{...students[0].data,campusId:campuses[1]}}).eq('id',students[0].id));
 assert(!ok(await students[0].client.from('lesson_campus_content').select('campus_id')).some(row=>row.campus_id===campuses[1]),'editable campus JSON cannot bypass trusted enrollment');
 ok(await lesson.from('user_data').update({data:students[0].data}).eq('id',students[0].id));
 ok(await support.from('profiles').update({role:'manager'}).eq('id',actors[0].id));
 assert.equal((await call({action:'list'})).error?.context?.status,403,'manager has no implicit content permission');
 ok(await support.from('organization_role_permissions').upsert({organization_id:orgs[0],role:'manager',permissions:['manage_learning_content']}));
 assert.equal(ok(await call({action:'list'})).campuses.length,1,'explicit delegation allowed');
 ok(await support.from('profiles').update({active:false}).eq('id',actors[0].id));assert.equal((await call({action:'list'})).error?.context?.status,403);
 const noAuth=client(supportRef,supportAnon);assert.equal((await noAuth.functions.invoke('lesson-managed-content',{body:{action:'list'}})).error?.context?.status,401);
 assert((await client(lessonRef,lessonAnon).from('lesson_campus_content').select('campus_id')).error,'anon cannot read');
 console.log('PASS: isolated production API + learner RLS; save/retry/conflict, scoped present, preserved progress, foreign/public/anonymous/inactive rejection, explicit permissions, spoofed-campus rejection');
}finally{
 const failures=[],clean=async(query,name)=>{try{ok(await query);}catch{failures.push(name);}};
 for(const table of ['lesson_reward_grants','lesson_content_operations','lesson_campus_content','lesson_support_students','lesson_support_scopes'])await clean(lesson.from(table).delete().in('campus_id',campuses),'source '+table);
 for(const student of students){await student.client.auth.signOut({scope:'local'});if(student.auth)await clean(lesson.auth.admin.deleteUser(student.auth),'fictional learner auth');await clean(lesson.from('user_data').delete().eq('id',student.id),'fictional learner');}
 for(const actor of actors){await actor.client.auth.signOut({scope:'local'});if(actor.id)await clean(support.auth.admin.deleteUser(actor.id),'fictional staff auth');if(actor.recorder)await clean(support.from('recorder_profiles').delete().eq('id',actor.recorder).eq('organization_id',actor.org),'fictional recorder');await clean(support.from('member_invitations').delete().eq('id',actor.invitation),'fictional invitation');}
 for(const table of ['organization_role_permissions','organizations'])await clean(support.from(table).delete().in(table==='organizations'?'id':'organization_id',orgs),'support '+table);
 if(failures.length)throw Error('Fixture cleanup requires attention: '+failures.join(', '));
 assert.equal(ok(await lesson.from('lesson_campus_content').select('campus_id').in('campus_id',campuses)).length,0);
 assert.equal(ok(await support.from('organizations').select('id').in('id',orgs)).length,0);
 console.log('PASS: isolated fixture cleanup; no operational learners/Auth/settings changed');
}
