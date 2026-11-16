import type {LessonEvent} from './contracts';

export const lessonCategories={mouse:'マウス練習',keyboard:'タイピング練習',text:'文章入力練習',word:'Word練習',vision:'ビジョントレーニング',minigame:'タイピングゲーム'} as const;
export type LessonCategory=keyof typeof lessonCategories;
export type LessonOutcome='completed'|'partial'|'unknown';
export interface LessonPracticeFact {category:string;title:string;outcome:LessonOutcome;accuracy:number|null;characters:number|null}

export function lessonOutcome(detail:string):LessonOutcome{
 const normalized=detail.normalize('NFKC');
 if(/途中|とちゅう|中断|キャンセル/.test(normalized))return 'partial';
 if(/未クリア|未完了|未終了|不合格|終了せず/.test(normalized))return 'unknown';
 const tokens=normalized.split(/[\s/／・]+/);
 return tokens.some(token=>['クリア','おわり','終了','完了'].includes(token))?'completed':'unknown';
}

function numberIn(value:string,pattern:RegExp,max:number):number|null{
 const match=value.normalize('NFKC').match(pattern);
 if(!match)return null;
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(match[1]))return null;
 const number=Number(match[1].replaceAll(',',''));
 return Number.isFinite(number)&&number>=0&&number<=max?number:null;
}

export function lessonEventFact(event:LessonEvent):LessonPracticeFact{
 const characters=numberIn(event.amount,/(?:^|[\s/／・])(?:うった数|入力文字数|文字数|入力数)\s*[:：]?\s*(\d[\d,]*)\s*文字(?:$|[\s/／・])/,1000000)
  ??numberIn(event.amount,/^(\d[\d,]*)\s*文字$/,1000000);
 const accuracy=numberIn([event.amount,event.detail].join(' / '),/(?:^|[\s/／・])(?:せいかく|正確率|正確性|正確|accuracy)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%(?:$|[\s/／・])/i,100);
 const category=Object.hasOwn(lessonCategories,event.category)?event.category:'other';
 const prefixes:Record<string,RegExp>={keyboard:/^(?:キーボード|タイピング練習)\s+/,text:/^(?:ぶんしょう|文章入力練習)\s+/};
 const title=event.title.trim().replace(prefixes[category]||/$^/,'').trim()||'課題名未登録';
 return {category,title,outcome:lessonOutcome(event.detail),accuracy,characters:Number.isInteger(characters)?characters:null};
}

const range=(values:number[])=>{
 const min=Math.min(...values),max=Math.max(...values);
 return min===max?String(min):`${min}～${max}`;
};

// Group only the same category, task and outcome. Never turn scores/mistakes
// into accuracy or mix completed and stopped text into one character total.
export function summarizeLessonFacts(facts:LessonPracticeFact[]):string{
 const categories=new Map<string,Map<string,LessonPracticeFact[]>>();
 for(const fact of facts){
  if(!categories.has(fact.category))categories.set(fact.category,new Map());
  const tasks=categories.get(fact.category)!;
  tasks.set(fact.title,[...(tasks.get(fact.title)||[]),fact]);
 }
 return [...categories].map(([category,tasks])=>{
  const taskResults=[...tasks].map(([title,rows])=>{
   const outcomes=(['completed','partial','unknown'] as const).flatMap(outcome=>{
    const attempts=rows.filter(row=>row.outcome===outcome);
    if(!attempts.length)return [];
    const label={completed:'完了',partial:'途中終了',unknown:'完了状況未確認'}[outcome];
    const results=[label];
    const isTyping=category==='keyboard'||category==='minigame';
    if(category==='text'||isTyping){
     const values=attempts.map(row=>isTyping?row.accuracy:row.characters).filter((value):value is number=>value!==null);
     const metric=isTyping?'正確率':'文字数';
     results.push(values.length?`${isTyping?'正確率':''}${range(values)}${isTyping?'%':'文字'}${values.length<attempts.length?`（${metric}未確認${attempts.length-values.length}回）`:''}`:`${metric}未確認`);
    }
    if(attempts.length>1)results.push(`${attempts.length}回`);
    return [results.join('・')];
   });
   return `${title}〔${outcomes.join('／')}〕`;
  });
  return `${lessonCategories[category as LessonCategory]||'その他の練習'}：${taskResults.join('、')}`;
 }).join('／');
}

