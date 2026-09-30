export const taskCategories={mouse:'マウス練習',keyboard:'キーボード練習',text:'文章入力',word:'Word練習',vision:'ビジョントレーニング',minigame:'タイピングゲーム'} as const;
export type TaskCategory=keyof typeof taskCategories;
export interface LearningTask {id:string;revision:number;category:TaskCategory;title:string;instructions:string;startsOn:string;endsOn:string;active:boolean;updatedAt:string}
export function validTaskDates(start:string,end:string){
 const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 return valid(start)&&valid(end)&&end>=start&&(Date.parse(end)-Date.parse(start))/86400000<=90;
}
export function parseLearningTask(value:unknown):LearningTask {
 const t=value as LearningTask;
 if(!t||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.id)||!Number.isSafeInteger(t.revision)||t.revision<1
  ||!Object.hasOwn(taskCategories,t.category)||typeof t.title!=='string'||!t.title.trim()||t.title.length>80||typeof t.instructions!=='string'||t.instructions.length>500
  ||!validTaskDates(t.startsOn,t.endsOn)||typeof t.active!=='boolean'||typeof t.updatedAt!=='string'||!Number.isFinite(Date.parse(t.updatedAt)))throw Error('課題の応答を確認できません。');
 return {id:t.id,revision:t.revision,category:t.category,title:t.title,instructions:t.instructions,startsOn:t.startsOn,endsOn:t.endsOn,active:t.active,updatedAt:t.updatedAt};
}
export function parseLearningTasks(value:unknown):LearningTask[]{
 const data=value as {schemaVersion:number;tasks:unknown[]};
 if(data?.schemaVersion!==1||!Array.isArray(data.tasks)||data.tasks.length>100)throw Error('課題の応答を確認できません。');
 const tasks=data.tasks.map(parseLearningTask);if(new Set(tasks.map(t=>t.id)).size!==tasks.length)throw Error('課題が重複しています。');return tasks;
}
