import {lessonCategories,lessonEventFact,summarizeLessonFacts,type LessonCategory,type LessonOutcome} from './lessonSummary';
import type {LessonEvent} from './contracts';

export const MANUAL_LESSON_KEY='dLessonManualExercises';
export const MAX_MANUAL_LESSON_EXERCISES=30;
export type LessonDetails=Record<string,string|string[]>;
export interface ManualLessonExercise {id:string;category:LessonCategory;title:string;outcome:LessonOutcome;accuracy:string;characters:string}
export function readManualLessonExercises(details:LessonDetails):ManualLessonExercise[]{
 const raw=details[MANUAL_LESSON_KEY];
 if(raw===undefined)return [];
 try{
  if(typeof raw!=='string'||raw.length>30000)throw Error();
  const data=JSON.parse(raw),seen=new Set<string>();
  if(data.schemaVersion!==1||!Array.isArray(data.exercises)||data.exercises.length>MAX_MANUAL_LESSON_EXERCISES)throw Error();
  return data.exercises.map((row:ManualLessonExercise)=>{
   if(!row||typeof row.id!=='string'||!row.id||row.id.length>100||seen.has(row.id)||!Object.hasOwn(lessonCategories,row.category)
    ||typeof row.title!=='string'||row.title.length>160||!['completed','partial','unknown'].includes(row.outcome)
    ||typeof row.accuracy!=='string'||row.accuracy.length>12||typeof row.characters!=='string'||row.characters.length>12)throw Error();
   seen.add(row.id);
   return {id:row.id,category:row.category,title:row.title,outcome:row.outcome,accuracy:row.accuracy,characters:row.characters};
  });
 }catch{throw Error('Dレッスンの手入力の形式を確認できません。手入力を見直してください。');}
}
export const validAccuracy=(value:string)=>value.trim()===''||(/^\d+(?:\.\d+)?$/.test(value)&&Number(value)<=100);
export const validCharacters=(value:string)=>value.trim()===''||(/^\d+$/.test(value)&&Number(value)<=1000000);
export function manualLessonIssues(details:LessonDetails):string[]{
 try{return readManualLessonExercises(details).flatMap((row,index)=>[
  !row.title.trim()?`手入力${index+1}の課題名`:'',
  ['keyboard','minigame'].includes(row.category)&&!validAccuracy(row.accuracy)?`手入力${index+1}の正確率（0～100%）`:'',
  row.category==='text'&&!validCharacters(row.characters)?`手入力${index+1}の文字数（0以上の整数）`:'',
 ].filter(Boolean));}catch{return ['手入力の形式'];}
}
export function writeManualLessonExercises(details:LessonDetails,exercises:ManualLessonExercise[]):LessonDetails{
 const next={...details,[MANUAL_LESSON_KEY]:JSON.stringify({schemaVersion:1,exercises})};
 readManualLessonExercises(next);
 return next;
}
export function summarizeManualLessonExercises(details:LessonDetails):string{
 return summarizeLessonFacts(readManualLessonExercises(details).map(row=>({
  category:row.category,title:row.title.trim()||'課題名未入力',outcome:row.outcome,
  accuracy:row.accuracy.trim()&&validAccuracy(row.accuracy)?Number(row.accuracy):null,
  characters:row.characters.trim()&&validCharacters(row.characters)?Number(row.characters):null,
 })));
}

const legacyCategories:Record<string,LessonCategory>={'マウス練習':'mouse','ビジョントレーニング':'vision','タイピング練習':'keyboard','キーボード練習':'keyboard','ブラインドタッチ練習':'keyboard','文章入力練習':'text','Word練習':'word','タイピングゲーム':'minigame'};
// Hide redundant broad selections only in the output, not in stored legacy data.
// They reappear if imported facts are explicitly removed. Specific blind-touch
// selection is retained unless a blind task is actually present in the import.
export function legacyLessonActivities(details:LessonDetails,events:LessonEvent[]):string[]{
 const activities=Array.isArray(details.dLessonActivities)?details.dLessonActivities:[];
 const facts=events.map(lessonEventFact);
 return activities.filter(label=>{
  if(label==='ブラインドタッチ練習')return !events.some(event=>event.category==='keyboard'&&/ブラインド|blind/i.test(event.title));
  return !facts.some(fact=>fact.category===legacyCategories[label]);
 });
}
