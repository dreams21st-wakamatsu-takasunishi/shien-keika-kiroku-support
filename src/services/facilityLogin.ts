import {supabase} from '../lib/supabase';
import {getAccessDeviceToken} from '../utils/accessDevice';
export interface FacilityChoice {ticket:string;expiresAt:string;staff:{recorderId:string;displayName:string}[]}
export function parseFacilityChoice(value:unknown):FacilityChoice{
 const row=value as FacilityChoice&{schemaVersion:number},seen=new Set<string>();
 if(row?.schemaVersion!==1||typeof row.ticket!=='string'||!/^[a-f\d]{64}$/i.test(row.ticket)||typeof row.expiresAt!=='string'||!Number.isFinite(Date.parse(row.expiresAt))||!Array.isArray(row.staff)||row.staff.length>500)throw Error('施設ログインの応答を確認できません。');
 const staff=row.staff.map(item=>{
  if(!item||typeof item.recorderId!=='string'||!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(item.recorderId)||seen.has(item.recorderId)||typeof item.displayName!=='string'||!item.displayName.trim()||item.displayName.length>100)throw Error('職員一覧を確認できません。');
  seen.add(item.recorderId);return {recorderId:item.recorderId,displayName:item.displayName};
 });
 return {ticket:row.ticket,expiresAt:row.expiresAt,staff};
}
async function invoke(body:Record<string,unknown>){
 if(!supabase)throw Error('クラウド接続が必要です。');
 const {data,error}=await supabase.functions.invoke('facility-login',{body:{...body,deviceToken:getAccessDeviceToken()}});
 if(error){let message='施設ログインできませんでした。通信と設定を確認してください。';try{const payload=await error.context.clone().json();if(typeof payload.error==='string')message=payload.error;}catch{/* Do not expose provider errors. */}throw Error(message);}
 return data;
}
export const beginFacilityLogin=async(organizationCode:string,loginId:string,password:string)=>parseFacilityChoice(await invoke({action:'begin',organizationCode,loginId,password}));
export const selectFacilityStaff=async(ticket:string,recorderId:string)=>{
 const data=await invoke({action:'select',ticket,recorderId});
 if(typeof data?.session?.access_token!=='string'||typeof data?.session?.refresh_token!=='string')throw Error('ログイン情報を確認できません。');
 return data.session as {access_token:string;refresh_token:string};
};
