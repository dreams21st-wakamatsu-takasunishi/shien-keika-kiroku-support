import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {clients,cli,sql,lessonRoot,lessonRef,supportRef,orgId} from './lesson-operation-client.mjs';
if(!process.argv.includes('--run-fictional-test'))throw Error('Use --run-fictional-test');
const {support,lesson}=clients(),run=randomUUID(),staff=[],children=[],batches=[];
const check=result=>{if(result.error)throw Error('Isolated batch test failed: '+result.error.code);return result.data;};
const anon=ref=>JSON.parse(cli(['projects','api-keys','--project-ref',ref,'--reveal','-o','json'])).find(k=>k.name==='anon').api_key;
const makeClient=()=>createClient(`https://${supportRef}.supabase.co`,anon(supportRef),{auth:{persistSession:false,autoRefreshToken:false}});
const snapshot=()=>sql("select md5(string_agg(id||md5(data::text),'|' order by id)) as hash from public.user_data;",lessonRoot).rows[0].hash;
const before=snapshot();
// Keep only digests in memory: concurrent normal practice is not a reason to restore user data.
const rowSnapshot=()=>sql(`select id,md5(data::text) as hash,
 md5((select jsonb_object_agg(key,value) from jsonb_each(data) where key in
 ('displayName','name','birthdate','birthDate','campusId','campus','group','loginNumber','studentNumber','authUserId','auth_user_id','authEmail','email','isMaster','isGuest','accountType','publicRegistration'))::text) as identity,
 (select jsonb_object_agg(key,md5(value::text)) from jsonb_each(data)) as fields from public.user_data;`,lessonRoot).rows;
