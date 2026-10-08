import type {ReactNode} from 'react';
import {summarizeImportedLessonEvents,type ImportedLessonEvent} from '../learning/recordImport';
import {lessonCategories,lessonEventFact,type LessonCategory,type LessonOutcome} from '../learning/lessonSummary';
import {MANUAL_LESSON_KEY,manualLessonIssues,readManualLessonExercises,writeManualLessonExercises,type LessonDetails,type ManualLessonExercise} from '../learning/manualLessonPractice';

const inputClass='mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const manualOptions=['マウス練習','ビジョントレーニング','タイピング練習','ブラインドタッチ練習','文章入力練習','Word練習'];
export function LessonPracticeEditor({details,events,onChange,importControl}:{details:LessonDetails;events:ImportedLessonEvent[];onChange:(details:LessonDetails)=>void;importControl?:ReactNode}){
 let rows:ManualLessonExercise[]=[];
 try{rows=readManualLessonExercises(details);}catch(error){return <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">
  <p>{(error as Error).message}</p><button type="button" onClick={()=>{const next={...details};delete next[MANUAL_LESSON_KEY];onChange(next);}} className="mt-2 min-h-11 rounded-lg border border-rose-300 px-3">形式を確認できない手入力だけを除く</button>
 </div>;}
 const change=(id:string,patch:Partial<ManualLessonExercise>)=>onChange(writeManualLessonExercises(details,rows.map(row=>row.id===id?{...row,...patch}:row)));
 const legacy=Array.isArray(details.dLessonActivities)?details.dLessonActivities:[];
 const facts=events.map(lessonEventFact);
 const issues=manualLessonIssues(details);
 return <section aria-label="Dレッスンの取り組み内容" className="space-y-4">
  {events.length>0&&<div className="rounded-xl bg-teal-50 p-3">
   <p className="text-sm font-bold text-teal-900">取り込み実績 {events.length}件（重ねて選択する必要はありません）</p>
   <p className="mt-2 break-words text-sm leading-relaxed text-slate-800">{summarizeImportedLessonEvents(events).join('／')}</p>
  </div>}
  {importControl&&<details className="rounded-xl border border-slate-200 px-3"><summary className="cursor-pointer py-3 text-sm font-bold text-teal-800">日付を選んで実績を取得・追加</summary>{importControl}</details>}
  <fieldset className="space-y-2"><legend className="text-sm font-bold text-slate-900">取り組んだ練習（複数選択可）</legend>
   <div className="grid gap-2 sm:grid-cols-2">{Array.from(new Set([...manualOptions,...legacy])).map(label=><label key={label} className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${legacy.includes(label)?'border-teal-500 bg-teal-50 text-teal-950':'border-slate-300 bg-white text-slate-800'}`}><input type="checkbox" checked={legacy.includes(label)} onChange={e=>onChange({...details,dLessonActivities:e.target.checked?[...legacy,label]:legacy.filter(item=>item!==label)})} className="h-4 w-4 shrink-0 accent-teal-700"/>{label}</label>)}</div>
  </fieldset>
  {rows.length>0&&<details className="space-y-3"><summary className="cursor-pointer py-2 text-sm font-bold text-slate-700">保存済みの詳細手入力（{rows.length}件）</summary>
   {rows.map((row,index)=><article key={row.id} aria-label={`Dレッスン手入力 ${index+1}`} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="flex items-center justify-between gap-2"><strong className="text-sm">手入力 {index+1}</strong><button type="button" onClick={()=>onChange(writeManualLessonExercises(details,rows.filter(item=>item.id!==row.id)))} className="min-h-10 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700">この取り組みを削除</button></div>
    <div className="grid gap-3 sm:grid-cols-2">
     <label className="text-sm font-bold text-slate-700">練習の種類<select aria-label="練習の種類" className={inputClass} value={row.category} onChange={e=>change(row.id,{category:e.target.value as LessonCategory})}>{Object.entries(lessonCategories).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
     <label className="text-sm font-bold text-slate-700">課題名<input className={inputClass} maxLength={160} placeholder={row.category==='text'?'例：ももたろう':'例：中指（上）・は行（ブラインド）'} value={row.title} onChange={e=>change(row.id,{title:e.target.value})}/></label>
     <label className="text-sm font-bold text-slate-700">完了状況<select aria-label="完了状況" className={inputClass} value={row.outcome} onChange={e=>change(row.id,{outcome:e.target.value as LessonOutcome})}><option value="unknown">未確認</option><option value="completed">完了</option><option value="partial">途中終了</option></select></label>
     {['keyboard','minigame'].includes(row.category)&&<label className="text-sm font-bold text-slate-700">正確率（%）<input className={inputClass} type="number" min="0" max="100" step="0.1" inputMode="decimal" placeholder="分からなければ空欄" value={row.accuracy} onChange={e=>change(row.id,{accuracy:e.target.value})}/></label>}
     {row.category==='text'&&<label className="text-sm font-bold text-slate-700">入力文字数<input className={inputClass} type="number" min="0" max="1000000" step="1" inputMode="numeric" placeholder="分からなければ空欄" value={row.characters} onChange={e=>change(row.id,{characters:e.target.value})}/></label>}
    </div>
    {facts.some(fact=>fact.category===row.category&&fact.title===row.title.trim())&&<p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">同じ課題の取り込み実績があります。別の取り組み分か確認してください。手入力は自動実績とは分けて記載します。</p>}
   </article>)}
   {issues.length>0&&<p role="alert" className="text-sm text-rose-800">{issues.join('、')}を確認してください。</p>}
  </details>}
 </section>;
}
