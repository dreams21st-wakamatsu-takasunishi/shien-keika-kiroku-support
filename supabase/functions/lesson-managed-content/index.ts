import {createClient} from 'npm:@supabase/supabase-js@2';
import {parseCampusContent,parseContentCampuses,parseContentItem} from '../../../src/learning/managedContent.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-support-device-token','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const failure=(message:string,status:number)=>Object.assign(Error(message),{status});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return reply({error:'POSTで送信してください。'},405);
 try{
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer\s+\S+$/i.test(authorization))throw failure('職員ログインが必要です。',401);
  const url=Deno.env.get('SUPABASE_URL')!;
  const user=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization,'x-support-device-token':request.headers.get('x-support-device-token')||''}}});
  const {data:auth,error:authError}=await user.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
  if(authError||!auth.user)throw failure('職員ログインを確認してください。',401);
  const context=async()=>{
   const {data,error}=await user.rpc('get_lesson_content_context');
   if(error||!data||data.actorId!==auth.user!.id||typeof data.organizationId!=='string'||data.canManageContent!==true)throw failure('承認端末と教材・ごほうび作成の専用権限が必要です。',403);
   return data as {actorId:string;organizationId:string};
  };
  const current=await context(),raw=await request.text();
  if(raw.length>140000)throw failure('内容が長すぎます。',400);
  let body;try{body=JSON.parse(raw);}catch{throw failure('送信内容を確認してください。',400);}
  if(!['list','get','save'].includes(body.action)||(body.action!=='list'&&(typeof body.campusId!=='string'||!body.campusId||body.campusId.length>80||body.campusId==='public')))throw failure('校舎と操作を確認してください。',400);
  let item;
  if(body.action==='save'){
   if(body.confirmed!==true||!Number.isSafeInteger(body.revision)||body.revision<0||!/^[a-f0-9]{32}$/.test(body.fingerprint||'')
    ||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.operationId||''))throw failure('保存内容を再確認してください。',400);
   try{item=parseContentItem(body.kind,body.item);}catch{throw failure('教材・ごほうびの入力内容を確認してください。',400);}
  }
  const sourceProject=Deno.env.get('D_LESSON_PROJECT_REF')||'',secret=Deno.env.get('D_LESSON_BRIDGE_SECRET')||'';
  if(!/^[a-z0-9]{20}$/.test(sourceProject)||secret.length<32)throw failure('学習連携のサーバー設定が未完了です。',503);
  const before=await context();
  if(before.organizationId!==current.organizationId)throw failure('職員の所属が変更されました。',403);
  const response=await fetch(`https://${sourceProject}.supabase.co/functions/v1/support-managed-content`,{method:'POST',headers:{'Content-Type':'application/json','x-lesson-bridge-key':secret},signal:AbortSignal.timeout(25000),redirect:'error',
   body:JSON.stringify({action:body.action,supportProjectRef:new URL(url).hostname.split('.')[0],organizationId:current.organizationId,actorId:current.actorId,
    ...(body.action!=='list'?{campusId:body.campusId}:{}),...(item?{kind:body.kind,item,revision:body.revision,fingerprint:body.fingerprint,operationId:body.operationId,confirmed:true}:{})})});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw failure(typeof data?.error==='string'?data.error:'教材・ごほうびの連携を確認してください。',[400,403,409,429].includes(response.status)?response.status:503);
  const latest=await context();
  if(latest.organizationId!==current.organizationId)throw failure('職員の所属が変更されました。',403);
  const result={...data,organizationId:current.organizationId,sourceProject};
  if(body.action==='list')parseContentCampuses(result);else parseCampusContent(result,body.campusId,current.organizationId);
  if(body.action==='save'&&(result.operationId!==body.operationId||result.revision!==body.revision+1))throw failure('保存結果を再取得してください。',503);
  return reply(result);
 }catch(error){const e=error as Error&{status?:number};return reply({error:e.status?e.message:'教材・ごほうびを取得・保存できませんでした。'},e.status||503);}
});
