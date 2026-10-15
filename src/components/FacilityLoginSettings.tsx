import {useEffect,useRef,useState} from 'react';
import {Building2,RefreshCw,Save} from 'lucide-react';
import {supabase} from '../lib/supabase';
interface Configuration {schemaVersion:number;organizationCode:string;loginId:string;enabled:boolean;configured:boolean;revision:number;deviceApprovalEnabled:boolean;eligibleCount:number;privilegedEmailPending:number}
export function FacilityLoginSettings({organizationId}:{organizationId:string}){
 const [config,setConfig]=useState<Configuration|null>(null),[loginId,setLoginId]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[enabled,setEnabled]=useState(false),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const generation=useRef(0);
 const accept=(row:Configuration)=>{
  if(row?.schemaVersion!==1||typeof row.organizationCode!=='string'||typeof row.loginId!=='string'||typeof row.enabled!=='boolean'||!Number.isInteger(row.revision)||!Number.isInteger(row.eligibleCount)||!Number.isInteger(row.privilegedEmailPending))throw Error('施設ログイン設定を確認できません。');
  setConfig(row);setLoginId(row.loginId);setEnabled(row.enabled);setPassword('');setConfirm('');setAck(false);
 };
 const refresh=async()=>{
  const v=++generation.current;setBusy(true);setConfig(null);setPassword('');setConfirm('');setMessage('');
  try{if(!supabase)throw Error('クラウド接続が必要です。');const {data,error}=await supabase.rpc('get_facility_login_configuration');if(error)throw Error('施設ログイン設定は管理者のみ確認できます。');if(v===generation.current)accept(data);}
  catch(e){if(v===generation.current)setMessage(e instanceof Error?e.message:'設定を取得できません。');}
  finally{if(v===generation.current)setBusy(false);}
 };
 useEffect(()=>{void refresh();return()=>{generation.current++;};},[organizationId]);
 const save=async()=>{
  if(!config||!supabase)return;
  if(password!==confirm){setMessage('確認用パスワードが一致しません。');return;}
  if(enabled&&(!config.deviceApprovalEnabled||config.privilegedEmailPending||!ack)){setMessage('端末承認と特別権限職員のメールログイン、利用上の確認が必要です。');return;}
  if(!window.confirm('施設ログイン設定を保存します。利用中の施設ログインは再ログインが必要になります。続けますか？'))return;
  const v=++generation.current;setBusy(true);setMessage('');
  try{const {data,error}=await supabase.rpc('set_facility_login_configuration',{p_enabled:enabled,p_login_id:loginId,p_password:password||null,p_revision:config.revision});if(error)throw Error(error.code==='PT409'?'設定が変更されています。再取得してください。':'保存できませんでした。管理者のメールログイン・端末承認・入力内容を確認してください。');if(v===generation.current){accept(data);setMessage('施設ログイン設定を保存しました。');}}
  catch(e){if(v===generation.current)setMessage(e instanceof Error?e.message:'設定を保存できません。');}
  finally{setPassword('');setConfirm('');if(v===generation.current)setBusy(false);}
 };
 const input='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3';
 return <section aria-label="施設共通ログインの管理" className="space-y-4 border-y border-slate-200 py-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-base font-bold"><Building2 className="h-5 w-5 text-teal-700"/>施設共通ログイン</h3><button type="button" disabled={busy} onClick={()=>void refresh()} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm"><RefreshCw className="h-4 w-4"/>設定を再取得</button></div>
  {message&&<p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">{message}</p>}
  {config&&<form aria-label="施設共通ログイン設定" onSubmit={e=>{e.preventDefault();void save();}} className="space-y-4">
   <p className="break-all text-sm">事業所コード：<strong>{config.organizationCode}</strong> / 選択可能な一般職員：{config.eligibleCount}名</p>
   {(!config.deviceApprovalEnabled||config.privilegedEmailPending>0)&&<p role="alert" className="border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900">{!config.deviceApprovalEnabled?'端末承認を有効にしてください。 ':''}{config.privilegedEmailPending>0?`特別権限職員${config.privilegedEmailPending}名の個人メールログイン整備が必要です。`:''}</p>}
   <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
    <label className="text-sm sm:col-span-2">施設ID<input aria-label="設定する施設ID" required pattern="[a-zA-Z0-9._-]{3,32}" value={loginId} onChange={e=>setLoginId(e.target.value.toLowerCase())} autoComplete="off" className={input}/></label>
    <label className="text-sm">{config.configured?'新しい共通パスワード（変更時のみ）':'共通パスワード'}<input aria-label="設定する共通パスワード" required={!config.configured} minLength={12} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className={input}/></label>
    <label className="text-sm">確認用パスワード<input aria-label="共通パスワードの確認" type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} className={input}/></label>
    <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" aria-label="施設共通ログインを有効にする" checked={enabled} onChange={e=>setEnabled(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-teal-700"/>施設共通ログインを有効にする</label>
    {enabled&&<label className="flex items-start gap-2 border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 sm:col-span-2"><input type="checkbox" aria-label="職員選択の運用リスクを確認" checked={ack} onChange={e=>setAck(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-teal-700"/>職員選択は本人認証ではなく、施設内の他の利用者が別の職員名を選べることを確認しました。特別権限の職員は個人メールでログインします。</label>}
   </fieldset>
   <button type="submit" disabled={busy||enabled&&(!ack||!config.deviceApprovalEnabled||config.privilegedEmailPending>0)} className="flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>施設ログイン設定を保存</button>
  </form>}
 </section>;
}
