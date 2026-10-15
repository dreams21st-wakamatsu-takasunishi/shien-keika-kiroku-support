import {createClient} from 'npm:@supabase/supabase-js@2';
import {parseAuditCursor,parseAuditDetail,parseAuditFilters,parseAuditPage} from '../../../src/learning/taskBatchAudit.ts';
import {credentialUuid as uuid} from '../../../src/learning/accountCredentials.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type,x-support-device-token','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const failure=(message:string,status:number)=>Object.assign(new Error(message),{status});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return reply({error:'POSTで送信してください。'},405);
 try{
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer\s+\S+$/i.test(authorization))throw failure('職員アカウントでログインしてください。',401);
  const user=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false},global:{headers:{Authorization:authorization,'x-support-device-token':request.headers.get('x-support-device-token')||''}}});
  const {data:auth,error:authError}=await user.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
  if(authError||!auth.user)throw failure('ログインの有効期限を確認してください。',401);
  const context=async()=>{
   const {data,error}=await user.rpc('get_lesson_learning_context');
   const {data:allowed,error:permissionError}=await user.rpc('can_view_lesson_task_audit');
   if(error||permissionError||!data||data.actorId!==auth.user!.id||data.canManageLinks!==true||allowed!==true)throw failure('事業所の課題履歴は管理者のみ確認できます。',403);
   return data as {organizationId:string};
  };
  const initial=await context(),raw=await request.text();
  if(raw.length>4096)throw failure('履歴の条件が長すぎます。',400);
  let body,filters,cursor;
  try{
   body=JSON.parse(raw);
   if(!['list','detail'].includes(body?.action)||body.action==='detail'&&!uuid(body.operationId))throw Error();
   filters=parseAuditFilters(body.filters);cursor=parseAuditCursor(body.cursor);
  }catch{throw failure('履歴の条件を確認してください。',400);}
  const {data,error}=await user.rpc('read_lesson_task_audit',{p_action:body.action,p_id:body.action==='detail'?body.operationId:null,
   p_kind:filters.kind,p_state:filters.state,p_actor:filters.actorId,p_before:cursor?.createdAt||null,p_before_id:cursor?.operationId||null});
  if(error)throw failure(error.code==='42501'?'事業所の課題履歴を確認する権限がありません。':'履歴を取得できませんでした。条件と通信を確認してください。',error.code==='42501'?403:error.code==='22023'?400:503);
  const result=body.action==='detail'?parseAuditDetail(data,body.operationId,initial.organizationId):parseAuditPage(data,filters,cursor);
  if(result.organizationId!==initial.organizationId||(await context()).organizationId!==initial.organizationId)throw failure('職員の所属が変更されました。再取得してください。',403);
  return reply({schemaVersion:1,...result});
 }catch(error){const e=error as Error&{status?:number};return reply({error:e.status?e.message:'課題履歴の応答を確認できません。再取得してください。'},e.status||503);}
});
