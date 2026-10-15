import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight,Layers,LoaderCircle,X} from 'lucide-react';
import type {ChildProfile,RecordDraftSummary} from '../types';
import type {RecordEntryRequest} from '../utils/recordEntry';

export function RecordEntryDialog({request,drafts,childrenList,busy,error,onDateChange,onChoose,onMerge,onClose}:{request:RecordEntryRequest;drafts:RecordDraftSummary[];childrenList:ChildProfile[];busy:boolean;error:string;onDateChange:(date:string)=>void;onChoose:(key?:string)=>void;onMerge:(keys:string[],target:string)=>void;onClose:()=>void}){
 const [selected,setSelected]=useState<string[]>([]),[confirming,setConfirming]=useState(false),root=useRef<HTMLElement>(null);
 const signature=drafts.map(draft=>draft.draftKey+':'+draft.revision).join('|');
 useEffect(()=>{setSelected([]);setConfirming(false);},[request.date,signature]);
 useEffect(()=>{const focused=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';root.current?.focus();return()=>{document.body.style.overflow=overflow;focused?.focus();};},[]);
 const names=(draft:RecordDraftSummary)=>draft.selectedChildIds.map(id=>childrenList.find(child=>child.id===id)?.name||'児童').join('、');
 const selectedDrafts=drafts.filter(draft=>selected.includes(draft.draftKey));
 return createPortal(<div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/60 p-3" onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.preventDefault();onClose();}if(event.key==='Tab'&&root.current){const nodes=[...root.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')],first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}}>
  <section ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="record-entry-title" className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl outline-none">
   <header className="flex items-start justify-between gap-3 border-b bg-teal-50 p-4"><div><h2 id="record-entry-title" className="text-lg font-black">入力画面をひとつにまとめる</h2><p className="mt-1 text-sm">同じ職員・同じ日付の児童は、同じ入力画面の児童タブで切り替えます。</p></div><button type="button" disabled={busy} aria-label="入力画面の選択を閉じる" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border bg-white disabled:opacity-40"><X className="h-5 w-5"/></button></header>
   <div className="space-y-3 overflow-y-auto p-4">
    <label className="block text-sm font-bold">記録する日付<input type="date" value={request.date} disabled={busy} onChange={event=>{if(event.target.value)onDateChange(event.target.value);}} className="ml-2 min-h-11 rounded-lg border border-slate-300 px-2"/></label>
    {busy&&<p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="h-4 w-4 animate-spin"/>入力中の記録を確認・処理しています…</p>}
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}
    {drafts.length===0?<div className="rounded-xl border bg-slate-50 p-4"><p className="text-sm">この日付の自分の入力中記録はありません。</p><button type="button" disabled={busy} onClick={()=>onChoose()} className="mt-3 min-h-11 rounded-xl bg-teal-700 px-4 font-bold text-white">この日付で入力を始める</button></div>:<>
     <p className="text-sm font-bold">自分の入力中記録：{drafts.length}件</p>
     {drafts.length>1&&<p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">まとめる前に、他の端末・タブでの入力を終え、共有保存の完了を確認してください。未同期の内容がある場合は統合を停止し、入力を残します。</p>}
     {drafts.map(draft=><article key={draft.draftKey} className="rounded-xl border border-slate-200 p-3"><div className="flex gap-2">{drafts.length>1&&<input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-teal-700" aria-label={names(draft)+'をまとめる対象に選択'} checked={selected.includes(draft.draftKey)} disabled={busy} onChange={()=>{setConfirming(false);setSelected(previous=>previous.includes(draft.draftKey)?previous.filter(key=>key!==draft.draftKey):[...previous,draft.draftKey]);}}/>}<div className="min-w-0 flex-1"><p className="break-words text-sm font-bold">{names(draft)}</p><p className="mt-1 text-xs text-slate-500">入力中 {draft.selectedChildIds.length}名</p></div></div><button type="button" disabled={busy} onClick={()=>onChoose(draft.draftKey)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 text-sm font-bold text-white">この入力画面で続ける・児童を追加<ArrowRight className="h-4 w-4"/></button></article>)}
     {drafts.length>1&&<div className="rounded-xl border-2 border-teal-300 bg-teal-50 p-3"><p className="text-sm font-bold">すでに別々になった入力中記録をまとめる</p><p className="mt-1 text-xs leading-relaxed">対象を2件以上選択してください。入力済みの内容と児童ごとの入力位置は保持します。別の日付・別職員・保存済み記録は対象外です。</p>{confirming?<><p className="mt-3 break-words text-sm font-bold">{selectedDrafts.map(names).join(' ／ ')}<br/>計{selectedDrafts.reduce((sum,draft)=>sum+draft.selectedChildIds.length,0)}名を、1つの入力画面にまとめます。</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>onMerge(selected,selected[0])} className="min-h-11 rounded-lg bg-teal-800 px-4 text-sm font-bold text-white">内容を保持してまとめる</button><button type="button" disabled={busy} onClick={()=>setConfirming(false)} className="min-h-11 rounded-lg border bg-white px-4 text-sm font-bold">戻る</button></div></>:<button type="button" disabled={busy||selected.length<2} onClick={()=>setConfirming(true)} className="mt-3 flex min-h-11 items-center gap-2 rounded-lg bg-teal-800 px-3 text-sm font-bold text-white disabled:opacity-40"><Layers className="h-4 w-4"/>選択した{selected.length}件の統合内容を確認</button>}</div>}
    </>}
   </div>
  </section>
 </div>,document.body);
}
