import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ChevronRight,LoaderCircle,Users} from 'lucide-react';
import type {FacilityChoice} from '../services/facilityLogin';

export function FacilityStaffChoice({choice,onSelect,onBack,onBusyChange}:{choice:FacilityChoice;onSelect?:(ticket:string,id:string,signal?:AbortSignal)=>Promise<{error:Error|null}>;onBack:(error?:string)=>void;onBusyChange:(busy:boolean)=>void}){
 const [busy,setBusy]=useState(false);
 const controller=useRef<AbortController|null>(null),running=useRef(false),mounted=useRef(true),back=useRef(onBack);
 back.current=onBack;
 useEffect(()=>{
  mounted.current=true;
  const timer=window.setTimeout(()=>{controller.current?.abort();back.current('職員選択の期限が切れました。もう一度ログインしてください。');},Math.max(0,Math.min(300000,Date.parse(choice.expiresAt)-Date.now())));
  return()=>{mounted.current=false;window.clearTimeout(timer);controller.current?.abort();onBusyChange(false);};
 },[choice,onBusyChange]);
 const select=async(id:string)=>{
  if(running.current)return;running.current=true;setBusy(true);onBusyChange(true);controller.current=new AbortController();
  try{
   if(!onSelect)throw new Error('ログイン機能の設定を確認してください。');
   const result=await onSelect(choice.ticket,id,controller.current.signal);if(result.error)throw result.error;
  }catch(cause){if(mounted.current)back.current(cause instanceof Error?cause.message:'職員選択を確認できませんでした。もう一度ログインしてください。');}
  finally{running.current=false;if(mounted.current){setBusy(false);onBusyChange(false);}}
 };
 return <section aria-label="施設共通ログインの職員選択">
  <h2 className="text-lg font-black text-slate-950">利用する職員を選択</h2>
  <p className="mt-2 text-xs leading-relaxed text-slate-600">施設共通ログインを確認しました。ご自身の名前を選んでください。</p>
  <ul className="mt-4 max-h-96 divide-y divide-slate-200 overflow-y-auto border-y border-slate-200">{choice.staff.map(row=><li key={row.recorderId}><button type="button" disabled={busy} onClick={()=>void select(row.recorderId)} className="flex min-h-14 w-full items-center justify-between gap-3 px-2 py-3 text-left text-sm font-bold hover:bg-teal-50 disabled:opacity-50"><span className="flex min-w-0 items-center gap-2"><Users className="h-4 w-4 shrink-0 text-teal-700"/><span className="min-w-0 break-words">{row.displayName}</span></span>{busy?<LoaderCircle className="h-4 w-4 shrink-0 animate-spin"/>:<ChevronRight className="h-4 w-4 shrink-0"/>}</button></li>)}</ul>
  {!choice.staff.length&&<p role="status" className="mt-3 text-sm text-amber-950">選択できる一般職員がいません。管理者に職員登録とログインの紐づけを確認してください。</p>}
  <button type="button" disabled={busy} onClick={()=>onBack()} className="mt-3 flex min-h-11 items-center gap-2 text-sm font-bold text-teal-800"><ArrowLeft className="h-4 w-4"/>ログイン入力に戻る</button>
 </section>;
}
