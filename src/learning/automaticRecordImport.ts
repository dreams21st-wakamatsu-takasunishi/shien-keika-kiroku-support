import type {SectionAnswer} from '../types';
import {parseHistory,type LessonHistory,type LessonLink} from './contracts';
import {evidenceKey,evidenceScopeIssue,importLessonEvents,readLessonEvidence,type LessonImportContext} from './recordImport';

export interface LessonImportTarget {section:SectionAnswer;fieldId:string}

// Scan the whole record: a second PC period must not receive a duplicate of
// an event already attached to the first period. Never rewrite observed facts.
export function applyAutomaticLessonHistory(
 sections:Record<string,SectionAnswer>,target:LessonImportTarget,
 history:LessonHistory,link:LessonLink,context:LessonImportContext,
):{sections:Record<string,SectionAnswer>;added:number;issue:string}{
 try{
  const parsed=parseHistory(history,link,context.date);
  if(context.childId!==link.child_id||context.organizationId!==link.organization_id||!link.active)throw Error('児童の学習連携が一致していません。');
  const seen=new Map<string,ReturnType<typeof readLessonEvidence>[number]>();
  for(const section of Object.values(sections))for(const answer of Object.values(section.answers)){
   const issue=evidenceScopeIssue(answer.nestedDetails,context.childId,context.date,context.organizationId);if(issue)throw Error(issue);
   for(const event of readLessonEvidence(answer.nestedDetails))seen.set(evidenceKey(event),event);
  }
  const additions=parsed.events.filter(event=>{
   const key=JSON.stringify([link.source_project_ref,link.source_table,link.source_student_id,event.id]);
   const old=seen.get(key);
   if(old&&(['at','category','title','detail','amount'] as const).some(field=>old[field]!==event[field])){
    throw Error('取り込み済みの実績がDレッスン側で変更されています。手動取り込み欄で内容を確認してください。');
   }
   return !old;
  });
  if(!additions.length)return {sections,added:0,issue:''};
  const section=sections[target.section.sectionId]||target.section;
  const answer=section.answers[target.fieldId]||{value:'',note:''};
  const next=importLessonEvents(answer,{...parsed,fetchedAt:history.fetchedAt},link,additions.map(e=>e.id),{...context,importMode:'automatic'});
  return {sections:{...sections,[section.sectionId]:{...section,answers:{...section.answers,[target.fieldId]:next}}},added:additions.length,issue:''};
 }catch(error){return {sections,added:0,issue:error instanceof Error?error.message:'実績を自動反映できませんでした。'};}
}
