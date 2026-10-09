import {credentialUuid as uuid} from './accountCredentials.ts';
import {parseLearningTask,parseTaskDetails,type LearningTask,type TaskStage} from './tasks.ts';
export type TaskTemplate=Pick<LearningTask,'category'|'stageId'|'title'|'instructions'|'startsOn'|'endsOn'>;
export interface TaskTarget {childId:string;linkId:string;revision:number;campusId:string;group:string;available:boolean}
export const batchErrors={connection:'通信結果が未確定です。同じ課題で再確認してください。',changed:'児童の所属・連携が変更されています。個別に確認してください。',capacity:'有効な課題が上限に達しています。個別に確認してください。',conflict:'課題が別途変更されています。個別に確認してください。',permission:'連携許可または職員権限を確認してください。'} as const;
export type BatchError=keyof typeof batchErrors;
export type BatchKind='create'|'edit'|'stop';
export const batchKindNames={create:'追加',edit:'変更',stop:'停止'} as const;
export interface BatchItem extends TaskTarget {taskId:string;status:'pending'|'saved';errorCode:BatchError|'';savedAt:string|null;before?:LearningTask}
export interface TaskBatch {operationId:string;template:TaskTemplate;createdAt:string;items:BatchItem[];kind?:'edit'|'stop';parentId?:string}
export interface BatchSummary {operationId:string;title:string;createdAt:string;total:number;saved:number;kind?:'edit'|'stop';parentId?:string}
export const changeReasons={ready:'変更可能','not-created':'元の課題が未作成',changed:'所属・連携または課題の確認が必要',stopped:'停止済み',conflict:'個別に変更された課題（対象外）'} as const;
export interface ChangeCandidate extends TaskTarget {taskId:string;reason:keyof typeof changeReasons;task?:LearningTask}
export function parseChangeCandidates(value:unknown,base:TaskBatch):{candidates:ChangeCandidate[];catalog:TaskStage[]}{
 const row=value as {schemaVersion:number;parentId:string;candidates:ChangeCandidate[];catalog:unknown};
 if(row?.schemaVersion!==1||row.parentId!==base.operationId||!Array.isArray(row.candidates)||row.candidates.length!==base.items.length||base.kind)throw Error('変更対象の課題を確認できません。');
 const targets=parseTaskTargets(row.candidates);
 const candidates=row.candidates.map((item,index)=>{
  const original=base.items.find(target=>target.childId===item.childId);
  if(!original||original.linkId!==item.linkId||original.revision!==item.revision||original.campusId!==item.campusId||original.taskId!==item.taskId||!Object.hasOwn(changeReasons,item.reason))throw Error('変更対象が一致しません。');
  const task=item.task?parseLearningTask(item.task):undefined;
  if(task&&task.id!==original.taskId||item.reason==='ready'&&(!task?.active||!item.available)||item.reason==='stopped'&&(!task||task.active))throw Error('変更対象の状態を確認できません。');
  return {...targets[index],taskId:item.taskId,reason:item.reason,...(task?{task}:{})};
 });
 return {candidates,catalog:parseTaskDetails({schemaVersion:1,tasks:[],results:[],catalog:row.catalog}).catalog};
}
export function desiredBatchTask(batch:TaskBatch,item:BatchItem){
 if(batch.kind&&!item.before)throw Error('変更前の課題がありません。');
 const template=batch.kind==='stop'?parseTaskTemplate(item.before):batch.template;
 return {...template,id:item.taskId,revision:item.before?.revision??0,active:batch.kind!=='stop'};
}
export function filterTaskTargets(targets:TaskTarget[],campus:string,group:string|null){return targets.filter(row=>(!campus||row.campusId===campus)&&(group===null||row.group===group));}
export function assertSameTaskBatch(current:TaskBatch,next:TaskBatch){
 if(current.operationId!==next.operationId||current.kind!==next.kind||current.parentId!==next.parentId||JSON.stringify(current.template)!==JSON.stringify(next.template)||current.createdAt!==next.createdAt||current.items.length!==next.items.length
  ||!current.items.every(item=>next.items.some(row=>row.childId===item.childId&&row.linkId===item.linkId&&row.revision===item.revision&&row.taskId===item.taskId&&row.campusId===item.campusId&&row.group===item.group&&JSON.stringify(row.before)===JSON.stringify(item.before)&&(item.status!=='saved'||row.status==='saved'))))throw Error('一括指定の結果が一致しません。履歴を再取得してください。');
 return next;
}
const timestamp=(value:unknown):value is string=>typeof value==='string'&&value.length<=50&&Number.isFinite(Date.parse(value));
export function parseTaskTemplate(value:unknown):TaskTemplate {
 const task=parseLearningTask({...value as object,id:'11111111-1111-4111-8111-111111111111',revision:1,active:true,updatedAt:'2026-01-01T00:00:00Z'});
 return {category:task.category,...(task.stageId?{stageId:task.stageId}:{}),title:task.title.trim(),instructions:task.instructions,startsOn:task.startsOn,endsOn:task.endsOn};
}
export function parseTaskTargets(value:unknown):TaskTarget[] {
 if(!Array.isArray(value)||value.length>500)throw Error('一括指定の対象を確認できません。');
 const children=new Set<string>(),links=new Set<string>();
 return value.map((row:TaskTarget)=>{
  if(!row||typeof row.childId!=='string'||!row.childId||row.childId.length>160||children.has(row.childId)||!uuid(row.linkId)||links.has(row.linkId)
   ||!Number.isSafeInteger(row.revision)||row.revision<1||typeof row.campusId!=='string'||!row.campusId||row.campusId==='public'||row.campusId.length>80
   ||typeof row.group!=='string'||row.group.length>80||typeof row.available!=='boolean')throw Error('一括指定の対象を確認できません。');
  children.add(row.childId);links.add(row.linkId);
  return {childId:row.childId,linkId:row.linkId,revision:row.revision,campusId:row.campusId,group:row.group,available:row.available};
 });
}
export function parseTaskBatch(value:unknown,expectedId:string):TaskBatch {
 const row=value as TaskBatch;
 if(!row||row.operationId!==expectedId||!uuid(row.operationId)||!timestamp(row.createdAt)||!Array.isArray(row.items)||!row.items.length||row.items.length>100)throw Error('一括指定の履歴を確認できません。');
 const targets=parseTaskTargets(row.items),seen=new Set<string>();
 const kind=parseBatchKind(row);
 const items=row.items.map((item,index):BatchItem=>{
  if(!uuid(item.taskId)||seen.has(item.taskId)||!['pending','saved'].includes(item.status)||!(item.errorCode===''||Object.hasOwn(batchErrors,item.errorCode))
   ||(item.status==='saved'? !timestamp(item.savedAt)||item.errorCode!=='':item.savedAt!==null))throw Error('一括指定の結果を確認できません。');
  const before=kind?parseLearningTask(item.before):undefined;
  if(before&&(before.id!==item.taskId||!before.active))throw Error('変更前の課題が一致しません。');
  seen.add(item.taskId);return {...targets[index],taskId:item.taskId,status:item.status,errorCode:item.errorCode,savedAt:item.savedAt,...(before?{before}:{})};
 });
 return {operationId:row.operationId,template:parseTaskTemplate(row.template),createdAt:row.createdAt,items,...(kind?{kind,parentId:row.parentId}:{})};
}
function parseBatchKind(row:{kind?:unknown;parentId?:unknown;operationId?:unknown}):'edit'|'stop'|undefined{
 if(row.kind==null||row.kind==='create'){if(row.parentId!=null)throw Error('元の一括指定を確認できません。');return;}
 if(!['edit','stop'].includes(row.kind as string)||!uuid(row.parentId)||row.parentId===row.operationId)throw Error('一括変更の操作を確認できません。');
 return row.kind as 'edit'|'stop';
}
export function parseBatchConfiguration(value:unknown):{targets:TaskTarget[];catalog:TaskStage[];history:BatchSummary[]} {
 const row=value as {schemaVersion:number;targets:unknown;catalog:unknown;history:BatchSummary[]};
 if(row?.schemaVersion!==1||!Array.isArray(row.history)||row.history.length>20)throw Error('一括指定の設定を確認できません。');
 const catalog=parseTaskDetails({schemaVersion:1,tasks:[],results:[],catalog:row.catalog}).catalog;
 const seen=new Set<string>();
 const history=row.history.map(item=>{
  if(!item||!uuid(item.operationId)||seen.has(item.operationId)||typeof item.title!=='string'||!item.title.trim()||item.title.length>80||!timestamp(item.createdAt)
   ||!Number.isSafeInteger(item.total)||item.total<1||item.total>100||!Number.isSafeInteger(item.saved)||item.saved<0||item.saved>item.total)throw Error('一括指定の履歴を確認できません。');
  const kind=parseBatchKind(item);
  seen.add(item.operationId);return {operationId:item.operationId,title:item.title,createdAt:item.createdAt,total:item.total,saved:item.saved,...(kind?{kind,parentId:item.parentId}:{})};
 });
 return {targets:parseTaskTargets(row.targets),catalog,history};
}
