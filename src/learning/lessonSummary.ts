import type {LessonEvent} from './contracts';

const categories:Record<string,string>={mouse:'マウス練習',keyboard:'キーボード練習',text:'文章入力練習',word:'Word練習',vision:'ビジョントレーニング',minigame:'タイピングゲーム'};

// Only summarize recorded outcomes. A score, title, or event's existence is not
// evidence of completion, effort, independence, or support provided by staff.
function outcome(event:LessonEvent){
 const detail=event.detail.normalize('NFKC');
 if(/途中|とちゅう|中断|キャンセル/.test(detail))return 'partial';
 if(/未クリア|未完了|未終了|不合格|終了せず/.test(detail))return 'unknown';
 const tokens=detail.split(/[\s/／・]+/);
 if(tokens.includes('クリア'))return 'clear';
 if(tokens.some(token=>['おわり','終了','完了'].includes(token)))return 'finished';
 return 'unknown';
}

function characterCount(event:LessonEvent):number|null{
 // Do not confuse keyboard strokes, scores, mistakes, or elapsed time with text.
 const amount=event.amount.normalize('NFKC').trim();
 const match=amount.match(/(?:^|[\s/／・])(?:うった数|入力文字数|文字数|入力数)\s*[:：]?\s*(\d[\d,]*)\s*文字(?:$|[\s/／・])/)
  ||amount.match(/^(\d[\d,]*)\s*文字$/);
 if(!match)return null;
 const count=Number(match[1].replaceAll(',',''));
 return Number.isSafeInteger(count)&&count>=0&&count<=1000000?count:null;
}

export function summarizeLessonEvents(events:LessonEvent[]):string{
 const groups=new Map<string,LessonEvent[]>();
 for(const event of events){const key=Object.hasOwn(categories,event.category)?event.category:'other';groups.set(key,[...(groups.get(key)||[]),event]);}
 return [...groups].map(([category,rows])=>{
  const label=categories[category]||'その他の練習';
  const counts={clear:0,finished:0,partial:0,unknown:0};
  rows.forEach(event=>counts[outcome(event)]++);
  const facts:string[]=[];
  if(category==='text'){
   const finished=counts.finished+counts.clear;
   if(finished)facts.push(`終了${finished}回`);
  }else{
   if(counts.clear)facts.push(`クリア${counts.clear}回`);
   if(counts.finished)facts.push(`終了${counts.finished}回`);
  }
  if(counts.partial)facts.push(`途中終了${counts.partial}回`);
  if(category==='text'){
   const completed=rows.filter(event=>['clear','finished'].includes(outcome(event)));
   const counted=completed.map(characterCount).filter((count):count is number=>count!==null);
   if(counted.length)facts.push(`終了分${counted.reduce((sum,count)=>sum+count,0)}文字${counted.length<completed.length?'（文字数確認分）':''}`);
   else if(!completed.length&&!counts.partial){
    const recorded=rows.map(characterCount).filter((count):count is number=>count!==null);
    if(recorded.length)facts.push(`入力${recorded.reduce((sum,count)=>sum+count,0)}文字（文字数確認分）`);
   }
  }
  // A single exercise retains its short name; multiple attempts stay compact.
  if(rows.length===1){
   const title=rows[0].title.trim();
   if(title&&title!==label&&title!=='文章入力'&&title.length<=40)facts.unshift(title);
  }
  return `${label}${rows.length}回${facts.length?`（${facts.join('、')}）`:''}`;
 }).join('、');
}
