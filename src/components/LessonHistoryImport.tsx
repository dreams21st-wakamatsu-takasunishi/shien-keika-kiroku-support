import {useEffect,useRef,useState} from 'react';
import {Download,LoaderCircle,RefreshCw,Trash2} from 'lucide-react';
import type {SectionFieldAnswer} from '../types';
import {isServiceDate,parseHistory,type LessonHistory,type LessonLink} from '../learning/contracts';
import {evidenceScopeIssue,importLessonEvents,lessonEventText,MAX_IMPORTED_EVENTS,readLessonEvidence,removeLessonEvidence} from '../learning/recordImport';
import {loadLessonHistory,loadLessonLinks} from '../services/lessonLearningService';
import {isLessonSourceDate,shiftServiceDate} from '../learning/lessonHistoryDates';

export function LessonHistoryImport({childId,childName,date,organizationId,actorId,answer,disabled=false,onChange}:{
 childId:string;childName:string;date:string;organizationId:string;actorId:string;answer:SectionFieldAnswer;disabled?:boolean;onChange:(answer:SectionFieldAnswer)=>void;
}){
 const [sourceDate,setSourceDate]=useState(date);
 const [history,setHistory]=useState<LessonHistory|null>(null),[link,setLink]=useState<LessonLink|null>(null);
 const [selected,setSelected]=useState<string[]>([]),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const version=useRef(0),latest=useRef({answer,disabled,onChange});latest.current={answer,disabled,onChange};
 useEffect(()=>{setSourceDate(date);},[childId,date,organizationId,actorId]);
 useEffect(()=>{version.current++;setHistory(null);setLink(null);setSelected([]);setConfirmed(false);setBusy(false);setError('');setMessage('');return()=>{version.current++;};},[childId,date,sourceDate,organizationId,actorId,disabled]);
 const issue=evidenceScopeIssue(answer.nestedDetails,childId,date,organizationId);
 const validSource=isLessonSourceDate(sourceDate,date);
 let count=0;try{count=readLessonEvidence(answer.nestedDetails).length;}catch{/* Corrupt evidence can only be removed, not overwritten. */}
 const getHistory=async()=>{
  const v=++version.current;setBusy(true);setError('');setMessage('');setHistory(null);setLink(null);setSelected([]);setConfirmed(false);
  try{
   if(!isLessonSourceDate(sourceDate,date))throw Error('実績の日付は記録日から3日前までを選択してください。');
   const context=await loadLessonLinks();if(v!==version.current)return;
   if(!context.configured)throw Error('学習連携のサーバー設定が未完了です。');
   const active=context.links.find(l=>l.child_id===childId&&l.active);if(!active)throw Error('この児童の学習アカウントは未連携です。');
   const raw=await loadLessonHistory(childId,sourceDate);const parsed=parseHistory(raw,active,sourceDate);
   if(v===version.current){setHistory({...parsed,fetchedAt:raw.fetchedAt});setLink(active);}
  }catch(e){if(v===version.current)setError(e instanceof Error?e.message:'実績を取得できませんでした。');}
  finally{if(v===version.current)setBusy(false);}
 };
 const apply=async()=>{
  if(!history||!link||!confirmed||!selected.length||disabled||issue||!validSource)return;
  const v=++version.current;setBusy(true);setError('');setMessage('');
  try{
   const context=await loadLessonLinks();if(v!==version.current)return;
   const current=context.links.find(l=>l.child_id===childId&&l.active);
   if(!context.configured||!current||current.id!==link.id||current.revision!==link.revision||current.source_student_id!==link.source_student_id)throw Error('連携状態が変更されました。実績を再取得してください。');
   const fresh=await loadLessonHistory(childId,sourceDate);const parsed=parseHistory(fresh,current,sourceDate);
   for(const id of selected)if(JSON.stringify(parsed.events.find(e=>e.id===id))!==JSON.stringify(history.events.find(e=>e.id===id)))throw Error('選択した実績が変更されました。再取得して確認してください。');
   if(v!==version.current||latest.current.disabled)return;
   const next=importLessonEvents(latest.current.answer,{...parsed,fetchedAt:fresh.fetchedAt},current,selected,{childId,date,sourceDate,organizationId,actorId,confirmedAt:new Date().toISOString(),importMode:'manual'});
   const unchanged=next===latest.current.answer;
   latest.current.onChange(next);setSelected([]);setConfirmed(false);setMessage(unchanged?'選択した実績は取り込み済みです。':'確認した実績を入力中の記録へ追加しました。記録は未保存です。');
  }catch(e){if(v===version.current){setError(e instanceof Error?e.message:'取り込みを完了できませんでした。');setConfirmed(false);}}
  finally{if(v===version.current)setBusy(false);}
 };
 return <section aria-label="Dレッスン実績の取り込み" className="space-y-3 border-y border-teal-200 py-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-teal-950">Dレッスンの実績</h4><button type="button" disabled={disabled||busy||Boolean(issue)||!validSource} onClick={()=>void getHistory()} className="flex min-h-10 items-center gap-2 rounded-lg border border-teal-600 px-3 text-sm font-bold text-teal-800 disabled:opacity-50">{busy?<LoaderCircle className="h-4 w-4 animate-spin"/>:<RefreshCw className="h-4 w-4"/>}実績を取得</button></div>
  <p className="break-words text-sm text-slate-700">{childName} / 支援記録日：{date}</p>
  <label className="block text-sm font-bold text-slate-700">実績の取得日<input type="date" aria-label="実績の取得日" value={sourceDate} min={isServiceDate(date)?shiftServiceDate(date,-3):undefined} max={date||undefined} disabled={disabled||!isServiceDate(date)} onChange={e=>{version.current++;setSourceDate(e.target.value);}} className="mt-1 block min-h-11 max-w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"/></label>
  {!validSource&&<p role="alert" className="text-sm text-rose-800">実績の日付は記録日から3日前までを選択してください。</p>}
  {validSource&&sourceDate!==date&&<p className="text-sm text-amber-900">{sourceDate}に実施した実績として、{date}の支援記録に追加します。</p>}
  {issue&&<p role="alert" className="text-sm text-rose-800">{issue}</p>}
  {error&&<p role="alert" className="border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
  {message&&<p role="status" className="bg-emerald-50 p-3 text-sm text-emerald-950">{message}</p>}
  {(count>0||issue)&&<div className="flex flex-wrap items-center gap-3"><p className="text-xs text-slate-600">取り込み済み {count}件</p><button type="button" disabled={disabled||busy} onClick={()=>{onChange(removeLessonEvidence(answer));setMessage('取り込み実績を除きました。手入力の内容は保持しています。');}} className="flex min-h-10 items-center gap-2 rounded-lg border border-rose-300 px-3 text-sm text-rose-800 disabled:opacity-50"><Trash2 className="h-4 w-4"/>取り込み実績を除く</button></div>}
  {history&&<>
   <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">{history.historyNotice}</p>
   {history.events.length===0?<p className="text-sm text-slate-600">この日付で取得できた履歴はありません。</p>:<>
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-bold">選択 {selected.length} / {history.events.length}件</span>
      <button type="button" disabled={disabled||busy||Boolean(issue)||history.events.length>MAX_IMPORTED_EVENTS} onClick={()=>{setSelected(history.events.map(event=>event.id));setConfirmed(false);}} className="min-h-10 rounded-lg border border-teal-400 bg-white px-3 font-bold text-teal-900 disabled:opacity-50">実績を全件選択</button>
      <button type="button" disabled={disabled||busy||!selected.length} onClick={()=>{setSelected([]);setConfirmed(false);}} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 font-bold disabled:opacity-50">実績の選択を解除</button>
    </div>
    {history.events.length>MAX_IMPORTED_EVENTS&&<p className="text-xs text-slate-600">全件選択は{MAX_IMPORTED_EVENTS}件までです。必要な実績を個別に選んでください。</p>}
    <ul className="max-h-80 divide-y divide-slate-200 overflow-y-auto">{history.events.map(event=><li key={event.id}><label className="flex min-h-12 items-start gap-3 py-3 text-sm"><input type="checkbox" aria-label={`取り込み対象 ${lessonEventText(event)}`} disabled={disabled||busy||Boolean(issue)} checked={selected.includes(event.id)} onChange={e=>{setSelected(rows=>e.target.checked?[...rows,event.id]:rows.filter(id=>id!==event.id));setConfirmed(false);}} className="mt-1 h-4 w-4 shrink-0 accent-teal-700"/><span className="min-w-0 break-words">{lessonEventText(event)}</span></label></li>)}</ul>
    <label className="flex items-start gap-2 text-sm text-slate-800"><input type="checkbox" aria-label="選択した実績の児童・日付・内容を確認" disabled={disabled||busy||!selected.length||Boolean(issue)} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-teal-700"/>選択した実績の児童・日付・内容を確認しました</label>
    <button type="button" disabled={disabled||busy||!confirmed||!selected.length||selected.length>MAX_IMPORTED_EVENTS||Boolean(issue)} onClick={()=>void apply()} className="flex min-h-11 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-50"><Download className="h-4 w-4"/>選択した実績を追加（{selected.length}件）</button>
    {selected.length>MAX_IMPORTED_EVENTS&&<p role="alert" className="text-sm text-rose-800">1項目につき{MAX_IMPORTED_EVENTS}件以内で選択してください。</p>}
   </>}
  </>}
 </section>;
}
