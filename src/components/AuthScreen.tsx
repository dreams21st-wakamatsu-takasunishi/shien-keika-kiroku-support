import {useRef,useState,type FormEvent} from 'react';
import {Building2,ChevronRight,FileText,IdCard,LockKeyhole,QrCode,ShieldCheck} from 'lucide-react';
import {ManualLinks} from './ManualLinks';
import {AttendanceQrScanner} from './AttendanceQrScanner';
import {FacilityQrPunchControls} from './AttendanceQr';
import {FacilityStaffChoice} from './FacilityStaffChoice';
import type {FacilityChoice} from '../services/facilityLogin';
import type {UnifiedSignInResult} from '../services/unifiedLogin';

interface AuthScreenProps {
 onUnifiedSignIn:(loginId:string,password:string,organizationCode:string)=>Promise<UnifiedSignInResult>;
 onQrSignIn:(token:string)=>Promise<{error:Error|null}>;
 onFacilitySignIn?:(ticket:string,recorderId:string,signal?:AbortSignal)=>Promise<{error:Error|null}>;
 initialMessage?:string|null;
}
const organizationKey='support-staff-organization-code-v1';
function rememberedCode(){try{const code=localStorage.getItem(organizationKey)||'';return /^[A-Z0-9]{8,16}$/.test(code)?code:'';}catch{return '';}}
function remember(code:string){try{localStorage.setItem(organizationKey,code);}catch{/* Only a non-secret code is optional. */}}

export function AuthScreen({onUnifiedSignIn,onQrSignIn,onFacilitySignIn,initialMessage}:AuthScreenProps){
 const [loginId,setLoginId]=useState(''),[password,setPassword]=useState(''),[organizationCode,setOrganizationCode]=useState(rememberedCode);
 const [organizationOpen,setOrganizationOpen]=useState(false),[message,setMessage]=useState(initialMessage||'');
 const [submitting,setSubmitting]=useState(false),[qrOpen,setQrOpen]=useState(false),[choice,setChoice]=useState<FacilityChoice|null>(null);
 const inFlight=useRef(false);
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(inFlight.current)return;inFlight.current=true;setSubmitting(true);setMessage('');
  try{
   const result=await onUnifiedSignIn(loginId.trim(),password,organizationCode);
   setPassword('');
   if(result.error){setMessage(result.error.message);if(result.requiresOrganization)setOrganizationOpen(true);return;}
   if(result.organizationCode){setOrganizationCode(result.organizationCode);remember(result.organizationCode);}
   if(result.choice)setChoice(result.choice);
  }catch(cause){setPassword('');setMessage(cause instanceof Error?cause.message:'ログインできませんでした。通信状況を確認してください。');}
  finally{inFlight.current=false;setSubmitting(false);}
 };
 const qrSignIn=async(token:string)=>{
  if(inFlight.current)return;inFlight.current=true;setSubmitting(true);
  try{const result=await onQrSignIn(token);if(result.error)throw result.error;setQrOpen(false);}
  finally{inFlight.current=false;setSubmitting(false);}
 };
 const input='mt-1 min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-slate-50 py-2 pl-10 pr-3 text-base font-normal text-slate-950 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-100';
 return <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
  <main className="w-full max-w-md">
   <header className="mb-6 text-center text-white"><span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-teal-600"><FileText className="h-7 w-7"/></span><h1 className="text-xl font-bold">Dサポート</h1><p className="mt-1 text-xs text-slate-400">児発・放課後等デイサービス向け共有記録システム</p></header>
   <section className="rounded-2xl border border-slate-800 bg-white p-5 shadow-2xl sm:p-6" aria-label="Dサポートのログイン">
    <ManualLinks screen="auth" className="mb-4"/>
    <p className="mb-5 flex gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs leading-relaxed text-teal-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>管理者が登録・招待した職員のみ利用できます。</p>
    {message&&<p role="alert" className="mb-4 break-words rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">{message}</p>}
    {choice?<FacilityStaffChoice choice={choice} onSelect={onFacilitySignIn} onBusyChange={setSubmitting} onBack={error=>{setChoice(null);setMessage(error||'');}}/>:<>
     <h2 className="text-lg font-black text-slate-950">ログイン</h2>
     <p className="mt-1 text-xs leading-relaxed text-slate-600">メールアドレス・職員ID・施設IDを同じ欄に入力できます。</p>
     <form aria-label="共通ログイン" onSubmit={event=>void submit(event)} className="mt-5 space-y-4">
      <label className="block text-sm font-bold text-slate-800">ログインID<span className="relative block"><IdCard className="absolute left-3 top-4 h-5 w-5 text-slate-400"/><input required name="username" aria-label="ログインID" autoComplete="username" autoCapitalize="none" spellCheck={false} value={loginId} disabled={submitting} onChange={event=>setLoginId(event.target.value)} placeholder="メールアドレス・職員ID・施設ID" className={input}/></span></label>
      <label className="block text-sm font-bold text-slate-800">パスワード<span className="relative block"><LockKeyhole className="absolute left-3 top-4 h-5 w-5 text-slate-400"/><input required name="password" aria-label="パスワード" type="password" autoComplete="current-password" value={password} disabled={submitting} onChange={event=>setPassword(event.target.value)} className={input}/></span></label>
      <details open={organizationOpen} onToggle={event=>setOrganizationOpen(event.currentTarget.open)} className="rounded-xl border border-slate-200 p-3">
       <summary className="cursor-pointer text-xs font-bold text-slate-600"><Building2 className="mr-1 inline h-4 w-4"/>{organizationCode?'事業所設定済み（確認・変更）':'初回の事業所設定・事業所を変更'}</summary>
       <label className="mt-3 block text-xs font-bold text-slate-700">事業所コード<input aria-label="事業所コード" autoCapitalize="characters" autoComplete="organization" value={organizationCode} disabled={submitting} onChange={event=>setOrganizationCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,16))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 font-normal"/></label>
       <p className="mt-2 text-[11px] leading-relaxed text-slate-500">登録済み端末では事業所を自動確認します。未登録端末でIDを使う場合は初回に入力してください。メールログインでは不要です。</p>
      </details>
      <button type="submit" disabled={submitting} className="min-h-12 w-full rounded-xl bg-teal-700 px-3 text-sm font-black text-white hover:bg-teal-600 disabled:opacity-50">{submitting?'確認中…':'ログイン'}<ChevronRight className="ml-1 inline h-4 w-4"/></button>
     </form>
     <p className="mt-3 text-[11px] leading-relaxed text-slate-500">施設IDは承認済み施設共用端末専用です。個人スマホでは本人の職員ID／メールを使用してください。</p>
     <section aria-label="施設端末でのQR操作" className="mt-5 border-t border-slate-200 pt-4">
      <button type="button" disabled={submitting} onClick={()=>{setPassword('');setMessage('');setQrOpen(true);}} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 text-sm font-black text-sky-900 disabled:opacity-50"><QrCode className="h-5 w-5"/>本人用QRでログイン</button>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">承認済み施設共用端末で読み取ります。ログインでは出勤打刻しません。</p>
      <details className="mt-3"><summary className="cursor-pointer py-2 text-xs font-bold text-slate-600">出退勤だけ行う（ログインしません）</summary><FacilityQrPunchControls disabled={submitting}/></details>
     </section>
    </>}
   </section>
  </main>
  {qrOpen&&<AttendanceQrScanner action="ログイン" onClose={()=>setQrOpen(false)} onScanned={qrSignIn}/>}
 </div>;
}
