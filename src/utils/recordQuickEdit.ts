import type {SectionAnswer} from '../types';
export interface QuickRecordField {stepId:string;kind:'expression'|'field';sectionId?:string;sectionTitle?:string;fieldId?:string;options:readonly string[]}
interface QuickDraft {expressions:string[];sectionAnswers:Record<string,SectionAnswer>;skippedQuestionIds:string[]}
/** Only a selected scalar value is changed. Notes, evidence and other answers stay intact. */
export function applyRecordQuickEdit<T extends QuickDraft>(draft:T,field:QuickRecordField,value:string):T{
 if(value&&!field.options.includes(value))return draft;
 if(field.kind==='expression'){
  // Multi-expression legacy records must be edited in the full editor.
  if(draft.expressions.length>1)return draft;
  return {...draft,expressions:value?[value]:[],skippedQuestionIds:draft.skippedQuestionIds.filter(id=>id!==field.stepId)};
 }
 if(!field.sectionId||!field.fieldId)return draft;
 const section=draft.sectionAnswers[field.sectionId]||{sectionId:field.sectionId,sectionTitle:field.sectionTitle||'',answers:{}};
 return {...draft,skippedQuestionIds:draft.skippedQuestionIds.filter(id=>id!==field.stepId),sectionAnswers:{...draft.sectionAnswers,[field.sectionId]:{...section,answers:{...section.answers,[field.fieldId]:{...(section.answers[field.fieldId]||{note:''}),value}}}}};
}
