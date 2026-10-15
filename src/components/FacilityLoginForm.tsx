import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Building2,ChevronRight,LoaderCircle,Users} from 'lucide-react';
import {beginFacilityLogin,type FacilityChoice} from '../services/facilityLogin';
export function FacilityLoginForm({onSelect,onBusyChange}:{onSelect?:(ticket:string,recorderId:string,signal?:AbortSignal)=>Promise<{error:Error|null}>;onBusyChange?:(busy:boolean)=>void}){
 const [code,setCode]=useState(()=>{try{return localStorage.getItem('support-staff-organization-code-v1')||'';}catch{return '';}}),[id,setId]=useState(''),[password,setPassword]=useState('');
 const [choice,setChoice]=useState<FacilityChoice|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),pendingSelection=useRef<AbortController|null>(null);
 useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
 useEffect(()=>()=>{generation.current++;pendingSelection.current?.abort();onBusyChange?.(false);},[onBusyChange]);
 useEffect(()=>{
  if(!choice)return;
  const timer=window.setTimeout(()=>{generation.current++;pendingSelection.current?.abort();setChoice(null);setBusy(false);setError('職員選択の期限が切れました。施設ログインからやり直してください。');},Math.max(0,Math.min(300000,Date.parse(choice.expiresAt)-Date.now())));
  return()=>clearTimeout(timer);
 },[choice]);
 const begin=async()=>{
  const v=++generation.current;setBusy(true);setError('');
  try{const result=await beginFacilityLogin(code.trim().toUpperCase(),id.trim(),password);if(v!==generation.current)return;setChoice(result);setPassword('');try{localStorage.setItem('support-staff-organization-code-v1',code.trim().toUpperCase());}catch{/* Non-secret code only. */}}
  catch(e){if(v===generation.current){setPassword('');setError(e instanceof Error?e.message:'施設ログインできませんでした。');}}
  finally{if(v===generation.current)setBusy(false);}
 };
 const select=async(recorderId:string)=>{
  if(!choice||busy)return;const v=++generation.current;setBusy(true);setError('');
  pendingSelection.current=new AbortController();
  try{if(!onSelect)throw Error('ログイン機能の設定を確認してください。');const result=await onSelect(choice.ticket,recorderId,pendingSelection.current.signal);if(result.error)throw result.error;}
  catch(e){if(v===generation.current){setChoice(null);setError(e instanceof Error?e.message:'職員を選択できませんでした。');}}
  finally{if(v===generation.current)setBusy(false);}
 };
 const input='mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 font-normal';
 return <section aria-label="施設共通ログイン" className="space-y-4">
  <h2 className="flex items-center gap-2 text-base font-bold"><Building2 className="h-5 w-5 text-teal-700"/>{choice?'利用する職員を選択':'施設共通ログイン'}</h2>
  {error&&<p role="alert" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">{error}</p>}
  {choice?<>
   <ul className="max-h-96 divide-y divide-slate-200 overflow-y-auto border-y border-slate-200">{choice.staff.map(row=><li key={row.recorderId}><button type="button" disabled={busy} onClick={()=>void select(row.recorderId)} className="flex min-h-14 w-full items-center justify-between gap-3 px-2 py-3 text-left text-sm font-bold hover:bg-teal-50 disabled:opacity-50"><span className="flex min-w-0 items-center gap-2"><Users className="h-4 w-4 shrink-0 text-teal-700"/><span className="min-w-0 break-words">{row.displayName}</span></span>{busy?<LoaderCircle className="h-4 w-4 shrink-0 animate-spin"/>:<ChevronRight className="h-4 w-4 shrink-0"/>}</button></li>)}</ul>
   {!choice.staff.length&&<p role="status" className="text-sm text-amber-950">選択できる一般職員がいません。職員管理でログインとの紐づけを確認してください。</p>}
   <button type="button" disabled={busy} onClick={()=>{generation.current++;setChoice(null);setError('');}} className="flex min-h-10 items-center gap-2 text-sm text-teal-800"><ArrowLeft className="h-4 w-4"/>施設ログインに戻る</button>
  </>:<form aria-label="施設ログイン情報" onSubmit={e=>{e.preventDefault();void begin();}} className="space-y-4">
   <label className="block text-xs font-bold">事業所コード<input aria-label="施設ログインの事業所コード" required autoCapitalize="characters" autoComplete="organization" value={code} disabled={busy} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,16))} className={input}/></label>
   <label className="block text-xs font-bold">施設ID<input aria-label="施設ID" required autoComplete="username" autoCapitalize="none" value={id} disabled={busy} onChange={e=>setId(e.target.value)} className={input}/></label>
   <label className="block text-xs font-bold">共通パスワード<input aria-label="共通パスワード" required type="password" autoComplete="current-password" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)} className={input}/></label>
   <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 text-sm font-bold text-white disabled:opacity-50">{busy?<LoaderCircle className="h-4 w-4 animate-spin"/>:<Users className="h-4 w-4"/>}職員選択へ</button>
  </form>}
 </section>;
}
