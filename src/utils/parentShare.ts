import type {SectionFieldAnswer,SupportRecord} from '../types';
import {EXPRESSION_SCALE_OPTIONS,PREPARATION_SCALE_OPTIONS,RESPONSE_SCALE_OPTIONS,HOMEWORK_ATTITUDE_SCALE_OPTIONS,TRANSITION_SCALE_OPTIONS,FATIGUE_RATING_OPTIONS} from '../data/weekdayTemplate';
import {FATIGUE_SCALE_OPTIONS} from './templateNormalizer';
import {HOMEWORK_ACADEMIC_SUBJECTS} from './homeworkField';
import {readLessonEvidence} from '../learning/recordImport';
import {lessonEventFact,lessonCategories} from '../learning/lessonSummary';

export interface ParentShareCandidate {id:string;label:string;text:string;selected:boolean;manual:boolean}
export interface ParentShareProposal {candidates:ParentShareCandidate[];warnings:string[];sourceKey:string}
const strip=(v:string)=>v.replace(/^[1-5]\s*[:：]\s*/,'').trim();
const fixed=(value:string,options:readonly string[])=>{const v=value?.trim();return options.some(o=>o===v||strip(o)===v)?strip(v):'';};
const sentence=(v:string)=>{
 let text=v.replace(/[。\s]+$/,'');
 // Only known option endings are changed; negation and the recorded facts stay intact.
 const endings=[['見られなかった','見られませんでした'],['できなかった','できませんでした'],['済ませられた','済ませられました'],['切り替えられた','切り替えられました'],['取り組めた','取り組めました'],['見られた','見られました'],['できた','できました'],['行えた','行えました'],['だった','でした']];
 for(const [from,to] of endings){if(text.endsWith(from)){text=text.slice(0,-from.length)+to;break;}}
 return text+'。';
};
const safeShort=(v:string)=>v.trim().length<=160&&!/[\r\n]|https?:|@/.test(v);
export function parentShareSourceKey(record:SupportRecord){return JSON.stringify([record.id,record.childId,record.date,record.version||1,record.updatedAt,record.attendance,record.expressions,record.sectionAnswers]);}
export function buildParentShareProposal(record:SupportRecord):ParentShareProposal{
 const candidates:ParentShareCandidate[]=[],warnings:string[]=[];
 const add=(id:string,label:string,text:string,selected=true,manual=false)=>{if(text&&!candidates.some(c=>c.text===text))candidates.push({id,label,text,selected,manual});};
 if(!record.attendance||record.attendance.includes('欠席'))return {candidates:[],warnings:['出席・利用実績を確認してください。欠席や未入力の記録から活動した文章は生成しません。'],sourceKey:parentShareSourceKey(record)};
 const freeTexts:string[]=[];
 const expression=fixed(record.expressions?.[0]||'',EXPRESSION_SCALE_OPTIONS);
 if(expression)add('expression','表情',sentence(expression));
 else if(record.expressions?.includes('笑顔'))add('expression','表情','笑顔が見られました。');
 else if(record.expressions?.includes('落ち着いている'))add('expression','表情','落ち着いた様子が見られました。');
 for(const [id,section] of Object.entries(record.sectionAnswers||{})){
  if(id==='__record_modules')continue;
  for(const text of [section.detailText,section.abcAnalysis?.inputMode==='free'?section.abcAnalysis.freeText:section.abcAnalysis?.summary])if(text?.trim())freeTexts.push(text.trim());
  const answers=section.answers||{};
  for(const [key,a] of Object.entries(answers)){
   if(a.note?.trim())freeTexts.push(a.note.trim());
   if(key==='medication'){
    if(a.value&&!['対象なし','なし','服薬なし','該当なし'].includes(a.value.trim()))warnings.push('服薬情報があります。保護者に連絡すべき内容を別途確認してください。');
    continue;
   }
   if(key==='fatigue'){
    const old=FATIGUE_SCALE_OPTIONS.indexOf(a.value as any),full=fixed(a.value,FATIGUE_RATING_OPTIONS);
    const text=old>=0?['非常に強い疲労感が見られました。','強い疲労感が見られました。','疲れた様子が見られました。','少し疲れた様子が見られました。','疲労感は見られませんでした。'][old]:full?sentence(full):'';
    if(text)add(`${id}:${key}`,'体調・疲労',text);
    if((old>=0&&old<2)||/^[12][:：]/.test(a.value))warnings.push('強い疲労感の記録があります。体調の様子と連絡事項を必ず確認してください。');
   }
   const scales:[RegExp,readonly string[],string,string][]=[
    [/^preparation$/,PREPARATION_SCALE_OPTIONS,'準備','準備では、'],[/^response_to_prompt$/,RESPONSE_SCALE_OPTIONS,'声掛けへの反応','声掛けに対して、'],
    [/_study_attitude$/,HOMEWORK_ATTITUDE_SCALE_OPTIONS,'宿題への取り組み',''],[/_pc_transition$/,TRANSITION_SCALE_OPTIONS,'活動の切り替え','活動の切り替えでは、'],
   ];
   for(const [pattern,options,label,prefix] of scales){if(pattern.test(key)){const text=fixed(a.value,options);if(text)add(`${id}:${key}`,label,sentence(prefix+text));}}
   if(/_study_homework$/.test(key)){
    const subjects=(a.homeworkDetails?.subjects||(a.value||'').split(/[、,（(]/)).filter(s=>(HOMEWORK_ACADEMIC_SUBJECTS as readonly string[]).includes(s));
    const attitude=answers[key.replace(/_homework$/,'_attitude')]?.value||'';
    if(subjects.length&&!/^(?:1[:：]|宿題に取り組むことができなかった)/.test(attitude))add(`${id}:${key}`,'学習内容',`学習では${[...new Set(subjects)].join('・')}の課題に取り組みました。`);
   }
   if(/_pc_content$/.test(key))addPc(a,`${id}:${key}`,record,add,warnings);
   // Unstructured custom answers cannot safely be rewritten without staff review.
  }
  if(section.subTitleValue?.trim())freeTexts.push(section.subTitleValue.trim());
 }
 for(const text of [record.expressionNote,record.attendanceNote,record.snackNote])if(text?.trim())freeTexts.push(text.trim());
 if(freeTexts.length){warnings.push('特記・備考・自由記述は自動掲載しません。他児童や家庭事情を除き、必要な内容を確認して追加してください。');
  for(const [i,text] of [...new Set(freeTexts)].entries())add('manual:'+i,'特記・備考の掲載候補（要確認）',text,false,true);
 }
 const allText=freeTexts.join('\n');
 if(/けが|ケガ|怪我|事故|発熱|嘔吐|服薬|体調|強い疲|他害|自傷|出血|痛み/.test(allText))warnings.push('体調・安全に関する記載があります。必要な連絡が抜けていないか、元記録を必ず確認してください。');
 if(/空欄|未記入|未完了|終わっていない|済ませていない|できなかった/.test(allText)&&candidates.some(c=>!c.manual&&/済ませ|完了|自分で|自力/.test(c.text)))warnings.push('選択項目と特記の間に食い違いの可能性があります。完了・自立の表現を確認してください。');
 if(!candidates.some(c=>!c.manual))warnings.push('自動文章化できる定型項目がありません。元記録を確認して共有文を入力してください。');
 return {candidates,warnings:[...new Set(warnings)],sourceKey:parentShareSourceKey(record)};
}
function addPc(a:SectionFieldAnswer,id:string,record:SupportRecord,add:(id:string,label:string,text:string,selected?:boolean,manual?:boolean)=>void,warnings:string[]){
 let evidence;try{evidence=readLessonEvidence(a.nestedDetails);}catch{warnings.push('Dレッスン実績を確認できません。自動掲載せず、元の実績を確認してください。');return;}
 const valid=evidence.filter(e=>e.childId===record.childId&&(e.recordDate||e.date)===record.date);
 if(valid.length!==evidence.length)warnings.push('児童・日付の一致しない学習実績は共有文に含めていません。');
 const facts=valid.map(lessonEventFact),groups=new Map<string,typeof facts>();
 const categories=[...new Set(facts.map(f=>f.category).filter(c=>Object.hasOwn(lessonCategories,c)))].map(c=>lessonCategories[c as keyof typeof lessonCategories]);
 if(categories.length)add(id,'Dレッスンの取り組み',`Dレッスンでは${categories.join('・')}に取り組みました。`);
 for(const fact of facts){const k=JSON.stringify([fact.category,fact.title,fact.outcome]);groups.set(k,[...(groups.get(k)||[]),fact]);}
 let number=0;
 for(const rows of groups.values()){
  const f=rows[0];if(!safeShort(f.title)||!Object.hasOwn(lessonCategories,f.category))continue;
  const label=lessonCategories[f.category as keyof typeof lessonCategories];
  const result=f.outcome==='completed'?'課題を終えました':f.outcome==='partial'?'途中で終了しました':'完了状況は記録されていません';
  const values=rows.map(r=>f.category==='text'?r.characters:r.accuracy).filter((v):v is number=>v!==null);
  const metric=['keyboard','minigame','text'].includes(f.category)&&values.length?`結果は${f.category==='text'?'入力':'正確率'}${Math.min(...values)}${Math.min(...values)!==Math.max(...values)?`～${Math.max(...values)}`:''}${f.category==='text'?'文字':'％'}でした。`:'';
  add(`${id}:lesson:${number++}`,label,`${label}の「${f.title}」に取り組み、${result}。${metric}`,false,true);
 }
 if(!facts.length){const selections=a.nestedDetails?.selections;const known=Array.isArray(selections)?selections.filter(s=>['Dレッスン','文章入力模擬試験'].includes(s)):[];
  if(known.length)add(id,'パソコンの取り組み',`パソコンでは${known.join('・')}に取り組みました。`);
 }
}
export function composeParentShare(candidates:ParentShareCandidate[],selected:Set<string>){
 const sentences=candidates.filter(c=>selected.has(c.id)).map(c=>c.text);
 // Whole sentences/candidates only; never truncate negation or silently omit an item.
 return sentences.length?'本日のご様子です。\n'+sentences.join(''):'';
}
