import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseMockExamProblem, parseMockExamCatalog } from '../../../src/learning/mockExamProblems.ts';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-support-device-token','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type':'application/json', 'Cache-Control':'no-store' } });
const fail = (message: string, status: number) => Object.assign(Error(message), {status});
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', {headers:cors});
  if (request.method !== 'POST') return reply({error:'POSTで送信してください。'},405);
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) throw fail('職員ログインが必要です。',401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization,'x-support-device-token':request.headers.get('x-support-device-token') || ''}}});
    const {data:auth,error} = await client.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
    if (error || !auth.user) throw fail('職員ログインを確認してください。',401);
    const context = async () => {
      const {data,error} = await client.rpc('get_lesson_content_context');
      if (error || data?.actorId !== auth.user!.id || data.canManageContent !== true || typeof data.organizationId !== 'string') throw fail('承認端末と教材管理の権限が必要です。',403);
      return data as {organizationId:string;actorId:string};
    };
    const actor = await context(), raw = await request.text();
    if (raw.length > 40000) throw fail('問題文が長すぎます。',400);
    let body; try {body = JSON.parse(raw);} catch {throw fail('送信内容を確認してください。',400);}
    if (!body || !['get','create','update','delete'].includes(body.action) || typeof body.campusId !== 'string' || !body.campusId || body.campusId.length > 80 || body.campusId === 'public') throw fail('校舎と操作を確認してください。',400);
    const mutation = body.action !== 'get';
    if (mutation && (body.confirmed !== true || !Number.isSafeInteger(body.revision) || body.revision < 0 || !/^[a-f0-9]{32}$/.test(body.fingerprint || '') || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.operationId || ''))) throw fail('配信内容を再確認してください。',400);
    let item;
    if (body.action === 'create' || body.action === 'update') {try {item = parseMockExamProblem(body.item);} catch {throw fail('回数・本文・利用許諾を確認してください。',400);}}
    if (body.action === 'delete' && !/^round-[1-9]\d{0,2}$/.test(body.id || '')) throw fail('削除する問題を確認してください。',400);
    const project = Deno.env.get('D_LESSON_PROJECT_REF') || '', secret = Deno.env.get('D_LESSON_BRIDGE_SECRET') || '';
    if (!/^[a-z0-9]{20}$/.test(project) || secret.length < 32) throw fail('学習連携のサーバー設定が未完了です。',503);
    if ((await context()).organizationId !== actor.organizationId) throw fail('職員の所属が変更されました。',403);
    const response = await fetch(`https://${project}.supabase.co/functions/v1/support-mock-exams`, {method:'POST',headers:{'Content-Type':'application/json','x-lesson-bridge-key':secret},signal:AbortSignal.timeout(25000),redirect:'error',body:JSON.stringify({action:body.action,campusId:body.campusId,supportProjectRef:new URL(url).hostname.split('.')[0],organizationId:actor.organizationId,actorId:actor.actorId,...(mutation?{revision:body.revision,fingerprint:body.fingerprint,operationId:body.operationId,confirmed:true}:{}),...(item?{item}:{}),...(body.action==='delete'?{id:body.id}:{})})});
    const result = await response.json().catch(() => null);
    if (!response.ok) throw fail(typeof result?.error === 'string' ? result.error : '問題文の連携を確認してください。',[400,403,409,429].includes(response.status)?response.status:503);
    if ((await context()).organizationId !== actor.organizationId) throw fail('職員の所属が変更されました。',403);
    const payload = {...result,organizationId:actor.organizationId,sourceProject:project};
    parseMockExamCatalog(payload,body.campusId,actor.organizationId);
    if (mutation && (payload.operationId !== body.operationId || payload.revision !== body.revision + 1)) throw fail('配信結果を再取得してください。',503);
    return reply(payload);
  } catch (error) {const e = error as Error & {status?:number}; return reply({error:e.status?e.message:'模擬試験の問題を取得・保存できませんでした。'},e.status || 503);}
});
