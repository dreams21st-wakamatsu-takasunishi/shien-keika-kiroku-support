import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Copy,RefreshCw,Save,Trash2,X} from 'lucide-react';
import type {SupportRecord} from '../types';
import {buildParentShareProposal,composeParentShare,parentShareSourceKey} from '../utils/parentShare';
import {deleteParentShareDraft,loadParentShareDraft,saveParentShareDraft,type ParentShareDraft} from '../services/parentShareService';

export function ParentShareDialog({record,remote,onClose}:{record:SupportRecord;remote:boolean;onClose:()=>void}){
 const proposal=useMemo(()=>buildParentShareProposal(record),[record]);
 const [selection,setSelection]=useState(()=>new Set(proposal.candidates.filter(c=>c.selected).map(c=>c.id)));
 const [text,setText]=useState(()=>composeParentShare(proposal.candidates,selection));
 const [draft,setDraft]=useState<ParentShareDraft|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(remote),[error,setError]=useState(''),[message,setMessage]=useState(''),[ack,setAck]=useState(false);
 const source=useRef(proposal.sourceKey),loadedSource=useRef(record.updatedAt),dirtyRef=useRef(false),dialog=useRef<HTMLElement>(null),mounted=useRef(true),running=useRef(false);
 dirtyRef.current=dirty;
 const stale=source.current!==parentShareSourceKey(record)||(draft!==null&&(draft.source_version!==(record.version||1)||Date.parse(draft.source_updated_at)!==Date.parse(record.updatedAt)));
 useEffect(()=>{mounted.current=true;const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.focus({preventScroll:true});return()=>{mounted.current=false;document.body.style.overflow=overflow;previous?.focus({preventScroll:true});};},[]);
 useEffect(()=>{if(!remote)return;let active=true;setBusy(true);loadParentShareDraft(record.id).then(saved=>{if(!active)return;if(saved){setDraft(saved);setText(saved.body);setDirty(false);loadedSource.current=saved.source_updated_at;}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[record.id,remote]);
 useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(dirtyRef.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[]);
 const close=()=>{if(busy||running.current)return;if(dirtyRef.current&&!window.confirm('共有文に未保存の変更があります。保存せずに閉じますか？'))return;onClose();};
 const regenerate=()=>{
  if((dirty||draft)&&!window.confirm('現在の共有文を、選択した掲載候補から作り直します。手直しした文章は置き換わります。続けますか？'))return;
  const selected=stale?new Set(proposal.candidates.filter(c=>c.selected).map(c=>c.id)):selection;
  setSelection(selected);setText(composeParentShare(proposal.candidates,selected));source.current=proposal.sourceKey;loadedSource.current=record.updatedAt;
  if(draft)setDraft({...draft,source_version:record.version||1,source_updated_at:record.updatedAt});dirtyRef.current=true;setDirty(true);setAck(false);setMessage('下書きを再作成しました。内容を確認してください。');
 };
 const save=async(copy=false)=>{
  if(running.current||busy||stale)return;running.current=true;setBusy(true);setError('');setMessage('');
  try{
   if(!text.trim()||text.length>4000)throw Error('共有文を1～4,000文字で入力してください。');
   if(copy&&!ack)throw Error('対象児童・日付・送信先と文章の内容を確認してください。');
   // Revalidate source and revision before every copy, including already saved drafts.
   const saved=remote?await saveParentShareDraft(record,text,draft?.revision||0):{body:text,revision:(draft?.revision||0)+1,source_version:record.version||1,source_updated_at:record.updatedAt};
   if(!mounted.current)return;setDraft(saved);setDirty(false);
   if(copy){await navigator.clipboard.writeText(text);if(mounted.current)setMessage('コピーしました。LINEでの送信は別途行ってください。送信済みにはしていません。');}
   else setMessage(remote?'共有文の下書きを保存しました。':'試用中のため、この画面内だけで保持しています。');
  }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'処理できませんでした。');}
  finally{running.current=false;if(mounted.current)setBusy(false);}
 };
 const remove=async()=>{
  if(!draft||busy||running.current||!window.confirm('この職員の共有文の下書きを削除しますか？元の支援記録は削除しません。'))return;
  running.current=true;setBusy(true);try{if(remote)await deleteParentShareDraft(record.id,draft.revision);if(mounted.current){setDraft(null);setText('');setDirty(false);setAck(false);setMessage('共有文の下書きを削除しました。');}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'削除できませんでした。');}finally{running.current=false;if(mounted.current)setBusy(false);}
 };
 return createPortal(<div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/60 p-2 sm:p-5" onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();close();}
  if(e.key==='Tab'&&dialog.current){const nodes=[...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="parent-share-title" tabIndex={-1} className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white text-slate-950 shadow-2xl outline-none">
  <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><h2 id="parent-share-title" className="font-black">保護者への共有文</h2><p className="mt-1 text-sm font-bold text-teal-800">{record.date} ／ {record.childName}</p></div><button type="button" aria-label="共有文を閉じる" onClick={close} disabled={busy} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border"><X className="h-5 w-5"/></button></header>
  <div className="grid min-h-0 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
   <div className="min-w-0"><p className="mb-3 rounded-xl bg-teal-50 p-3 text-xs leading-relaxed">外部AIは使用しません。選択した記録項目から下書きを作成します。自動送信は行いません。</p>
    <details><summary className="cursor-pointer py-2 text-sm font-bold">掲載候補を選ぶ（{proposal.candidates.length}件）</summary><div className="max-h-80 space-y-2 overflow-y-auto">{proposal.candidates.map(c=><label key={c.id} className="flex gap-2 rounded-lg border border-slate-200 p-3 text-xs"><input type="checkbox" disabled={busy} checked={selection.has(c.id)} onChange={e=>{setSelection(prev=>{const next=new Set(prev);if(e.target.checked)next.add(c.id);else next.delete(c.id);return next;});setAck(false);}} className="mt-1 h-4 w-4 shrink-0"/><span className="min-w-0"><strong className="block text-teal-900">{c.label}{c.manual?'・要確認':''}</strong><span className="mt-1 block whitespace-pre-wrap break-words">{c.text}</span></span></label>)}</div></details>
    <button type="button" disabled={busy} onClick={regenerate} className="mt-2 min-h-11 rounded-xl border border-teal-300 bg-teal-50 px-3 text-sm font-bold text-teal-900"><RefreshCw className="mr-1 inline h-4 w-4"/>選択候補から再作成</button>
    <div className="mt-4 space-y-2">{proposal.warnings.map(w=><p key={w} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">{w}</p>)}</div>
   </div>
   <div className="min-w-0"><label className="text-sm font-bold">共有文の下書き<textarea aria-label="保護者への共有文の下書き" rows={10} maxLength={4000} disabled={busy} value={text} onChange={e=>{dirtyRef.current=true;setText(e.target.value);setDirty(true);setAck(false);}} className="mt-2 min-h-64 w-full resize-y rounded-xl border-2 border-teal-200 bg-teal-50/40 p-3 text-base leading-7 focus:border-teal-600 focus:bg-white"/></label><p className="mt-1 text-xs text-slate-500">{text.length}文字 ／ 目安150～250文字。未入力の事実や気持ちを付け加えないでください。</p>
    {stale&&<p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-950">元の支援記録が更新されています。手直しした文章は残しています。元記録を確認し、掲載候補から再作成してください。</p>}
    <label className="mt-4 flex gap-2 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={ack} disabled={busy||stale} onChange={e=>setAck(e.target.checked)} className="mt-1 h-5 w-5 shrink-0"/>児童・日付・送信先を確認し、他児童の情報や連絡漏れ、記録との食い違いがないことを確認しました。</label>
   </div>
  </div>
  <footer className="border-t border-slate-200 p-3">{error&&<p role="alert" className="mb-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}{message&&<p role="status" className="mb-2 text-sm font-bold text-teal-800">{message}</p>}<div className="flex flex-wrap justify-end gap-2">{draft&&<button type="button" disabled={busy} onClick={()=>void remove()} className="mr-auto min-h-11 rounded-xl border px-3 text-sm font-bold text-rose-800"><Trash2 className="mr-1 inline h-4 w-4"/>下書きを削除</button>}<button type="button" disabled={busy||stale||!text.trim()} onClick={()=>void save()} className="min-h-11 rounded-xl border px-3 text-sm font-bold"><Save className="mr-1 inline h-4 w-4"/>下書き保存</button><button type="button" disabled={busy||stale||!ack||!text.trim()} onClick={()=>void save(true)} className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-black text-white"><Copy className="mr-1 inline h-4 w-4"/>{busy?'確認中…':'確認してコピー'}</button></div></footer>
 </section></div>,document.body);
}
