import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Eye,LoaderCircle,RefreshCw} from 'lucide-react';
import type {ChildProfile} from '../types';
import {initialAuditFilters,type AuditCursor,type AuditDetail,type AuditFilters,type AuditPage} from '../learning/taskBatchAudit';
import {batchErrors,batchKindNames} from '../learning/taskBatches';
import {taskCategories} from '../learning/tasks';
import {loadTaskAuditDetail,loadTaskAuditPage} from '../services/lessonLearningService';

const buttonClass='flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50';
const inputClass='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3';
const at=(value:string)=>new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
export function LearningTaskAuditPanel({childrenList}:{childrenList:ChildProfile[]}){
 const [filters,setFilters]=useState<AuditFilters>(initialAuditFilters),[data,setData]=useState<AuditPage|null>(null),[detail,setDetail]=useState<AuditDetail|null>(null);
 const [cursors,setCursors]=useState<(AuditCursor|null)[]>([null]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0);
 const read=async(nextFilters:AuditFilters,nextCursors:(AuditCursor|null)[])=>{
  const version=++generation.current;setBusy(true);setError('');setData(null);setDetail(null);setFilters(nextFilters);setCursors(nextCursors);
  try{const result=await loadTaskAuditPage(nextFilters,nextCursors.at(-1)||null);if(version===generation.current)setData(result);}
  catch(e){if(version===generation.current)setError(e instanceof Error?e.message:'履歴を取得できませんでした。');}
  finally{if(version===generation.current)setBusy(false);}
 };
 useEffect(()=>{void read(initialAuditFilters,[null]);return()=>{generation.current++;};},[]);
 const open=async(id:string)=>{
  if(!data)return;const version=++generation.current,organizationId=data.organizationId;setBusy(true);setError('');setDetail(null);setData(null);
  try{const result=await loadTaskAuditDetail(id,organizationId);if(version===generation.current){setData(data);setDetail(result);}}
  catch(e){if(version===generation.current)setError(e instanceof Error?e.message:'履歴を取得できませんでした。');}
  finally{if(version===generation.current)setBusy(false);}
 };
 const resetFilter=(patch:Partial<AuditFilters>)=>void read({...filters,...patch},[null]);
 return <section aria-label="事業所の一括課題履歴" className="min-w-0 space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-base font-bold"><Eye className="h-5 w-5 text-teal-700"/>一括課題履歴（閲覧専用）</h3><button type="button" disabled={busy} onClick={()=>void read(filters,[null])} className={buttonClass}><RefreshCw className="h-4 w-4"/>履歴を再取得</button></div>
  {error&&<p role="alert" className="border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
  {busy&&<p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="h-4 w-4 animate-spin"/>履歴を確認中...</p>}
  {!detail&&<fieldset disabled={busy} className="grid min-w-0 gap-3 border-b border-slate-200 pb-4 sm:grid-cols-3"><legend className="mb-2 text-sm font-bold">絞り込み</legend>
   <label className="min-w-0 text-sm">操作<select aria-label="履歴の操作" value={filters.kind} onChange={e=>resetFilter({kind:e.target.value as AuditFilters['kind']})} className={inputClass}><option value="all">すべて</option>{Object.entries(batchKindNames).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   <label className="min-w-0 text-sm">処理状況<select aria-label="履歴の処理状況" value={filters.state} onChange={e=>resetFilter({state:e.target.value as AuditFilters['state']})} className={inputClass}><option value="all">すべて</option><option value="pending">未完了あり</option><option value="completed">全員処理済み</option></select></label>
   <label className="min-w-0 text-sm">担当職員<select aria-label="履歴の担当職員" value={filters.actorId||''} onChange={e=>resetFilter({actorId:e.target.value||null})} className={inputClass}><option value="">すべての職員</option>{data?.actors.map(actor=><option key={actor.id} value={actor.id}>{actor.name}{!actor.active?'（無効・在籍情報なし）':''}</option>)}{filters.actorId&&!data?.actors.some(actor=>actor.id===filters.actorId)&&<option value={filters.actorId}>選択中の職員</option>}</select></label>
  </fieldset>}
  {data&&!detail&&<>
   <p role="status" className="text-sm text-slate-600">{cursors.length}ページ目・{data.entries.length}件</p>
   <ul className="divide-y divide-slate-200 border-y border-slate-200">{data.entries.map(entry=><li key={entry.operationId} className="flex min-w-0 flex-wrap items-start justify-between gap-3 py-3 text-sm"><div className="min-w-0 flex-1 space-y-1"><p className="break-words font-bold">[{batchKindNames[entry.kind]}] {entry.title}</p><p className="break-words text-slate-600">{entry.actorName}{!entry.actorActive?'（無効・在籍情報なし）':''} / {at(entry.createdAt)}</p><p className={entry.saved<entry.total?'font-bold text-amber-900':'text-emerald-800'}>処理済み {entry.saved}/{entry.total}名{entry.saved<entry.total?`・未完了 ${entry.total-entry.saved}名`:''}</p></div><button type="button" disabled={busy} aria-label={`課題履歴を確認：${entry.title}`} onClick={()=>void open(entry.operationId)} className={buttonClass}><Eye className="h-4 w-4"/>詳細</button></li>)}</ul>
   {!data.entries.length&&<p className="py-4 text-sm text-slate-600">条件に一致する一括課題履歴はありません。</p>}
   <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy||cursors.length<=1} onClick={()=>void read(filters,cursors.slice(0,-1))} className={buttonClass}><ArrowLeft className="h-4 w-4"/>前の20件</button><button type="button" disabled={busy||!data.nextCursor} onClick={()=>data.nextCursor&&void read(filters,[...cursors,data.nextCursor])} className={buttonClass}>次の20件<ArrowRight className="h-4 w-4"/></button></div>
  </>}
  {detail&&<section aria-label="一括課題履歴の詳細" className="space-y-4 border-y border-slate-200 py-4">
   <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="min-w-0 break-words text-base font-bold">[{batchKindNames[detail.entry.kind]}] {detail.entry.title}</h4><button type="button" onClick={()=>void read(filters,cursors)} className={buttonClass}><ArrowLeft className="h-4 w-4"/>履歴一覧へ</button></div>
   <p className="break-words text-sm">{detail.entry.actorName}{!detail.entry.actorActive?'（無効・在籍情報なし）':''} / {at(detail.entry.createdAt)}</p>
   <p className="text-sm font-bold">処理済み {detail.entry.saved}/{detail.entry.total}名</p>
   {detail.entry.kind!=='stop'&&<div className="space-y-2 text-sm"><p className="break-words">{taskCategories[detail.batch.template.category]} / {detail.batch.template.stageId?`ステージ ${detail.batch.template.stageId}`:'分野全体'} / {detail.batch.template.startsOn} 〜 {detail.batch.template.endsOn}</p><p className="whitespace-pre-wrap break-words">{detail.batch.template.instructions}</p></div>}
   <ul className="divide-y divide-slate-200">{detail.batch.items.map(item=><li key={item.childId} className="space-y-1 py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong className="min-w-0 break-words">{childrenList.find(child=>child.id===item.childId)?.name||'現在の名簿にない児童'}</strong><span className={item.status==='saved'?'text-emerald-800':'font-bold text-amber-900'}>{item.status==='saved'?'処理済み':'未完了'}</span></div><p className="break-words text-xs text-slate-600">{item.campusId} / {item.group||'グループ未設定'}</p>{item.before&&<div className="space-y-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-600"><p className="break-words">{detail.entry.kind==='stop'?'停止対象':'変更前'}：{item.before.title} / {taskCategories[item.before.category]} {item.before.stageId&&`[${item.before.stageId}]`} / {item.before.startsOn} 〜 {item.before.endsOn} / 版 {item.before.revision}</p><p className="whitespace-pre-wrap break-words">{item.before.instructions}</p></div>}{item.errorCode&&<p className="text-amber-900">{batchErrors[item.errorCode]}</p>}{item.savedAt&&<p className="text-xs text-slate-600">処理日時：{at(item.savedAt)}</p>}</li>)}</ul>
   <p className="border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">操作当時の処理結果です。現在の課題状態や児童の達成状況とは異なる場合があります。</p>
  </section>}
 </section>;
}
