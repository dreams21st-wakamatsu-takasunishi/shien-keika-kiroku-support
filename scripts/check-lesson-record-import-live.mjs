import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {clients,cli,sql,lessonRoot,lessonRef,supportRef,orgId} from './lesson-operation-client.mjs';
import {importLessonEvents,readLessonEvidence} from '../src/learning/recordImport.ts';
if(!process.argv.includes('--run-fictional-test'))throw Error('Use --run-fictional-test; creates and removes isolated fictional fixtures');
const {support,lesson}=clients(),run=randomUUID(),childId=`child-import-check-${run}`,studentId=`student_import_check_${run}`,draftKey=`record-import-check-${run}`;
const check=r=>{if(r.error)throw Error('Fictional import operation failed; credential-bearing output withheld');return r.data;};
const anon=JSON.parse(cli(['projects','api-keys','--project-ref',supportRef,'--reveal','-o','json'])).find(k=>k.name==='anon').api_key;
const staff=createClient(`https://${supportRef}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false}});
let staffId,recorderId,invitationId;
const snapshot=()=>sql('select md5(string_agg(id||md5(data::text),\'|\' order by id)) as hash from public.user_data;',lessonRoot).rows[0].hash;
const before=snapshot();
try{
 const scope=check(await lesson.from('lesson_support_scopes').select('enabled').eq('support_project_ref',supportRef).eq('organization_id',orgId).eq('campus_id','main').eq('data_table','user_data').single());assert(scope.enabled,'Existing test scope must already be enabled');
 const password=randomBytes(24).toString('hex'),email=`lesson-import-check-${run}@example.com`;
 invitationId=check(await support.from('member_invitations').insert({id:randomUUID(),organization_id:orgId,email,role:'admin'}).select('id').single()).id;
 staffId=check(await support.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:'実績取り込み・架空試験職員'}})).user.id;
 check(await support.from('profiles').upsert({id:staffId,organization_id:orgId,display_name:'実績取り込み・架空試験職員',email,role:'admin',active:true}));
 recorderId=check(await support.from('profiles').select('recorder_profile_id').eq('id',staffId).single()).recorder_profile_id;
 check(await staff.auth.signInWithPassword({email,password}));
 const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}),displayName=`架空児童・取り込み試験-${run}`;
 check(await support.from('children').insert({id:childId,organization_id:orgId,name:displayName,birth_date:'2018-01-01'}));
 const data={displayName,birthdate:'2018-01-01',campusId:'main',loginNumber:'998',coins:19,practiceLogs:[
  {id:randomUUID(),at:date+'T00:00:00Z',category:'mouse',title:'M-1',detail:'クリア',amount:'ステージをクリア'},
  {id:randomUUID(),at:date+'T00:10:00Z',category:'text',title:'文章入力',detail:'練習',amount:'100文字'},
 ]};
 check(await lesson.from('user_data').insert({id:studentId,data}));
 check(await lesson.from('lesson_support_students').insert({support_project_ref:supportRef,organization_id:orgId,data_table:'user_data',campus_id:'main',student_id:studentId,enabled:true}));
 const call=body=>staff.functions.invoke('lesson-learning',{body});
 const inspect=check(await call({action:'inspect',childId,studentId}));
 const {link}=check(await call({action:'link',childId,studentId,fingerprint:inspect.fingerprint,confirmed:true}));
 const history=check(await call({action:'history',childId,date}));assert.equal(history.events.length,2);
 const answer=importLessonEvents({value:'職員の手入力',note:'観察は職員が入力'},history,link,[data.practiceLogs[0].id],{childId,date,organizationId:orgId,actorId:staffId,confirmedAt:new Date().toISOString()});
 const payload={version:12,date,selectedChildIds:[childId],activeChildId:childId,recorderId:recorderId||'',recorderName:'架空試験職員',childDrafts:{[childId]:{recordId:randomUUID(),sectionAnswers:{pc:{sectionId:'pc',sectionTitle:'パソコン',answers:{pc_content:answer,pc_posture:{value:'観察内容は変えない'}}}}}},updatedAt:new Date().toISOString()};
 check(await staff.rpc('save_record_draft_guarded',{p_organization_id:orgId,p_draft_key:draftKey,p_payload:payload,p_device_id:`fictional-${run}`,p_expected_revision:null,p_recorder_profile_id:recorderId||null}));
 const saved=check(await staff.from('record_drafts').select('payload').eq('organization_id',orgId).eq('draft_key',draftKey).single()).payload;
 const restored=saved.childDrafts[childId].sectionAnswers.pc.answers.pc_content;
 assert.deepEqual(restored,answer);assert.equal(readLessonEvidence(restored.nestedDetails).length,1);
 assert.equal(saved.childDrafts[childId].sectionAnswers.pc.answers.pc_posture.value,'観察内容は変えない');
 assert.equal(importLessonEvents(restored,history,link,[data.practiceLogs[0].id],{childId,date,organizationId:orgId,actorId:staffId,confirmedAt:new Date().toISOString()}),restored);
 assert.deepEqual(check(await lesson.from('user_data').select('data').eq('id',studentId).single()).data,data);
 check(await lesson.from('lesson_support_students').update({enabled:false}).eq('student_id',studentId).eq('organization_id',orgId).eq('support_project_ref',supportRef));
 assert.equal((await call({action:'history',childId,date})).error?.context.status,403);
 console.log('PASS: live authorized history, selected evidence, guarded draft save/read, duplicate prevention, unchanged fictional learning data, permission revocation');
}finally{
 const errors=[],clean=async(fn,label)=>{try{await fn();}catch{errors.push(label);}};
 await clean(async()=>check(await support.from('record_drafts').delete().eq('organization_id',orgId).eq('draft_key',draftKey)),'draft');
 const links=await support.from('lesson_child_links').select('id').eq('organization_id',orgId).eq('child_id',childId);
 if(links.error)errors.push('link-read');
 for(const link of links.data||[])await clean(async()=>check(await support.from('lesson_link_audit').delete().eq('organization_id',orgId).eq('link_id',link.id)),'link-audit');
 await clean(async()=>check(await support.from('lesson_child_links').delete().eq('organization_id',orgId).eq('child_id',childId)),'link');
 await clean(async()=>check(await lesson.from('lesson_support_students').delete().eq('student_id',studentId).eq('organization_id',orgId).eq('support_project_ref',supportRef)),'permit');
 await clean(async()=>check(await lesson.from('user_data').delete().eq('id',studentId)),'source-data');
 await clean(async()=>check(await support.from('children').delete().eq('id',childId).eq('organization_id',orgId)),'child');
 if(staffId)await clean(async()=>check(await support.auth.admin.deleteUser(staffId)),'staff-auth');
 if(recorderId)await clean(async()=>check(await support.from('recorder_profiles').delete().eq('id',recorderId).eq('organization_id',orgId)),'recorder');
 if(invitationId)await clean(async()=>check(await support.from('member_invitations').delete().eq('id',invitationId).eq('organization_id',orgId)),'invitation');
 await staff.auth.signOut({scope:'local'});
 if(errors.length)throw Error(`Fictional cleanup requires attention: ${errors.join(', ')}`);
 assert.equal(snapshot(),before,'Existing learning data changed during fictional test; never reverts operational changes');
 console.log('PASS: fictional fixtures removed and original learning-data hash unchanged');
}
