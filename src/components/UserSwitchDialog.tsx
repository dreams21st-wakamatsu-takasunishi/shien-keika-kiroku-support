import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRightLeft,LoaderCircle,X} from 'lucide-react';

export function UserSwitchDialog({name,onSwitch,onClose}:{name:string;onSwitch:()=>Promise<void>;onClose:()=>void}){
 const root=useRef<HTMLElement>(null),running=useRef(false),mounted=useRef(true);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  mounted.current=true;
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';root.current?.querySelector<HTMLButtonElement>('[data-switch-cancel]')?.focus({preventScroll:true});
  return()=>{mounted.current=false;document.body.style.overflow=overflow;previous?.focus({preventScroll:true});};
 },[]);
 useEffect(()=>{if(busy)root.current?.focus({preventScroll:true});},[busy]);
 const close=()=>{if(!running.current)onClose();};
 const proceed=async()=>{
  if(running.current)return;running.current=true;setBusy(true);setError('');
  try{await onSwitch();}catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'ユーザーを切り替えられませんでした。現在の画面で再試行してください。');}
  finally{running.current=false;if(mounted.current)setBusy(false);}
 };
 return createPortal(<div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/60 p-3" onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();close();}
  if(event.key==='Tab'&&root.current){const nodes=[...root.current.querySelectorAll<HTMLElement>('button:not(:disabled)')],first=nodes[0],last=nodes.at(-1);if(!nodes.length){event.preventDefault();root.current.focus();}else if(document.activeElement===root.current||!root.current.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
 }}>
  <section ref={root} role="dialog" aria-modal="true" aria-labelledby="user-switch-title" aria-describedby="user-switch-description" tabIndex={-1} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 shadow-2xl outline-none">
   <header className="flex items-center justify-between gap-3"><h2 id="user-switch-title" className="flex items-center gap-2 text-lg font-black"><ArrowRightLeft className="h-5 w-5 text-teal-700"/>ユーザーの切り替え</h2><button type="button" onClick={close} disabled={busy} aria-label="ユーザー切り替えを閉じる" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 disabled:opacity-40"><X className="h-5 w-5"/></button></header>
   <p className="mt-4 rounded-xl bg-teal-50 p-3 text-sm">現在のユーザー<strong className="mt-1 block break-words text-base text-teal-950">{name}</strong></p>
   <p id="user-switch-description" className="mt-4 text-sm leading-relaxed">この端末でログアウトし、ログイン画面へ戻ります。次の職員は、施設ログイン・本人用QR・職員ID／メールでログインしてください。</p>
   <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">編集中の配車・予定などは先に保存してください。支援記録は本人の下書きとして共有保存を確認してから切り替えます。出退勤の打刻は行いません。</p>
   {error&&<p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}
   {busy&&<p role="status" className="mt-3 flex items-center gap-2 text-sm font-bold"><LoaderCircle className="h-4 w-4 animate-spin"/>入力内容・ログアウトを確認しています…</p>}
   <div className="mt-5 flex flex-col gap-2"><button type="button" disabled={busy} onClick={()=>void proceed()} className="min-h-12 rounded-xl bg-teal-700 px-3 text-sm font-black text-white disabled:opacity-50">切り替えてログイン画面へ</button><button type="button" data-switch-cancel disabled={busy} onClick={close} className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm font-bold disabled:opacity-50">今のユーザーで続ける</button></div>
  </section>
 </div>,document.body);
}
