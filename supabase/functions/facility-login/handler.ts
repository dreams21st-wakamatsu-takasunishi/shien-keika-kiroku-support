import type {SupabaseClient} from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type,x-support-device-token','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value);
const token=(value:unknown):value is string=>typeof value==='string'&&/^[a-f\d]{64}$/i.test(value);
const invalid='施設のログイン情報と、施設共用端末の登録・承認を確認してください。';
export function createFacilityLoginHandler(service:SupabaseClient,login:SupabaseClient){
 return async(request:Request):Promise<Response>=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(request.method!=='POST')return reply({error:'POSTで送信してください。'},405);
  let mintedToken:string|undefined;
  try{
   const raw=await request.text();if(raw.length>4096)return reply({error:invalid},400);
   let body;try{body=JSON.parse(raw);}catch{return reply({error:invalid},400);}
   if(!token(body?.deviceToken))return reply({error:invalid},400);
   if(body.action==='begin'){
    if(typeof body.organizationCode!=='string'||!/^[A-Z0-9]{8,16}$/.test(body.organizationCode)||typeof body.loginId!=='string'||!/^[A-Za-z0-9._-]{3,32}$/.test(body.loginId)
     ||typeof body.password!=='string'||body.password.length<12||new TextEncoder().encode(body.password).length>72)return reply({error:invalid},400);
    const ticket=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    const {data,error}=await service.rpc('begin_facility_choice_login',{p_code:body.organizationCode,p_login:body.loginId,p_password:body.password,p_device:body.deviceToken,p_ticket:ticket});
    if(error)return reply({error:'施設ログインの設定を確認できません。管理者にお問い合わせください。'},503);
    if(data?.errorCode)return reply({error:data.errorCode==='rate'?'ログインの試行回数が上限に達しました。15分ほど待ってください。':invalid},data.errorCode==='rate'?429:403);
    if(data?.schemaVersion!==1||!Array.isArray(data.staff)||data.staff.length>500||!Number.isFinite(Date.parse(data.expiresAt)))return reply({error:invalid},503);
    const seen=new Set<string>();
    const staff=data.staff.map((row:{recorderId:string;displayName:string})=>{
     if(!uuid(row.recorderId)||seen.has(row.recorderId)||typeof row.displayName!=='string'||!row.displayName.trim()||row.displayName.length>100)throw Error('projection');
     seen.add(row.recorderId);return {recorderId:row.recorderId,displayName:row.displayName};
    });
    return reply({schemaVersion:1,ticket,expiresAt:data.expiresAt,staff});
   }
   if(body.action!=='select'||!token(body.ticket)||!uuid(body.recorderId))return reply({error:invalid},400);
   const {data:chosen,error:chooseError}=await service.rpc('consume_facility_choice_login',{p_ticket:body.ticket,p_device:body.deviceToken,p_recorder:body.recorderId});
   if(chooseError||chosen?.errorCode||!uuid(chosen?.userId)||!uuid(chosen?.challengeId))return reply({error:'職員の選択を確認できません。施設ログインからやり直してください。'},403);
   const {data:userData,error:userError}=await service.auth.admin.getUserById(chosen.userId),user=userData?.user;
   if(userError||!user?.email||user.id!==chosen.userId||!user.email_confirmed_at||user.is_anonymous||user.is_sso_user||user.deleted_at
    ||user.user_metadata?.needs_password_setup||user.banned_until&&Date.parse(user.banned_until)>Date.now())return reply({error:'この職員は施設ログインを利用できません。管理者に確認してください。'},403);
   const {data:factors,error:factorError}=await service.auth.admin.mfa.listFactors({userId:user.id});
   if(factorError||!factors)return reply({error:'認証設定を確認できません。通常のログインをご利用ください。'},503);
   if(factors.factors.some(factor=>factor.status==='verified'))return reply({error:'二段階認証が設定されています。個人のメールログインをご利用ください。'},403);
   const {data:link,error:linkError}=await service.auth.admin.generateLink({type:'magiclink',email:user.email});
   if(linkError||link?.user?.id!==user.id||!link.properties?.hashed_token)return reply({error:'ログイン情報を発行できません。施設ログインからやり直してください。'},503);
   const {data:verified,error:verifyError}=await login.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'email'});
   if(verifyError||!verified.session||verified.user?.id!==user.id||verified.session.user.id!==user.id)return reply({error:'ログインできません。施設ログインからやり直してください。'},503);
   mintedToken=verified.session.access_token;
   const claims=JSON.parse(atob(mintedToken.split('.')[1].replaceAll('-','+').replaceAll('_','/')));
   if(!uuid(claims.session_id)||claims.sub!==user.id)throw Error('session');
   const {data:finished,error:finishError}=await service.rpc('finish_facility_choice_login',{p_challenge:chosen.challengeId,p_user:user.id,p_session:claims.session_id,p_device:body.deviceToken});
   if(finishError||finished!==true)throw Error('changed');
   const {data:latest,error:latestError}=await service.auth.admin.getUserById(user.id);
   if(latestError||!latest.user||latest.user.deleted_at||latest.user.banned_until&&Date.parse(latest.user.banned_until)>Date.now())throw Error('account changed');
   return reply({session:{access_token:mintedToken,refresh_token:verified.session.refresh_token}});
  }catch{
   if(mintedToken)await service.auth.admin.signOut(mintedToken,'local').catch(()=>{});
   return reply({error:'ログイン状態を確定できません。施設ログインからやり直してください。'},503);
  }
 };
}
