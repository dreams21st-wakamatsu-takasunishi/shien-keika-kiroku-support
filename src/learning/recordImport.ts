import type {SectionFieldAnswer} from '../types';
import {getMockExamAttempts} from '../utils/recordIncompleteDetails';
import {isServiceDate,parseHistory,type LessonEvent,type LessonHistory,type LessonLink} from './contracts';
import {summarizeLessonEvents} from './lessonSummary';
import {legacyLessonActivities,summarizeManualLessonExercises} from './manualLessonPractice';
import {isLessonSourceDate} from './lessonHistoryDates';

export const IMPORT_KEY='dLessonHistoryEvidence';
export const MAX_IMPORTED_EVENTS=50;
type Details=Record<string,string|string[]>;
export interface ImportedLessonEvent extends LessonEvent {
 childId:string;date:string;organizationId:string;sourceProjectRef:string;sourceTable:string;
 studentId:string;campusId:string;linkId:string;linkRevision:number;confirmedBy:string;confirmedAt:string;
 importMode?:'manual'|'automatic';
 recordDate?:string;
}
const nonempty=(v:unknown,max=160):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export const evidenceKey=(event:ImportedLessonEvent)=>JSON.stringify([event.sourceProjectRef,event.sourceTable,event.studentId,event.id]);
export function readLessonEvidence(details?:Details):ImportedLessonEvent[]{
 const raw=details?.[IMPORT_KEY];if(raw===undefined)return [];
 try{
  if(typeof raw!=='string'||raw.length>100000)throw Error();
  const value=JSON.parse(raw);
  if(value.schemaVersion!==1||!Array.isArray(value.events)||value.events.length>MAX_IMPORTED_EVENTS)throw Error();
  const seen=new Set<string>();
  return value.events.map((e:ImportedLessonEvent)=>{
   if(!nonempty(e.childId)||!nonempty(e.organizationId)||!nonempty(e.confirmedBy)||!nonempty(e.linkId)
    ||!isServiceDate(e.date)||!Number.isSafeInteger(e.linkRevision)||e.linkRevision<1
    ||typeof e.confirmedAt!=='string'||!Number.isFinite(Date.parse(e.confirmedAt)))throw Error();
   if(e.importMode!==undefined&&!['manual','automatic'].includes(e.importMode))throw Error();
   if(e.recordDate!==undefined&&!isLessonSourceDate(e.date,e.recordDate))throw Error();
   const link={source_project_ref:e.sourceProjectRef,source_table:e.sourceTable,source_student_id:e.studentId,source_campus_id:e.campusId};
   const event=parseHistory({schemaVersion:1,date:e.date,historyComplete:false,events:[e],identity:{
    sourceProjectRef:e.sourceProjectRef,dataTable:e.sourceTable,studentId:e.studentId,campusId:e.campusId,displayName:'学習アカウント',birthDate:'',
   }},link,e.date).events[0];
   const item={...event,childId:e.childId,date:e.date,...(e.recordDate?{recordDate:e.recordDate}:{}),organizationId:e.organizationId,sourceProjectRef:e.sourceProjectRef,
    sourceTable:e.sourceTable,studentId:e.studentId,campusId:e.campusId,linkId:e.linkId,linkRevision:e.linkRevision,confirmedBy:e.confirmedBy,confirmedAt:e.confirmedAt,...(e.importMode?{importMode:e.importMode}:{})};
   const key=evidenceKey(item);if(seen.has(key))throw Error();seen.add(key);return item;
  });
 }catch{throw Error('取り込み済み実績の形式を確認できません。実績を除いて再取得してください。');}
}
export function evidenceScopeIssue(details:Details|undefined,childId:string,date:string,organizationId?:string){
 try{
  if(readLessonEvidence(details).some(e=>e.childId!==childId||(e.recordDate||e.date)!==date||(organizationId&&e.organizationId!==organizationId)))return '取り込み実績の児童・日付・事業所が記録と一致していません。';
  return '';
 }catch(e){return (e as Error).message;}
}
const strings=(details:Details,key:string)=>Array.isArray(details[key])?details[key] as string[]:[];
export function lessonEventText(event:LessonEvent){
 const time=new Date(event.at).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
 return [time,event.title,event.detail,event.amount].filter(Boolean).join(' / ');
}
export function summarizeImportedLessonEvents(evidence:ImportedLessonEvent[]){
 const groups=new Map<string,ImportedLessonEvent[]>();
 for(const event of evidence)groups.set(event.date,[...(groups.get(event.date)||[]),event]);
 return [...groups].map(([date,events])=>`${events.some(e=>e.recordDate&&e.recordDate!==date)?`${date}実施の実績：`:''}${summarizeLessonEvents(events)}`);
}
export function formatPcActivities(details:Details):string{
 const parts=strings(details,'selections').map(selection=>{
  if(selection==='Dレッスン'){
   const evidence=readLessonEvidence(details);
   const imported=details.dLessonSummaryMode==='detailed'
    ?evidence.map(e=>`${e.recordDate&&e.recordDate!==e.date?`${e.date}実施の`:''}実績：${lessonEventText(e)}`)
    :summarizeImportedLessonEvents(evidence);
   const manual=summarizeManualLessonExercises(details);
   const content=[...legacyLessonActivities(details,evidence),...imported,...(manual?[`手入力：${manual}`]:[])];
   return content.length?`Dレッスン（${content.join('／')}）`:'Dレッスン';
  }
  if(selection==='文章入力模擬試験'){
   const attempts=getMockExamAttempts(details).map((attempt,index)=>{
    const value=[attempt.characterCount.trim()&&`${attempt.characterCount.trim()}文字`,attempt.pastRound.trim()&&`第${attempt.pastRound.trim()}回過去問`].filter(Boolean).join('・');
    return value?`${index+1}回目：${value}`:'';
   }).filter(Boolean);
   return attempts.length?`文章入力模擬試験（${attempts.join('／')}）`:'文章入力模擬試験';
  }
  const note=String(details.otherNote||'').trim();return note?`その他（${note}）`:'その他';
 });
 return [typeof details.pcManualValue==='string'?details.pcManualValue:'',...parts].filter(Boolean).join('、');
}
export interface LessonImportContext {childId:string;date:string;sourceDate?:string;organizationId:string;actorId:string;confirmedAt:string;importMode?:'manual'|'automatic'}
export function importLessonEvents(answer:SectionFieldAnswer,history:LessonHistory,link:LessonLink,selectedIds:string[],context:LessonImportContext):SectionFieldAnswer{
 if(context.childId!==link.child_id||!nonempty(context.organizationId)||!nonempty(context.actorId)
  ||!nonempty(context.confirmedAt)||!Number.isFinite(Date.parse(context.confirmedAt))||!link.active||context.organizationId!==link.organization_id
  ||!selectedIds.length||new Set(selectedIds).size!==selectedIds.length)throw Error('取り込み対象と確認職員を確認してください。');
 const sourceDate=context.sourceDate||context.date;
 if(!isLessonSourceDate(sourceDate,context.date)||(context.importMode==='automatic'&&sourceDate!==context.date))throw Error('実績の日付は記録日から3日前までを選択してください。');
 const parsed=parseHistory(history,link,sourceDate);
 const selected=selectedIds.map(id=>{const event=parsed.events.find(e=>e.id===id);if(!event)throw Error('実績が変更されました。再取得してください。');return event;});
 const details={...answer.nestedDetails};
 const issue=evidenceScopeIssue(details,context.childId,context.date,context.organizationId);if(issue)throw Error(issue);
 const existing=readLessonEvidence(details),seen=new Set(existing.map(evidenceKey));
 const added:ImportedLessonEvent[]=selected.map(event=>({...event,childId:context.childId,date:sourceDate,...(sourceDate!==context.date?{recordDate:context.date}:{}),organizationId:context.organizationId,
  sourceProjectRef:link.source_project_ref,sourceTable:link.source_table,studentId:link.source_student_id,campusId:link.source_campus_id,
  linkId:link.id,linkRevision:link.revision,confirmedBy:context.actorId,confirmedAt:context.confirmedAt,...(context.importMode?{importMode:context.importMode}:{})})).filter(e=>!seen.has(evidenceKey(e)));
 if(existing.length+added.length>MAX_IMPORTED_EVENTS)throw Error(`実績は1項目につき${MAX_IMPORTED_EVENTS}件まで取り込めます。`);
 if(!added.length)return answer;
 if(!strings(details,'selections').length&&answer.value.trim())details.pcManualValue=answer.value;
 details.selections=Array.from(new Set([...strings(details,'selections'),'Dレッスン']));
 details[IMPORT_KEY]=JSON.stringify({schemaVersion:1,events:[...existing,...added]});
 // Validate the stored projection and keep manual notes and other PC activities unchanged.
 readLessonEvidence(details);
 return {...answer,nestedDetails:details,value:formatPcActivities(details)};
}
export function removeLessonEvidence(answer:SectionFieldAnswer):SectionFieldAnswer{
 const details={...answer.nestedDetails};delete details[IMPORT_KEY];
 return {...answer,nestedDetails:details,value:formatPcActivities(details)};
}