const originals=rowSnapshot();
try{
 assert(check(await lesson.from('lesson_support_scopes').select('enabled').eq('support_project_ref',supportRef).eq('organization_id',orgId).eq('campus_id','main').eq('data_table','user_data').single()).enabled);
 for(let i=0;i<2;i++){
  const row={invitationId:randomUUID(),email:`batch-check-${run}-${i}@example.com`,password:randomBytes(24).toString('hex'),client:makeClient()};staff.push(row);
  check(await support.from('member_invitations').insert({id:row.invitationId,organization_id:orgId,email:row.email,role:'admin'}));
  row.id=check(await support.auth.admin.createUser({email:row.email,password:row.password,email_confirm:true,user_metadata:{display_name:'一括課題・架空試験職員'}})).user.id;
  check(await support.from('profiles').upsert({id:row.id,organization_id:orgId,email:row.email,display_name:'一括課題・架空試験職員',role:'admin',active:true}));
  row.recorderId=check(await support.from('profiles').select('recorder_profile_id').eq('id',row.id).single()).recorder_profile_id;
  check(await row.client.auth.signInWithPassword({email:row.email,password:row.password}));
 }
 const call=(body,index=0)=>staff[index].client.functions.invoke('lesson-task-batches',{body});
 const ok=async body=>check(await call(body));
 const learning=async body=>check(await staff[0].client.functions.invoke('lesson-learning',{body}));
 for(let i=0;i<2;i++){
  const child={id:`child-batch-${run}-${i}`,studentId:`student_batch_${run}_${i}`,data:{displayName:`架空児童・一括指定${i}`,campusId:'main',group:i?'B':'A',coins:37,mouseLevel:0,practiceLogs:[]}};children.push(child);
  check(await support.from('children').insert({id:child.id,organization_id:orgId,name:child.data.displayName,birth_date:'2018-01-01'}));
  check(await lesson.from('user_data').insert({id:child.studentId,data:child.data}));
  check(await lesson.from('lesson_support_students').insert({support_project_ref:supportRef,organization_id:orgId,data_table:'user_data',campus_id:'main',student_id:child.studentId,enabled:true}));
  const inspect=await learning({action:'inspect',childId:child.id,studentId:child.studentId});
  child.link=(await learning({action:'link',childId:child.id,studentId:child.studentId,fingerprint:inspect.fingerprint,confirmed:true})).link;
 }
 const config=await ok({action:'configuration'}),targets=config.targets.filter(row=>children.some(child=>child.id===row.childId));
 assert.equal(targets.length,2);assert(targets.every(row=>row.available));assert.deepEqual(targets.map(row=>row.group).sort(),['A','B']);
 assert(!JSON.stringify(targets).includes('student_batch_'),'source IDs not in public targets');
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
 const template={category:'mouse',stageId:'1',title:'一括指定・架空試験',instructions:'クリックを練習',startsOn:today,endsOn:today};
 const prepare=async(selected=targets)=>{
  const operationId=randomUUID();batches.push(operationId);
  return (await ok({action:'prepare',operationId,template,targets:selected})).batch;
 };
 const batch=await prepare();
 assert.equal(check(await lesson.from('lesson_learning_tasks').select('id').in('student_id',children.map(row=>row.studentId))).length,0,'preview must not create source assignments');
 const retry=(await ok({action:'prepare',operationId:batch.operationId,template,targets:[...targets].reverse()})).batch;
 assert.deepEqual(retry,batch);
 assert.equal((await call({action:'prepare',operationId:batch.operationId,template:{...template,title:'変更'},targets})).error?.context.status,409);
 const apply=childId=>ok({action:'apply',operationId:batch.operationId,childId,confirmed:true});
 await apply(children[0].id);
 await apply(children[0].id);
 const taskA=batch.items.find(row=>row.childId===children[0].id).taskId;
 assert.equal(check(await lesson.from('lesson_learning_task_audit').select('id').eq('task_id',taskA)).length,1,'completed receipt retry is read-only');
 check(await support.rpc('mutate_lesson_task_batch',{p_actor:staff[0].id,p_org:orgId,p_id:batch.operationId,p_action:'error',p_child:children[0].id,p_error:'connection'}));
 assert.equal((await ok({action:'load',operationId:batch.operationId})).batch.items.find(row=>row.childId===children[0].id).status,'saved','late failure cannot regress success');
 check(await lesson.from('user_data').update({data:{...children[1].data,group:'変更'}}).eq('id',children[1].studentId));
 const partial=(await apply(children[1].id)).batch;
 assert.equal(partial.items.find(row=>row.childId===children[1].id).status,'pending');
 assert.equal(check(await lesson.from('lesson_learning_tasks').select('id').eq('student_id',children[1].studentId)).length,0,'changed group cannot receive old preview task');
 check(await lesson.from('user_data').update({data:children[1].data}).eq('id',children[1].studentId));
 const done=(await apply(children[1].id)).batch;assert(done.items.every(row=>row.status==='saved'));
 assert((await ok({action:'configuration'})).history.some(row=>row.operationId===batch.operationId&&row.saved===2));
 assert.equal((await call({action:'load',operationId:batch.operationId},1)).error?.context.status,403,'another operator cannot take over an operation');
 assert.equal(check(await staff[1].client.from('lesson_task_batches').select('id').eq('id',batch.operationId)).length,0,'RLS hides other operators');
 const unauth=makeClient();assert.equal((await unauth.functions.invoke('lesson-task-batches',{body:{action:'load',operationId:batch.operationId}})).error?.context.status,401);
 // Simulate a lost support receipt after a source save, then retry concurrently.
 const lost=await prepare([targets[0]]),lostItem=lost.items[0],lostChild=children.find(row=>row.id===lostItem.childId);
 const sourceArgs={p_project:supportRef,p_org:orgId,p_table:'user_data',p_student:lostChild.studentId,p_link:lostItem.linkId,p_child:lostItem.childId,p_id:lostItem.taskId,p_revision:0,
  p_category:template.category,p_title:template.title,p_instructions:template.instructions,p_start:today,p_end:today,p_active:true,p_actor:staff[0].id,p_name:'一括課題・架空試験職員',p_stage:'1',p_expected_group:lostItem.group,p_expected_campus:'main'};
 check(await lesson.rpc('save_support_learning_task',sourceArgs));
 const concurrent=await Promise.all([1,2].map(()=>ok({action:'apply',operationId:lost.operationId,childId:lostItem.childId,confirmed:true})));
 assert(concurrent.every(row=>row.batch.items[0].status==='saved'));
 assert.equal(check(await lesson.from('lesson_learning_task_audit').select('id').eq('task_id',lostItem.taskId)).length,1,'uncertain/concurrent retry cannot duplicate source writes');
 if(process.argv.includes('--batch-changes')){
  const getCandidates=async()=>ok({action:'change-targets',operationId:batch.operationId});
  let current=await getCandidates();assert(current.candidates.every(row=>row.reason==='ready'));
  const changedTemplate={...template,title:'変更後・架空試験',category:'keyboard',stageId:'4301',instructions:'あ〜さのことば'};
  const editId=randomUUID();batches.push(editId);
  const edit=(await ok({action:'prepare-change',operationId:editId,parentId:batch.operationId,kind:'edit',template:changedTemplate,targets:current.candidates})).batch;
  assert.equal(check(await lesson.from('lesson_learning_tasks').select('revision').eq('id',taskA).single()).revision,1,'edit preview cannot mutate source');
  assert.equal((await call({action:'apply',operationId:editId,childId:children[0].id,confirmed:true})).error?.context.status,400,'old clients cannot execute an unlabelled edit/stop');
  assert.equal((await call({action:'prepare-change',operationId:editId,parentId:batch.operationId,kind:'edit',template:{...changedTemplate,title:'違う内容'},targets:current.candidates})).error?.context.status,409);
  const bTask=batch.items.find(row=>row.childId===children[1].id).taskId;
  // Individual editing between preview and execution must be preserved.
  await learning({action:'tasks-save',childId:children[1].id,task:{...template,id:bTask,revision:1,title:'職員が個別編集',active:true}});
  const childA=edit.items.find(row=>row.childId===children[0].id);
  const sourceChange=(operation,item,kind,task)=>({supportProjectRef:supportRef,organizationId:orgId,dataTable:'user_data',studentId:children.find(child=>child.id===item.childId).studentId,
   linkId:item.linkId,childId:item.childId,actorId:staff[0].id,actorName:'一括課題・架空試験職員',expectedGroup:item.group,expectedCampus:item.campusId,operationId:operation,parentId:batch.operationId,kind,task});
  // Save at source but lose the support receipt; concurrent resume must use that receipt.
  check(await lesson.rpc('apply_support_task_batch_change',{p:sourceChange(editId,childA,'edit',{...changedTemplate,id:childA.taskId,revision:childA.before.revision,active:true})}));
  const resumed=await Promise.all([1,2].map(()=>ok({action:'apply',operationId:editId,childId:childA.childId,kind:'edit',confirmed:true})));
  assert(resumed.every(row=>row.batch.items.find(item=>item.childId===childA.childId).status==='saved'));
  assert.equal(check(await lesson.from('lesson_learning_task_audit').select('id').eq('task_id',taskA)).length,2,'one original plus one edit audit');
  const conflict=(await ok({action:'apply',operationId:editId,childId:children[1].id,kind:'edit',confirmed:true})).batch;
  assert.equal(conflict.items.find(row=>row.childId===children[1].id).errorCode,'conflict');
  assert.equal(check(await lesson.from('lesson_learning_tasks').select('title').eq('id',bTask).single()).title,'職員が個別編集');
  current=await getCandidates();assert.equal(current.candidates.find(row=>row.childId===children[1].id).reason,'conflict');
  const eligible=current.candidates.filter(row=>row.reason==='ready');assert.equal(eligible.length,1);
  assert.equal((await call({action:'prepare-change',operationId:randomUUID(),parentId:batch.operationId,kind:'stop',targets:current.candidates})).error?.context.status,409,'individually edited task cannot be selected');
  const stopId=randomUUID();batches.push(stopId);
  const stop=(await ok({action:'prepare-change',operationId:stopId,parentId:batch.operationId,kind:'stop',targets:eligible})).batch;
  const stoppedItem=stop.items[0];assert.equal(stoppedItem.before.title,changedTemplate.title);
  check(await lesson.from('lesson_support_students').update({enabled:false}).eq('student_id',children[0].studentId).eq('organization_id',orgId).eq('support_project_ref',supportRef));
  const deniedStop=(await ok({action:'apply',operationId:stopId,childId:stoppedItem.childId,kind:'stop',confirmed:true})).batch;
  assert.equal(deniedStop.items[0].errorCode,'permission');assert.equal(check(await lesson.from('lesson_learning_tasks').select('active').eq('id',taskA).single()).active,true);
  check(await lesson.from('lesson_support_students').update({enabled:true}).eq('student_id',children[0].studentId).eq('organization_id',orgId).eq('support_project_ref',supportRef));
  const stopTask={...changedTemplate,id:stoppedItem.taskId,revision:stoppedItem.before.revision,active:false};
  check(await lesson.rpc('apply_support_task_batch_change',{p:sourceChange(stopId,stoppedItem,'stop',stopTask)}));
  await learning({action:'tasks-save',childId:stoppedItem.childId,task:{...stopTask,revision:3,title:'停止後の個別編集'}});
  const later=check(await lesson.from('lesson_learning_tasks').select('*').eq('id',taskA).single());assert.equal(later.revision,4);
  const stopped=(await ok({action:'apply',operationId:stopId,childId:stoppedItem.childId,kind:'stop',confirmed:true})).batch;
  assert.equal(stopped.items[0].status,'saved');
  assert.deepEqual(check(await lesson.from('lesson_learning_tasks').select('*').eq('id',taskA).single()),later,'historical stop receipt must not revert a later individual edit');
  current=await getCandidates();assert.equal(current.candidates.find(row=>row.childId===children[0].id).reason,'stopped');
  assert((await ok({action:'configuration'})).history.some(row=>row.operationId===stopId&&row.kind==='stop'&&row.parentId===batch.operationId&&row.saved===1));
  console.log('PASS: live bulk edit/stop previews, kind confirmation, immutable changes, individual-edit race rejection, excluded conflicts/stopped tasks, permission withdrawal, lost edit/stop receipts, concurrent retries, later edits preserved and typed history');
 }
 const changed=await prepare([targets[1]]);
 check(await support.from('lesson_child_links').update({revision:2}).eq('id',targets[1].linkId));
 const stopped=(await ok({action:'apply',operationId:changed.operationId,childId:targets[1].childId,confirmed:true})).batch;
 assert.equal(stopped.items[0].errorCode,'changed');
 assert.equal(check(await lesson.from('lesson_learning_tasks').select('id').eq('id',stopped.items[0].taskId)).length,0);
 check(await support.from('profiles').update({role:'staff'}).eq('id',staff[0].id));
 assert.equal((await call({action:'apply',operationId:changed.operationId,childId:targets[1].childId,confirmed:true})).error?.context.status,403);
 check(await support.from('profiles').update({role:'admin'}).eq('id',staff[0].id));
 for(const child of children)assert.deepEqual(check(await lesson.from('user_data').select('data').eq('id',child.studentId).single()).data,child.data,'assignments do not modify learner progress');
 console.log('PASS: live two-child preview/create, partial failure/resume, immutable previews, own history/RLS, permission revocation, changed links, lost receipt/concurrent retries, monotonic receipts and unchanged progress');
}finally{
 const errors=[];const clean=async(query,label)=>{try{check(await query);}catch{errors.push(label);}};
 if(batches.length){await clean(support.from('lesson_task_batches').delete().in('id',batches).eq('organization_id',orgId).neq('kind','create'),'batch changes');await clean(support.from('lesson_task_batches').delete().in('id',batches).eq('organization_id',orgId),'batches');}
 for(const child of children){
  await clean(lesson.from('lesson_support_students').delete().eq('student_id',child.studentId).eq('organization_id',orgId).eq('support_project_ref',supportRef),'permit');
  await clean(lesson.from('user_data').delete().eq('id',child.studentId),'learner');
  if(child.link){await clean(support.from('lesson_link_audit').delete().eq('link_id',child.link.id),'audit');await clean(support.from('lesson_child_links').delete().eq('id',child.link.id),'link');}
  await clean(support.from('children').delete().eq('id',child.id).eq('organization_id',orgId),'child');
 }
 for(const row of staff){
  await row.client.auth.signOut({scope:'local'});
  if(row.id)await clean(support.auth.admin.deleteUser(row.id),'staff auth');
  if(row.recorderId)await clean(support.from('recorder_profiles').delete().eq('id',row.recorderId).eq('organization_id',orgId),'recorder');
  await clean(support.from('member_invitations').delete().eq('id',row.invitationId).eq('organization_id',orgId),'invitation');
 }
 if(errors.length)throw Error('Fictional fixture cleanup requires attention: '+errors.join(', '));
 const remaining=check(await lesson.from('user_data').select('id').in('id',children.map(row=>row.studentId)));
 assert.equal(remaining.length,0,'fictional source rows must be removed');
 const after=rowSnapshot(),changed=[];
 for(const original of originals){
  const current=after.find(row=>row.id===original.id);
  assert(current,'An original operational row was removed; do not restore it automatically');
  assert.equal(current.identity,original.identity,'Original identity/account binding changed during test; never restore operational rows');
  if(current.hash!==original.hash)changed.push(...new Set([...Object.keys(original.fields||{}),...Object.keys(current.fields||{})].filter(key=>original.fields?.[key]!==current.fields?.[key])));
 }
 if(snapshot()===before)console.log('PASS: fictional fixtures removed; original operational learning data unchanged');
 else console.log(JSON.stringify({passed:true,fictionalFixturesRemoved:true,originalIdentityBindingsUnchanged:true,concurrentChangedFieldNames:[...new Set(changed)].sort(),newOperationalRows:after.filter(row=>!originals.some(original=>original.id===row.id)).length,restoredOperationalRows:false}));
}