export function summarizeLessonEvents(events:LessonEvent[]):string{
 return summarizeLessonFacts(events.map(lessonEventFact));
}

export function formatLessonPracticeReport(events: LessonEvent[]): string {
 const categories = new Map<string, Map<string, {title: string; regular: LessonPracticeFact[]; blind: LessonPracticeFact[]}>>();
 for (const event of events) {
  const fact = lessonEventFact(event);
  const label = fact.title.replace(/[（）]/g, char=>char==='（'?'(':')');
  const clean = (fact.category==='vision' ? label.replace(/^ビジョントレーニング\s*[：:]?\s*/, '') : label).trim();
  const blind = fact.category === 'keyboard' && /\s*\(ブラインド\)$/.test(clean);
  const title = (blind ? clean.replace(/\s*\(ブラインド\)$/, '') : clean).replace(/\s*\(([^()]*)\)/g, '（$1）') || fact.title;
  const tasks = categories.get(fact.category) || new Map<string, {title: string; regular: LessonPracticeFact[]; blind: LessonPracticeFact[]}>();
  categories.set(fact.category,tasks);
  const task = tasks.get(title) || {title,regular:[],blind:[]};
  tasks.set(title,task);
  (blind ? task.blind : task.regular).push(fact);
 }
 const outcomes = ['completed','partial','unknown'] as const;
 function result(rows: LessonPracticeFact[], category: string, addAccuracyLabel: boolean) {
  const counts=outcomes.map(outcome=>rows.filter(row=>row.outcome===outcome));
  if (category==='vision' && counts.filter(count=>count.length).length===1) {
   const status=counts[0].length?'完了':counts[1].length?'途中終了':'完了状況未確認';
   return `${rows.length}回取り組み、${rows.length>1?'いずれも':''}${status}`;
  }
  return counts.flatMap((attempts,index)=>{
   if (!attempts.length) return [];
   const typing=category==='keyboard'||category==='minigame';
   const metrics=attempts.map(row=>typing?row.accuracy:row.characters).filter((value):value is number=>value!==null);
   const name=typing?'正確率':'文字数';
   const measured=metrics.length?`${typing && addAccuracyLabel ? name : ''}${range(metrics)}${typing?'%':'文字'}`:'';
   const missing=attempts.length-metrics.length;
   const detail=(typing||category==='text')?[measured,missing ? `${name}未確認${metrics.length?`${missing}回`:''}`:''].filter(Boolean).join('・'):'';
   return [`${attempts.length}回${['完了','途中終了','（完了状況未確認）'][index]}${detail?`（${detail}）`:''}`];
  }).join('、');
 }
 const order = ['vision','keyboard','text','mouse','word','minigame','other'];
 return [...categories].sort(([a],[b])=>order.indexOf(a)-order.indexOf(b)).map(([category,tasks])=>{
  const list=[...tasks.values()];
  if (category==='keyboard') {
   const rowOrder=(title:string)=>title.length===2&&title.endsWith('行')?'あかさたなはまやらわ'.indexOf(title[0]):-1;
   list.sort((a,b)=>(rowOrder(a.title)<0?99:rowOrder(a.title))-(rowOrder(b.title)<0?99:rowOrder(b.title)));
  }
  return [`■${lessonCategories[category as LessonCategory]||'その他の練習'}`, ...list.map(({title,regular,blind})=>
   `・${title}　${[regular.length?result(regular,category,true):'',blind.length?'ブラインドでは'+result(blind,category,!regular.length):''].filter(Boolean).join('。')}。`)].join('\n');
 }).join('\n\n');
}
