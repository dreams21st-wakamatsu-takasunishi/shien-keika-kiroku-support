import {supabase} from '../lib/supabase';
export interface ExternalAiPolicy {enabled:boolean;revision:number;policyVersion:number;reviewedAt?:string;reviewedByName?:string}
export async function loadExternalAiPolicy():Promise<ExternalAiPolicy>{
 if(!supabase)return {enabled:false,revision:0,policyVersion:1};
 const {data,error}=await supabase.rpc('get_external_ai_policy');if(error)throw Error('AI取扱設定を取得できません。管理者にDB更新・端末権限を確認してください。');return data;
}
export async function saveExternalAiPolicy(enabled:boolean,revision:number,checks:boolean[]):Promise<ExternalAiPolicy>{
 if(!supabase)throw Error('外部AIの許可は事業所にログインして設定してください。');
 const {data,error}=await supabase.rpc('set_external_ai_policy',{p_enabled:enabled,p_expected_revision:revision,p_contract_confirmed:checks[0]===true,p_informing_confirmed:checks[1]===true,p_handling_confirmed:checks[2]===true});
 if(error)throw Error(error.code==='40001'?'別の管理者が設定を更新しました。画面を開き直してください。':'外部AIの設定を保存できません。管理者権限と確認項目を確認してください。');return data;
}
export interface AiPreview {text:string;token:string}
/** Native modal; no persistence, logging, HTML insertion or second network call before approval. */
export function approveAiPreview(preview:AiPreview):Promise<boolean>{
 if(typeof preview?.text!=='string'||typeof preview?.token!=='string'||!preview.text||preview.text.length>30000)return Promise.reject(Error('送信プレビューを確認できません。'));
 return new Promise(resolve=>{
  const previous=document.activeElement,dialog=document.createElement('dialog');dialog.setAttribute('aria-label','外部AIへ送る内容の確認');dialog.className='fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,760px)] overflow-y-auto rounded-2xl border border-slate-300 bg-white p-5 text-slate-950 shadow-2xl';
  const title=document.createElement('h2');title.textContent='外部AIへ送る内容の確認';title.className='text-lg font-black';
  const note=document.createElement('p');note.textContent='Google Geminiへ、以下の文章だけを送信します。識別情報の自動除去は完全ではありません。氏名・連絡先・住所・不要な個人情報が残っていたら、送信せず元の入力を修正してください。匿名加工情報であることを保証する処理ではありません。';note.className='my-3 text-sm leading-relaxed';
  const text=document.createElement('textarea');text.readOnly=true;text.value=preview.text;text.setAttribute('aria-label','外部AIへ送信する文章');text.className='h-64 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm';
  const label=document.createElement('label');label.className='my-3 flex items-start gap-2 text-sm font-bold';const check=document.createElement('input');check.type='checkbox';check.className='mt-1 h-5 w-5';label.append(check,document.createTextNode('識別情報が残っていないこと、業務に必要な情報だけであることを確認しました'));
  const buttons=document.createElement('div');buttons.className='flex flex-wrap justify-end gap-3';const cancel=document.createElement('button'),send=document.createElement('button');cancel.type=send.type='button';cancel.textContent='送信せず戻る';send.textContent='確認した内容を送信';cancel.className='min-h-11 rounded-xl border px-4 font-bold';send.className='min-h-11 rounded-xl bg-teal-700 px-4 font-bold text-white disabled:opacity-40';send.disabled=true;check.onchange=()=>send.disabled=!check.checked;
  let done=false;const finish=(accepted:boolean)=>{if(done)return;done=true;observer.disconnect();dialog.close();dialog.remove();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();resolve(accepted);};
  const observer=new MutationObserver(()=>{if(!previous?.isConnected)finish(false);});observer.observe(document.body,{childList:true,subtree:true});
  cancel.onclick=()=>finish(false);send.onclick=()=>{if(check.checked)finish(true);};dialog.oncancel=e=>{e.preventDefault();finish(false);};buttons.append(cancel,send);dialog.append(title,note,text,label,buttons);document.body.append(dialog);
  try{dialog.showModal();cancel.focus();}catch{finish(false);}
 });
}
