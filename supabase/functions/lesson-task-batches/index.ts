import {createClient} from 'npm:@supabase/supabase-js@2';
import {parseTaskBatch,parseTaskTargets,parseTaskTemplate,desiredBatchTask,type ChangeCandidate,type TaskBatch,type BatchError,type TaskTarget} from '../../../src/learning/taskBatches.ts';
import {parseLearningTask,parseTaskDetails} from '../../../src/learning/tasks.ts';
import {credentialUuid as uuid} from '../../../src/learning/accountCredentials.ts';
import type {LessonLink} from '../../../src/learning/contracts.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type,x-support-device-token','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const failure=(message:string,status:number,code?:BatchError)=>Object.assign(new Error(message),{status,code});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return reply({error:'POSTで送信してください。'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!,authorization=request.headers.get('authorization')||'';
  const user=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false},global:{headers:{Authorization:authorization,'x-support-device-token':request.headers.get('x-support-device-token')||''}}});
  const {data:auth,error:authError}=await user.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
  if(authError||!auth.user)throw failure('職員アカウントでログインしてください。',401);
  const context=async()=>{
   const {data,error}=await user.rpc('get_lesson_learning_context');
   if(error||!data||data.actorId!==auth.user!.id||data.canManageLinks!==true)throw failure('この端末または職員権限では課題を指定できません。',403);
   return data as {actorId:string;organizationId:string;actorName:string};
  };
  const initial=await context();
  const recheck=async()=>{const latest=await context();if(latest.organizationId!==initial.organizationId)throw failure('職員の所属が変更されました。',403);return latest;};
  const raw=await request.text();if(raw.length>262144)throw failure('指定内容が長すぎます。',400);
  let body;try{body=JSON.parse(raw);}catch{throw failure('指定内容を確認してください。',400);}
  if(!['configuration','prepare','load','apply','change-targets','prepare-change'].includes(body?.action))throw failure('操作を確認してください。',400);
  const sourceProject=Deno.env.get('D_LESSON_PROJECT_REF')||'',secret=Deno.env.get('D_LESSON_BRIDGE_SECRET')||'';
  if(!/^[a-z0-9]{20}$/.test(sourceProject)||secret.length<32)throw failure('学習連携の設定が未完了です。',503);
  const bridge=async(payload:Record<string,unknown>)=>{
   let response:Response;
   try{response=await fetch(`https://${sourceProject}.supabase.co/functions/v1/support-learning-tasks`,{method:'POST',headers:{'Content-Type':'application/json','x-lesson-bridge-key':secret},
    body:JSON.stringify({...payload,supportProjectRef:new URL(url).hostname.split('.')[0],organizationId:initial.organizationId,actorId:initial.actorId,actorName:initial.actorName}),signal:AbortSignal.timeout(25000),redirect:'error'});}
   catch{throw failure('通信結果を確認できません。同じ指定で再確認してください。',503,'connection');}
   const data=await response.json().catch(()=>null);
   if(!response.ok)throw failure('学習側の指定結果を確認できません。',response.status===403?403:503,
    response.status===403?'permission':data?.code==='22023'?'capacity':data?.code==='PT412'?'changed':data?.code==='PT409'?'conflict':'connection');
   if(data?.schemaVersion!==1)throw failure('学習連携の応答を確認できません。',503,'connection');
   return data;
  };
  const readLinks=async()=>{
   const {data,error}=await user.from('lesson_child_links').select('*').eq('organization_id',initial.organizationId).eq('active',true).eq('source_project_ref',sourceProject).limit(501);
   if(error||!data||data.length>500)throw failure('対象一覧を取得できません。500名を超える場合は個別指定をご利用ください。',503);
   return data as LessonLink[];
  };
  const configuration=async()=>{
   const links=await readLinks(),targets:TaskTarget[]=[];let catalog:ReturnType<typeof parseTaskDetails>['catalog']=[];
   // Fetch one source snapshot per chunk, without transferring names, credentials or learning data.
   for(let start=0;start<Math.max(1,links.length);start+=100){
    const chunk=links.slice(start,start+100),data=await bridge({action:'targets',targets:chunk.map(link=>({childId:link.child_id,linkId:link.id,studentId:link.source_student_id,campusId:link.source_campus_id}))});
    if(!Array.isArray(data.targets)||data.targets.length!==chunk.length)throw failure('対象の所属を確認できません。',503);
    catalog=parseTaskDetails({schemaVersion:1,tasks:[],results:[],catalog:data.catalog}).catalog;
    for(const link of chunk){
     const row=data.targets.find((item:{childId:string;linkId:string})=>item.childId===link.child_id&&item.linkId===link.id);
     if(!row||typeof row.available!=='boolean'||typeof row.group!=='string'||row.group.length>80)throw failure('対象の所属を確認できません。',503);
     targets.push({childId:link.child_id,linkId:link.id,revision:link.revision,campusId:link.source_campus_id,group:row.group,available:row.available&&data.dataTable===link.source_table});
    }
   }
   await recheck();const latest=await readLinks();
   if(latest.length!==links.length||!links.every(link=>latest.some(current=>current.id===link.id&&current.revision===link.revision)))throw failure('連携一覧が変更されました。再取得してください。',409);
   return {links,targets:parseTaskTargets(targets),catalog};
  };
  if(body.action==='configuration'){
   const config=await configuration();
   const {data:history,error}=await user.from('lesson_task_batches').select('id,template,created_at,items,kind,parent_id').eq('organization_id',initial.organizationId).eq('actor_id',initial.actorId).order('created_at',{ascending:false}).limit(20);
   if(error)throw failure('一括指定の履歴を取得できません。',503);
   await recheck();return reply({schemaVersion:1,targets:config.targets,catalog:config.catalog,history:(history||[]).map(row=>({operationId:row.id,title:row.template.title,createdAt:row.created_at,total:row.items.length,saved:row.items.filter((item:{status:string})=>item.status==='saved').length,kind:row.kind,parentId:row.parent_id}))});
  }
  if(!uuid(body.operationId))throw failure('指定履歴を確認してください。',400);
  const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const mutate=async(action:string,args:Record<string,unknown>={})=>{
   await recheck();
   const {data,error}=await service.rpc('mutate_lesson_task_batch',{p_actor:initial.actorId,p_org:initial.organizationId,p_id:body.operationId,p_action:action,...args});
   if(error)throw failure(error.code==='42501'?'一括指定の権限を確認してください。':error.code==='PT429'?'連続指定の上限です。時間をおいてください。':'児童の連携または指定内容が変更されています。',error.code==='42501'?403:409,error.code==='PT409'?'changed':undefined);
   return data;
  };
  const project=(row:{id:string;template:unknown;created_at:string;items:unknown;kind?:string;parent_id?:string},id=body.operationId)=>parseTaskBatch({operationId:row.id,template:row.template,createdAt:row.created_at,items:row.items,kind:row.kind,parentId:row.parent_id},id);
  const baseBatch=async(id:string)=>{
   if(!uuid(id))throw failure('元の一括指定を選択してください。',400);
   const {data,error}=await user.from('lesson_task_batches').select('*').eq('id',id).eq('organization_id',initial.organizationId).eq('actor_id',initial.actorId).eq('kind','create').maybeSingle();
   if(error||!data)throw failure('自分が作成した一括指定を選択してください。',403);
   return {row:data as {targets:Record<string,unknown>[]},batch:project(data,id)};
  };
  const changeTargets=async(base:{row:{targets:Record<string,unknown>[]};batch:TaskBatch})=>{
   const links=await readLinks();
   const linked=base.batch.items.filter(item=>item.status==='saved'&&links.some(link=>link.id===item.linkId&&link.revision===item.revision&&link.source_campus_id===item.campusId));
   const data=await bridge({action:'batch-current',parentId:base.batch.operationId,targets:linked.map(item=>{
    const target=base.row.targets.find(row=>row.childId===item.childId)!;
    return {childId:item.childId,linkId:item.linkId,campusId:item.campusId,studentId:target.studentId,taskId:item.taskId};
   })});
   if(!Array.isArray(data.targets)||data.targets.length!==linked.length)throw failure('現在の課題を確認できません。',503);
   const candidates:ChangeCandidate[]=base.batch.items.map(item=>{
    const source=data.targets.find((row:{childId:string;linkId:string})=>row.childId===item.childId&&row.linkId===item.linkId);
    let task;
    if(source?.available===true&&data.dataTable===base.row.targets.find(row=>row.childId===item.childId)?.sourceTable){
     if(typeof source.group!=='string'||source.group.length>80||!Number.isSafeInteger(source.managedRevision)||source.managedRevision<1)throw failure('課題の状態を確認できません。',503);
     task=parseLearningTask(source.task);if(task.id!==item.taskId)throw failure('課題の本人対応が一致しません。',503);
    }
    const reason=item.status!=='saved'?'not-created':!task?'changed':!task.active?'stopped':task.revision!==source.managedRevision?'conflict':'ready';
    return {childId:item.childId,linkId:item.linkId,revision:item.revision,campusId:item.campusId,group:task?source.group:item.group,available:!!task,taskId:item.taskId,reason,...(task?{task}:{})};
   });
   await recheck();const latest=await readLinks();
   if(!linked.every(item=>latest.some(link=>link.id===item.linkId&&link.revision===item.revision)))throw failure('児童の連携が変更されました。再取得してください。',409);
   return {schemaVersion:1,parentId:base.batch.operationId,candidates,catalog:parseTaskDetails({schemaVersion:1,tasks:[],results:[],catalog:data.catalog}).catalog};
  };
  if(body.action==='change-targets')return reply(await changeTargets(await baseBatch(body.operationId)));
  if(body.action==='prepare-change'){
   if(!['edit','stop'].includes(body.kind))throw failure('変更または停止を選択してください。',400);
   const base=await baseBatch(body.parentId),current=await changeTargets(base);
   let selected,template;try{selected=parseTaskTargets(body.targets);template=body.kind==='stop'?base.batch.template:parseTaskTemplate(body.template);}catch{throw failure('対象児童と変更内容を確認してください。',400);}
   if(!selected.length||selected.length>100)throw failure('対象児童は1〜100名を選択してください。',400);
   if(body.kind==='edit'&&template.stageId&&!current.catalog.some(stage=>stage.category===template.category&&stage.stageId===template.stageId))throw failure('ステージを選び直してください。',400);
   const targets=selected.map(target=>{
    const row=current.candidates.find(row=>row.childId===target.childId),requested=body.targets.find((row:ChangeCandidate)=>row.childId===target.childId);
    if(!row||row.reason!=='ready'||!target.available||requested.taskId!==row.taskId||row.linkId!==target.linkId||row.revision!==target.revision||row.group!==target.group||row.campusId!==target.campusId||!requested.task
     ||JSON.stringify(parseLearningTask(requested.task))!==JSON.stringify(row.task))throw failure('現在の課題が変更されています。再取得してください。',409);
    const original=base.row.targets.find(row=>row.childId===target.childId)!;
    return {...original,group:row.group,taskId:row.taskId,before:row.task};
   });
   await recheck();
   const {data,error}=await service.rpc('prepare_lesson_task_batch_change',{p_actor:initial.actorId,p_org:initial.organizationId,p_id:body.operationId,p_parent:body.parentId,p_kind:body.kind,p_template:template,p_targets:targets});
   if(error)throw failure(error.code==='42501'?'一括変更の権限を確認してください。':error.code==='PT429'?'連続操作の上限です。時間をおいてください。':'対象児童または変更内容が一致しません。',error.code==='42501'?403:409);
   return reply({batch:project(data)});
  }
  if(body.action==='prepare'){
   let template,selected;try{template=parseTaskTemplate(body.template);selected=parseTaskTargets(body.targets);}catch{throw failure('課題と対象児童を確認してください。',400);}
   if(!selected.length||selected.length>100||selected.some(row=>!row.available))throw failure('対象児童は1〜100名を選択してください。',400);
   const config=await configuration();
   if(template.stageId&&!config.catalog.some(stage=>stage.category===template.category&&stage.stageId===template.stageId))throw failure('ステージを選び直してください。',400);
   const targets=selected.map(target=>{
    const current=config.targets.find(row=>row.childId===target.childId);
    if(!current||!current.available||current.linkId!==target.linkId||current.revision!==target.revision||current.campusId!==target.campusId||current.group!==target.group)throw failure('児童の所属・連携が変更されました。再取得してください。',409);
    const link=config.links.find(row=>row.id===current.linkId)!;
    return {...current,sourceProject:link.source_project_ref,sourceTable:link.source_table,studentId:link.source_student_id};
   });
   return reply({batch:project(await mutate('prepare',{p_template:template,p_targets:targets}))});
  }
  const {data:stored,error}=await user.from('lesson_task_batches').select('*').eq('id',body.operationId).eq('organization_id',initial.organizationId).eq('actor_id',initial.actorId).maybeSingle();
  if(error||!stored)throw failure('一括指定の履歴を確認できません。',403);
  const batch=project(stored);
  if(body.action==='load'){await recheck();return reply({batch});}
  if(body.confirmed!==true||typeof body.childId!=='string')throw failure('対象と内容を確認してください。',400);
  if((body.kind||'create')!==(batch.kind||'create'))throw failure('操作の種類を確認して履歴を開き直してください。',400);
  const item=batch.items.find(row=>row.childId===body.childId);
  if(!item)throw failure('対象児童を確認してください。',400);
  if(item.status==='saved'){await recheck();return reply({batch});}
  try{
   await mutate('check',{p_child:item.childId});
   const target=stored.targets.find((row:TaskTarget)=>row.childId===item.childId);
   const desired=desiredBatchTask(batch,item);
   const result=await bridge({action:batch.kind?'batch-change':'save',studentId:target.studentId,childId:item.childId,linkId:item.linkId,expectedGroup:item.group,expectedCampus:item.campusId,
    ...(batch.kind?{kind:batch.kind,parentId:batch.parentId,operationId:batch.operationId}:{}),task:desired});
   const saved=parseLearningTask(result.task);
   if(saved.id!==item.taskId||saved.revision!==desired.revision+1||saved.active!==desired.active||saved.category!==desired.category||saved.stageId!==desired.stageId||saved.title!==desired.title
    ||saved.instructions!==desired.instructions||saved.startsOn!==desired.startsOn||saved.endsOn!==desired.endsOn)throw failure('指定結果が一致しません。個別に確認してください。',409,'conflict');
   return reply({batch:project(await mutate('receipt',{p_child:item.childId}))});
  }catch(error){
   // A delayed failure never replaces a persisted success receipt.
   const code=(error as {code?:BatchError}).code;
   if(!code)throw error;
   return reply({batch:project(await mutate('error',{p_child:item.childId,p_error:code}))});
  }
 }catch(error){const result=error as Error&{status?:number};return reply({error:result.status?result.message:'一括指定を確認できません。通信と設定を確認してください。'},result.status||503);}
});
