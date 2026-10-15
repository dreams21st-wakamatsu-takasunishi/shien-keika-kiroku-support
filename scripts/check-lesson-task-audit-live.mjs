import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {clients,cli,supportRef} from './lesson-operation-client.mjs';
import {parseAuditPage} from '../src/learning/taskBatchAudit.ts';
if(!process.argv.includes('--run-fictional-test'))throw Error('Use --run-fictional-test');
const {support}=clients(),run=randomUUID(),staff=[],orgs=[randomUUID(),randomUUID()],batchIds=[];
const check=result=>{if(result.error)throw Error('Isolated task audit check failed: '+result.error.code);return result.data;};
const anon=JSON.parse(cli(['projects','api-keys','--project-ref',supportRef,'--reveal','-o','json'])).find(key=>key.name==='anon').api_key;
const client=()=>createClient(`https://${supportRef}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const filters={kind:'all',state:'all',actorId:null},time='2026-10-01T01:00:00.123456+00:00';
try{
 for(const id of orgs)check(await support.from('organizations').insert({id,name:'一括課題履歴・隔離試験事業所'}));
 for(let i=0;i<3;i++){
  const row={org:orgs[i===2?1:0],invitationId:randomUUID(),email:`audit-check-${run}-${i}@example.com`,password:randomBytes(24).toString('hex'),client:client()};staff.push(row);
  check(await support.from('member_invitations').insert({id:row.invitationId,organization_id:row.org,email:row.email,role:'admin'}));
  row.id=check(await support.auth.admin.createUser({email:row.email,password:row.password,email_confirm:true,user_metadata:{display_name:`架空履歴職員${i}`}})).user.id;
  check(await support.from('profiles').update({display_name:`架空履歴職員${i}`,role:'admin',active:true}).eq('id',row.id).eq('organization_id',row.org));
  row.recorderId=check(await support.from('profiles').select('recorder_profile_id').eq('id',row.id).single()).recorder_profile_id;
  check(await row.client.auth.signInWithPassword({email:row.email,password:row.password}));
 }
 const template={category:'mouse',stageId:'1',title:'架空の履歴課題',instructions:'架空試験',startsOn:'2026-10-01',endsOn:'2026-10-02'};
 const create=async(i,org,actor,parentId=null)=>{
  const id=randomUUID(),kind=parentId?i%2?'edit':'stop':'create',taskId=randomUUID();batchIds.push(id);
  const item={childId:`audit-fixture-${i}`,linkId:randomUUID(),revision:1,campusId:'main',group:'A',available:true,taskId,
   status:i%2?'pending':'saved',errorCode:i%2?'connection':'',savedAt:i%2?null:time,
   ...(kind==='create'?{}:{before:{...template,id:taskId,revision:1,active:true,updatedAt:time}})};
  check(await support.from('lesson_task_batches').insert({id,organization_id:org,actor_id:actor,template,targets:[{...item,studentId:'student_DO_NOT_RETURN',sourceTable:'DO_NOT_RETURN'}],items:[item],created_at:time,kind,parent_id:parentId}));
  return id;
 };
 const base=await create(0,orgs[0],staff[0].id);
 for(let i=1;i<23;i++)await create(i,orgs[0],staff[i%2].id,i%3?base:null);
 const foreign=await create(30,orgs[1],staff[2].id);
 const baseline=check(await support.from('lesson_task_batches').select('*').in('id',batchIds).order('id'));
 const call=(body,index=0)=>staff[index].client.functions.invoke('lesson-task-audit',{body});
 const list=async(patch={},cursor=null,index=0)=>{
  const requested={...filters,...patch},result=await call({action:'list',filters:requested,cursor},index);
  if(result.error){
   const context=await staff[index].client.rpc('get_lesson_learning_context'),allowed=await staff[index].client.rpc('can_view_lesson_task_audit');
   const direct=await staff[index].client.rpc('read_lesson_task_audit',{p_kind:requested.kind,p_state:requested.state,p_actor:requested.actorId,p_before:cursor?.createdAt||null,p_before_id:cursor?.operationId||null});
   let validProjection=false;try{parseAuditPage(direct.data,requested,cursor);validProjection=true;}catch{/* Report only shape validity, never raw returned values. */}
   throw Error('Task audit diagnostic '+JSON.stringify({status:result.error.context?.status,contextCode:context.error?.code,allowed:allowed.data===true,readCode:direct.error?.code,validProjection}));
  }
  return result.data;
 };
 const first=await list();assert.equal(first.entries.length,20);assert(first.nextCursor);assert.equal(first.organizationId,orgs[0]);
 assert.equal(first.nextCursor.createdAt,time,'cursor must retain submillisecond database precision');
 const second=await list({},first.nextCursor);assert.equal(second.entries.length,3);assert.equal(second.nextCursor,null);
 const ids=[...first.entries,...second.entries].map(row=>row.operationId);
 assert.equal(new Set(ids).size,23);assert.deepEqual([...ids].sort(),batchIds.filter(id=>id!==foreign).sort());
 assert(!JSON.stringify(first).includes('DO_NOT_RETURN'));assert(!JSON.stringify(first).includes('@example.com'));
 assert(first.entries.some(row=>row.actorId===staff[1].id),'admin can observe another creator');
 for(const kind of ['create','edit','stop'])assert((await list({kind})).entries.every(row=>row.kind===kind));
 assert((await list({state:'pending'})).entries.every(row=>row.saved<row.total));
 assert((await list({state:'completed'})).entries.every(row=>row.saved===row.total));
 assert((await list({actorId:staff[1].id})).entries.every(row=>row.actorId===staff[1].id));
 assert.equal((await list({actorId:staff[2].id})).entries.length,0);
 const other=await list({},null,2);assert.deepEqual(other.entries.map(row=>row.operationId),[foreign]);
 assert.equal((await call({action:'detail',operationId:foreign,filters,cursor:null})).error?.context.status,403);
 assert.equal((await call({action:'detail',operationId:base,filters,cursor:null},2)).error?.context.status,403);
 const detail=check(await call({action:'detail',operationId:ids.find(id=>id!==base),filters,cursor:null},1));
 assert(!JSON.stringify(detail).includes('DO_NOT_RETURN'));assert.equal(detail.batch.operationId,detail.entry.operationId);
 const direct=check(await staff[1].client.rpc('read_lesson_task_audit',{p_action:'detail',p_id:base}));
 assert(!JSON.stringify(direct).includes('DO_NOT_RETURN'),'direct RPC also excludes source targets');
 assert.equal(check(await staff[1].client.from('lesson_task_batches').select('id').eq('id',base)).length,0,'underlying table remains creator-only');
 assert.equal((await staff[1].client.functions.invoke('lesson-task-batches',{body:{action:'load',operationId:base}})).error?.context.status,403,'audit cannot take over mutation history');
 assert.equal((await call({action:'apply',operationId:base,filters,cursor:null})).error?.context.status,400);
 assert.equal((await call({action:'list',filters:{...filters,kind:'delete'},cursor:null})).error?.context.status,400);
 assert.equal((await call({action:'list',filters,cursor:{createdAt:time,operationId:'bad'}})).error?.context.status,400);
 assert((await staff[0].client.rpc('read_lesson_task_audit',{p_kind:'delete'})).error,'direct invalid filter rejected');
 const listLinks=check(await staff[0].client.functions.invoke('lesson-learning',{body:{action:'list'}}));assert.equal(listLinks.canViewTaskAudit,true);
 check(await support.from('profiles').update({active:false}).eq('id',staff[1].id));
 assert.equal((await call({action:'list',filters,cursor:null},1)).error?.context.status,403);
 assert.equal((await list()).actors.find(row=>row.id===staff[1].id).active,false,'inactive creator remains visible in history');
 check(await support.from('profiles').update({active:true,role:'manager'}).eq('id',staff[1].id));
 assert.equal(check(await staff[1].client.rpc('can_view_lesson_task_audit')),false,'manager does not inherit admin history');
 assert.equal((await call({action:'list',filters,cursor:null},1)).error?.context.status,403);
 assert.equal((await staff[1].client.rpc('read_lesson_task_audit',{})).error?.code,'42501');
 const noAuth=client();assert.equal((await noAuth.functions.invoke('lesson-task-audit',{body:{action:'list',filters,cursor:null}})).error?.context.status,401);
 assert((await noAuth.rpc('read_lesson_task_audit',{})).error);
 assert.deepEqual(check(await support.from('lesson_task_batches').select('*').in('id',batchIds).order('id')),baseline,'all history reads leave immutable batches and receipts unchanged');
 console.log('PASS: isolated live admin cross-creator read, tie-safe pagination, filters, organization isolation, unauth/inactive/downgraded denial, direct RPC/RLS boundaries, no takeover and unchanged receipts');
}finally{
 const errors=[],clean=async(query,label)=>{try{check(await query);}catch{errors.push(label);}};
 if(batchIds.length){await clean(support.from('lesson_task_batches').delete().in('id',batchIds).neq('kind','create'),'change fixtures');await clean(support.from('lesson_task_batches').delete().in('id',batchIds),'creation fixtures');}
 for(const row of staff){
  await row.client.auth.signOut({scope:'local'});
  if(row.id)await clean(support.auth.admin.deleteUser(row.id),'fictional staff auth');
  if(row.recorderId)await clean(support.from('recorder_profiles').delete().eq('id',row.recorderId).eq('organization_id',row.org),'fictional recorder');
  await clean(support.from('member_invitations').delete().eq('id',row.invitationId).eq('organization_id',row.org),'fictional invitation');
 }
 for(const id of orgs)await clean(support.from('organizations').delete().eq('id',id),'fictional organization');
 if(errors.length)throw Error('Fixture cleanup requires attention: '+errors.join(', '));
 assert.equal(check(await support.from('organizations').select('id').in('id',orgs)).length,0);
 assert.equal(check(await support.from('lesson_task_batches').select('id').in('id',batchIds)).length,0);
 console.log('PASS: fictional organizations/staff/task history removed; no real children, source learning data, Auth or passphrases were changed');
}
