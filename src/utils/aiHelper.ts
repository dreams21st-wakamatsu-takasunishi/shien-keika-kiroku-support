import {supabase} from '../lib/supabase';
import {approveAiPreview} from '../services/externalAiPrivacy';
async function invokeApprovedAi(body:Record<string,unknown>){
 const call=async(payload:Record<string,unknown>)=>{
  const {data,error}=await supabase!.functions.invoke('polish-record',{body:payload});
  if(error){let message='AI処理を実行できませんでした。入力内容は変更していません。';try{message=(await error.context?.json())?.error||message;}catch{/* Never log or echo a raw response. */}throw Error(message);}
  return data;
 };
 const preview=await call({...body,mode:'preview'});
 if(!await approveAiPreview(preview.preview))throw Error('AI送信を取り消しました。入力内容は変更していません。');
 const result=await call({...body,mode:'generate',previewToken:preview.preview.token});
 if(typeof result?.text!=='string'||!result.text.trim())throw Error('AIの文章を取得できませんでした。入力内容は変更していません。');
 return result.text.trim() as string;
}
export async function polishRecordTextWithAI(_childName:string,sectionTitle:string,checkSummary:string,roughNotes:string,recordId?:string):Promise<string>{
 if(!supabase)return [checkSummary,roughNotes].filter(Boolean).join('\n');
 return invokeApprovedAi({sectionTitle,checkSummary,roughNotes,recordId,taskType:'record_summary'});
}
export async function summarizeABCWithAI(sectionTitle:string,behavior:string,consequence:string,antecedent:string,recordId?:string,childId?:string):Promise<string>{
 if(!supabase)return [antecedent&&`前の状況：${antecedent}`,behavior&&`行動：${behavior}`,consequence&&`その後：${consequence}`].filter(Boolean).join('。');
 return invokeApprovedAi({sectionTitle,recordId,childId,taskType:'abc_summary',abc:{behavior,consequence,antecedent}});
}
