import type {ChildProfile,SupportRecord} from '../types';
import {shiftServiceDate} from '../learning/lessonHistoryDates';
import {UNIFIED_RECORD_FIELD_LABELS} from './unifiedRecordSummary';

const lifeLabels:Record<string,string>={fatigue:'疲労感',preparation:'準備',response_to_prompt:'声掛けへの反応',medication:'服薬'};

export function previousSupportDate(meetingDate:string):string {
 const weekday=new Date(`${meetingDate}T00:00:00Z`).getUTCDay();
 return shiftServiceDate(meetingDate,weekday===1?-3:-1);
}

export function supportRecapLines(record:SupportRecord):string[] {
 const observations:string[]=[],activities:string[]=[];
 const append=(target:string[],label:string,value?:string)=>{
  if(value?.trim())target.push(`${label}：${value.trim()}`);
 };
 append(observations,'職員の確認コメント',record.jihatsukanComment);
 for(const [id,section] of Object.entries(record.sectionAnswers||{})){
  if(id==='__record_modules')continue;
  const title=section.sectionTitle||'取り組み';
  const abc=section.abcAnalysis;
  const special=abc?.inputMode==='free'?abc.freeText:abc?.summary||[
   abc?.antecedent&&`前の状況：${abc.antecedent}`,
   abc?.behavior&&`行動：${abc.behavior}`,
   abc?.consequence&&`その後：${abc.consequence}`,
  ].filter(Boolean).join('／');
  append(observations,`${title}の特記`,special);
  append(observations,`${title}の様子`,section.detailText);
  for(const [fieldId,answer] of Object.entries(section.answers||{})){
   const field=record.templateSectionsSnapshot?.find(s=>s.id===id)?.fields.find(f=>f.id===fieldId);
   const label=UNIFIED_RECORD_FIELD_LABELS[fieldId]||field?.label||(id==='life'?lifeLabels[fieldId]:undefined)||title;
   append(observations,`${label}の備考`,answer.note);
   append(activities,label,answer.value);
  }
 }
 append(observations,'来所時の様子',[...(record.expressions||[]),record.expressionNote].filter(Boolean).join('／'));
 append(observations,'出欠', [record.attendance,record.attendanceNote].filter(Boolean).join('／'));
 append(activities,'おやつ',[record.snack,record.snackNote].filter(Boolean).join('／'));
 const lines=Array.from(new Set([...observations,...activities]));
 if(!lines.length)append(lines,'記録のまとめ',record.synthesizedSummary);
 return lines;
}

export function buildPreviousSupportRecaps(children:ChildProfile[],records:SupportRecord[],date:string){
 return children.map(child=>({child,records:records.filter(r=>r.childId===child.id&&r.date===date)
  .sort((a,b)=>a.createdAt.localeCompare(b.createdAt))}));
}

export function shortRecapLine(line:string,max=200):string {
 if(line.length<=max)return line;
 const sentences=line.match(/[^。！？\n]+[。！？\n]?/g)||[line];
 let excerpt='';
 for(const sentence of sentences){
  if((excerpt+sentence).length>max)break;
  excerpt+=sentence;
 }
 // Never cut through a sentence: a trailing negation must remain part of the excerpt.
 return excerpt?`${excerpt.trim()}（続きは元の記録）`:line;
}
