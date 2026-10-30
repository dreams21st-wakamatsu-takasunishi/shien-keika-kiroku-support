import {supabase} from '../lib/supabase';
import {getAccessDeviceLabel,getAccessDevicePlatform,getAccessDeviceToken} from '../utils/accessDevice';
import {parseFacilityChoice,type FacilityChoice} from './facilityLogin';

export interface UnifiedSignInResult {
 error:Error|null;
 choice?:FacilityChoice;
 organizationCode?:string;
 requiresOrganization?:boolean;
}
export class UnifiedLoginError extends Error {
 constructor(message:string,public requiresOrganization=false){super(message);}
}
export async function authenticateUnifiedLogin(loginId:string,password:string,organizationCode:string){
 if(!supabase)throw new UnifiedLoginError('クラウド接続が必要です。');
 const {data,error}=await supabase.functions.invoke('unified-login',{body:{loginId:loginId.trim(),password,organizationCode:organizationCode.trim(),
  deviceToken:getAccessDeviceToken(),deviceLabel:getAccessDeviceLabel(),platform:getAccessDevicePlatform()}});
 if(error){
  let message='ログインできませんでした。通信状況と入力内容を確認してください。',requiresOrganization=false;
  try{const body=await error.context.clone().json();if(typeof body.error==='string')message=body.error;requiresOrganization=body.code==='ORGANIZATION_REQUIRED';}catch{/* No raw provider or credential output. */}
  throw new UnifiedLoginError(message,requiresOrganization);
 }
 const code=typeof data?.organizationCode==='string'&&/^[A-Z0-9]{8,16}$/.test(data.organizationCode)?data.organizationCode:undefined;
 if(data?.kind==='facility')return {choice:parseFacilityChoice(data.choice),organizationCode:code};
 if(data?.kind!=='session'||typeof data.session?.access_token!=='string'||!data.session.access_token||typeof data.session?.refresh_token!=='string'||!data.session.refresh_token)throw new UnifiedLoginError('ログイン情報を確認できませんでした。');
 return {session:data.session as {access_token:string;refresh_token:string},organizationCode:code};
}
