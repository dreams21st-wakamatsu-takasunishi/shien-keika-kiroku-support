import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {createStaffLoginHandler} from '../staff-login/handler.ts';
import {createFacilityLoginHandler} from '../facility-login/handler.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type,x-support-device-token','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const invalid='ログインID・パスワード・事業所設定と端末承認を確認してください。解決しない場合は管理者にIDの重複も確認してください。';

export function createUnifiedLoginHandler(service:SupabaseClient,login:SupabaseClient){
 const staff=createStaffLoginHandler(service,login),facility=createFacilityLoginHandler(service,login);
 return async(request:Request):Promise<Response>=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(request.method!=='POST')return reply({error:invalid},405);
  try{
   const raw=await request.text();if(raw.length>4096)return reply({error:invalid},400);
   let body;try{body=JSON.parse(raw);}catch{return reply({error:invalid},400);}
   if(typeof body?.loginId!=='string'||typeof body.password!=='string'||!body.password.length||body.password.length>1024
    ||typeof body.deviceToken!=='string'||!/^[a-f\d]{64}$/i.test(body.deviceToken))return reply({error:invalid},400);
   const id=body.loginId.trim();
   if(id.includes('@')){
    if(id.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id))return reply({error:invalid},400);
    const {data,error}=await login.auth.signInWithPassword({email:id,password:body.password});
    if(error||!data.session)return reply({error:invalid},401);
    return reply({kind:'session',session:{access_token:data.session.access_token,refresh_token:data.session.refresh_token}});
   }
   const code=typeof body.organizationCode==='string'?body.organizationCode.trim().toUpperCase():'';
   if(!/^[A-Za-z0-9._-]{3,32}$/.test(id)||code&&!/^[A-Z0-9]{8,16}$/.test(code))return reply({error:invalid},400);
   const {data:route,error}=await service.rpc('resolve_unified_login',{p_code:code||null,p_device:body.deviceToken,p_login:id});
   if(error)return reply({error:'認証設定を確認できません。時間をおいて再試行してください。'},503);
   if(route?.error==='organization_required')return reply({code:'ORGANIZATION_REQUIRED',error:'初回、または事業所を特定できない端末では事業所コードを入力してください。'},400);
   if(!['staff','facility'].includes(route?.method)||!/^[A-Z0-9]{8,16}$/.test(route?.organizationCode||''))return reply({error:invalid},401);
   const internal=new Request(request.url,{method:'POST',body:JSON.stringify(route.method==='facility'
    ?{action:'begin',organizationCode:route.organizationCode,loginId:id,password:body.password,deviceToken:body.deviceToken}
    :{organizationCode:route.organizationCode,employeeCode:id,password:body.password,deviceToken:body.deviceToken,deviceLabel:body.deviceLabel,platform:body.platform})});
   const response=await (route.method==='facility'?facility:staff)(internal);
   const result=await response.json();
   if(!response.ok){
    if(response.status===429)return reply({error:'試行回数が上限に達しました。しばらく待ってから再試行してください。'},429);
    // Staff device errors are returned only after successful password verification.
    if(route.method==='staff'&&['DEVICE_PENDING','DEVICE_REVOKED','DEVICE_OWNER_MISMATCH','OUTSIDE_ACCESS_TIME'].includes(result.code))return reply({error:result.error},403);
    return reply({error:invalid},response.status>=500?503:401);
   }
   return route.method==='facility'
    ?reply({kind:'facility',choice:result,organizationCode:route.organizationCode})
    :reply({kind:'session',session:result.session,organizationCode:route.organizationCode});
  }catch{return reply({error:'通信・認証処理を完了できませんでした。時間をおいて再試行してください。'},503);}
 };
}
