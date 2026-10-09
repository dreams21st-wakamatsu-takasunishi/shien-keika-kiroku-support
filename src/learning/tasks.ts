export const taskCategories={mouse:'マウス練習',keyboard:'キーボード練習',text:'文章入力',word:'Word練習',vision:'ビジョントレーニング',minigame:'タイピングゲーム'} as const;
export type TaskCategory=keyof typeof taskCategories;
export interface LearningTask {id:string;revision:number;category:TaskCategory;stageId?:string;title:string;instructions:string;startsOn:string;endsOn:string;active:boolean;updatedAt:string}
export function validTaskDates(start:string,end:string){
 const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 return valid(start)&&valid(end)&&end>=start&&(Date.parse(end)-Date.parse(start))/86400000<=90;
}
export function parseLearningTask(value:unknown):LearningTask {
 const t=value as LearningTask;
 if(!t||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.id)||!Number.isSafeInteger(t.revision)||t.revision<1
  ||!Object.hasOwn(taskCategories,t.category)||typeof t.title!=='string'||!t.title.trim()||t.title.length>80||typeof t.instructions!=='string'||t.instructions.length>500
  ||(t.stageId!=null&&(typeof t.stageId!=='string'||!(/^[a-z0-9_]{1,40}$/i).test(t.stageId)))
  ||!validTaskDates(t.startsOn,t.endsOn)||typeof t.active!=='boolean'||typeof t.updatedAt!=='string'||!Number.isFinite(Date.parse(t.updatedAt)))throw Error('課題の応答を確認できません。');
 return {id:t.id,revision:t.revision,category:t.category,title:t.title,instructions:t.instructions,startsOn:t.startsOn,endsOn:t.endsOn,active:t.active,updatedAt:t.updatedAt,...(t.stageId?{stageId:t.stageId}:{})};
}
export interface TaskStage {category:TaskCategory;stageId:string;title:string}
export interface TaskResult {taskId:string;revision:number;count:number;historyComplete:false;unidentifiedCount:number;latest:{id:string;at:string;detail:string;amount:string}[]}
export function parseTaskDetails(value:unknown) {
 const r=value as Record<string,unknown>,tasks=parseLearningTasks(value);
 if(!Array.isArray(r.catalog)||r.catalog.length>500||!Array.isArray(r.results)||r.results.length!==tasks.length)throw Error('課題のステージ・実績を確認できません。');
 const seen=new Set<string>();
 const catalog:TaskStage[]=r.catalog.map((stage:TaskStage)=>{
  const key=`${stage?.category}:${stage?.stageId}`;
  if(!stage||!Object.hasOwn(taskCategories,stage.category)||typeof stage.stageId!=='string'||!(/^[a-z0-9_]{1,40}$/i).test(stage.stageId)
   ||typeof stage.title!=='string'||!stage.title||stage.title.length>160||seen.has(key))throw Error('課題のステージを確認できません。');
  seen.add(key);return {category:stage.category,stageId:stage.stageId,title:stage.title};
 });
 if(tasks.some(task=>task.stageId&&!seen.has(`${task.category}:${task.stageId}`)))throw Error('課題のステージを確認できません。');
 const resultIds=new Set<string>();
 const results:TaskResult[]=r.results.map((result:TaskResult)=>{
  const task=tasks.find(task=>task.id===result?.taskId);
  if(!task||resultIds.has(task.id)||result.revision!==task.revision||!Number.isSafeInteger(result.count)||result.count<0||result.count>100000
   ||result.historyComplete!==false||!Number.isSafeInteger(result.unidentifiedCount)||result.unidentifiedCount<0||result.unidentifiedCount>100000
   ||!Array.isArray(result.latest)||result.latest.length!==Math.min(result.count,3))throw Error('課題の実績を確認できません。');
  resultIds.add(task.id);
  const eventIds=new Set<string>();
  const latest=result.latest.map(event=>{
   const date=typeof event?.at==='string'&&Number.isFinite(Date.parse(event.at))?new Date(Date.parse(event.at)+9*3600000).toISOString().slice(0,10):'';
   if(!event||typeof event.id!=='string'||!event.id||event.id.length>200||eventIds.has(event.id)||!date||date<task.startsOn||date>task.endsOn
    ||typeof event.detail!=='string'||event.detail.length>240||typeof event.amount!=='string'||event.amount.length>160)throw Error('課題の実績を確認できません。');
   eventIds.add(event.id);return {id:event.id,at:event.at,detail:event.detail,amount:event.amount};
  });
  return {taskId:task.id,revision:task.revision,count:result.count,historyComplete:false,unidentifiedCount:result.unidentifiedCount,latest};
 });
 return {tasks,catalog,results};
}
export function parseLearningTasks(value:unknown):LearningTask[]{
 const data=value as {schemaVersion:number;tasks:unknown[]};
 if(data?.schemaVersion!==1||!Array.isArray(data.tasks)||data.tasks.length>100)throw Error('課題の応答を確認できません。');
 const tasks=data.tasks.map(parseLearningTask);if(new Set(tasks.map(t=>t.id)).size!==tasks.length)throw Error('課題が重複しています。');return tasks;
}
