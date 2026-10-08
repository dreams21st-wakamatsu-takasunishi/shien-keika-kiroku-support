import { createClient } from 'npm:@supabase/supabase-js@2';
import { identityFingerprint, isServiceDate, isStudentId, parseHistory, parseIdentity } from '../../../src/learning/contracts.ts';
import {parseWordInbox} from '../../../src/learning/wordReviews.ts';
import {parseLearningTask,parseLearningTasks} from '../../../src/learning/tasks.ts';
import { parseLessonProgress } from '../../../src/learning/progress.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-support-device-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status,
  headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const failure = (message: string, status: number) => Object.assign(new Error(message), { status });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'POSTで送信してください。' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) return reply({ error: '職員アカウントでログインしてください。' }, 401);
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false }, global: { headers: { Authorization: authorization,
        'x-support-device-token': request.headers.get('x-support-device-token') || '' } },
    });
    const { data: auth, error: authError } = await user.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (authError || !auth.user) return reply({ error: 'ログインの有効期限を確認してください。' }, 401);
    const getContext = async () => {
      const { data, error } = await user.rpc('get_lesson_learning_context');
      if (error || !data || data.actorId !== auth.user!.id || typeof data.organizationId !== 'string') {
        throw failure(error?.code === '42501' ? 'この端末または権限では学習管理を利用できません。' : '学習連携のDB設定を確認してください。', error?.code === '42501' ? 403 : 503);
      }
      return data as { organizationId: string; actorId: string; actorName:string; canManageLinks: boolean;canReviewWord:boolean;canManageAccounts:boolean };
    };
    const context = await getContext();
    const raw = await request.text();
    if (raw.length > 4096) return reply({ error: '送信内容が長すぎます。' }, 400);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: '送信内容を確認してください。' }, 400); }
    const action = body?.action;
    if (!['list', 'inspect', 'link', 'disable', 'history','progress','word-inbox','word-artifact','word-decide','tasks-list','tasks-save'].includes(action)) return reply({ error: '操作内容を確認してください。' }, 400);
    const sourceProject = Deno.env.get('D_LESSON_PROJECT_REF') || '';
    const secret = Deno.env.get('D_LESSON_BRIDGE_SECRET') || '';
    const configured = /^[a-z0-9]{20}$/.test(sourceProject) && secret.length >= 32;
    const wordBridge=async(payload:Record<string,unknown>,endpoint='support-word-review')=>{
      if(!configured)throw failure('学習連携のサーバー設定が未完了です。',503);
      const result=await fetch(`https://${sourceProject}.supabase.co/functions/v1/${endpoint}`,{
        method:'POST',headers:{'Content-Type':'application/json','x-lesson-bridge-key':secret},
        body:JSON.stringify({...payload,supportProjectRef:new URL(url).hostname.split('.')[0],organizationId:context.organizationId,
          actorId:context.actorId,actorName:context.actorName}),signal:AbortSignal.timeout(25000),redirect:'error'});
      const data=await result.json().catch(()=>null);
      if(!result.ok)throw failure(typeof data?.error==='string'?data.error:'Word連携を確認できませんでした。',[400,403,409,410].includes(result.status)?result.status:503);
      return data;
    };
    if(action==='word-inbox'){
      const {data:links,error}=await user.from('lesson_child_links').select('*').eq('organization_id',context.organizationId).eq('active',true).eq('source_project_ref',sourceProject);
      if(error)throw failure('連携一覧を取得できませんでした。',503);
      const requests=[];
      for(let start=0;start<(links||[]).length;start+=100){
        const batch=links!.slice(start,start+100);
        requests.push(...parseWordInbox(await wordBridge({action:'inbox',links:batch.map(link=>({id:link.id,child_id:link.child_id,source_student_id:link.source_student_id}))}),batch));
      }
      await getContext();
      const {data:currentLinks,error:currentError}=await user.from('lesson_child_links').select('id,revision').eq('organization_id',context.organizationId).eq('active',true);
      if(currentError||!links?.every(link=>currentLinks?.some(current=>current.id===link.id&&current.revision===link.revision)))throw failure('連携状態が変更されました。更新してください。',409);
      return reply({requests,canReviewWord:context.canReviewWord===true});
    }
    if (action === 'list') {
      const { data, error } = await user.from('lesson_child_links').select('*').eq('organization_id', context.organizationId).eq('active', true);
      if (error) throw failure('連携一覧を取得できませんでした。', 503);
      return reply({ links: data || [], canManageLinks: context.canManageLinks === true, canManageAccounts: context.canManageAccounts === true, configured });
    }
    if (typeof body.childId !== 'string' || !body.childId || body.childId.length > 160) return reply({ error: '対象児童を選択してください。' }, 400);
    const { data: child, error: childError } = await user.from('children').select('id').eq('organization_id', context.organizationId)
      .eq('id', body.childId).is('deleted_at', null).maybeSingle();
    if (childError || !child) return reply({ error: '対象児童を確認できません。' }, 403);
    if (['inspect', 'link', 'disable'].includes(action) && context.canManageLinks !== true) return reply({ error: '学習連携の管理権限が必要です。' }, 403);
    const readSource = async (studentId: string, mode: 'inspect' | 'history' | 'progress', binding?: { childId: string; linkId: string }) => {
      if (!configured) throw failure('学習連携のサーバー設定が未完了です。', 503);
      const result = await fetch(`https://${sourceProject}.supabase.co/functions/v1/support-learning-read`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-lesson-bridge-key': secret },
        body: JSON.stringify({ action: mode, studentId, supportProjectRef: new URL(url).hostname.split('.')[0], organizationId: context.organizationId,
          ...(mode === 'history' ? { date: body.date } : {}), ...(mode === 'progress' ? binding : {}) }), signal: AbortSignal.timeout(15000), redirect: 'error',
      });
      const payload = await result.json().catch(() => null);
      if (!result.ok) throw failure(typeof payload?.error === 'string' ? payload.error : '学習側の連携設定を確認してください。', result.status === 403 ? 403 : 503);
      if (payload?.schemaVersion !== 1) throw failure('学習連携の形式を確認してください。', 503);
      return payload;
    };
    if (action === 'inspect' || action === 'link') {
      if (!isStudentId(body.studentId)) return reply({ error: 'Dレッスンの内部IDを確認してください。' }, 400);
      const payload = await readSource(body.studentId, 'inspect');
      const identity = parseIdentity(payload.identity, sourceProject);
      if (identity.studentId !== body.studentId) throw failure('取得した学習アカウントが一致しません。', 503);
      const fingerprint = await identityFingerprint(identity);
      if (action === 'inspect') return reply({ identity, fingerprint });
      if (body.confirmed !== true || body.fingerprint !== fingerprint) return reply({ error: '本人情報をもう一度確認してから連携してください。' }, 409);
      await getContext();
      const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
      const { data, error } = await service.rpc('mutate_verified_lesson_link', {
        p_actor: context.actorId, p_org: context.organizationId, p_child: body.childId, p_action: 'link', p_expected_revision: 0,
        p_source_project: identity.sourceProjectRef, p_source_table: identity.dataTable, p_source_student: identity.studentId,
        p_source_campus: identity.campusId, p_source_name: identity.displayName,
      });
      if (error) throw failure(error.code === '23505' ? 'この児童または学習アカウントは既に連携されています。更新して確認してください。' : error.message, error.code === '42501' ? 403 : 409);
      try{await wordBridge({action:'bind',studentId:identity.studentId,linkId:data.id,childId:body.childId});}
      catch(error){
        await service.rpc('mutate_verified_lesson_link',{p_actor:context.actorId,p_org:context.organizationId,p_child:body.childId,p_action:'disable',p_expected_revision:data.revision});
        throw error;
      }
      return reply({ link: data });
    }
    const { data: link, error: linkError } = await user.from('lesson_child_links').select('*').eq('organization_id', context.organizationId)
      .eq('child_id', body.childId).eq('active', true).maybeSingle();
    if (linkError || !link) return reply({ error: '有効な学習連携がありません。更新して確認してください。' }, 409);
    if (action === 'progress') {
      if (link.source_project_ref !== sourceProject) return reply({ error: '学習連携先を確認してください。' }, 409);
      const progress = parseLessonProgress(await readSource(link.source_student_id, 'progress', { childId: link.child_id, linkId: link.id }), link);
      const current = await getContext();
      if (current.organizationId !== context.organizationId || current.actorId !== context.actorId) return reply({ error: '職員の所属が変更されました。再取得してください。' }, 409);
      const { data: stillLinked, error: stillError } = await user.from('lesson_child_links').select('id')
        .eq('organization_id', context.organizationId).eq('child_id', body.childId).eq('id', link.id).eq('active', true).eq('revision', link.revision).maybeSingle();
      const { data: stillChild, error: stillChildError } = await user.from('children').select('id')
        .eq('organization_id', context.organizationId).eq('id', body.childId).is('deleted_at', null).maybeSingle();
      if (stillError || !stillLinked || stillChildError || !stillChild) return reply({ error: '児童または連携状態が変更されました。更新してください。' }, 409);
      return reply({ ...progress, fetchedAt: new Date().toISOString() });
    }
    if(action==='tasks-list'||action==='tasks-save'){
      const current=await getContext();
      if(action==='tasks-save'&&current.canManageLinks!==true)return reply({error:'課題の指定には学習連携の管理権限が必要です。'},403);
      if(link.source_project_ref!==sourceProject)return reply({error:'学習連携先を確認してください。'},409);
      const payload=await wordBridge({action:action==='tasks-list'?'list':'save',studentId:link.source_student_id,linkId:link.id,childId:link.child_id,...(action==='tasks-save'?{task:body.task}:{})},'support-learning-tasks');
      await getContext();
      const {data:stillLinked,error:stillError}=await user.from('lesson_child_links').select('id').eq('id',link.id).eq('active',true).eq('revision',link.revision).maybeSingle();
      if(stillError||!stillLinked)throw failure('連携状態が変更されました。更新してください。',409);
      return reply(action==='tasks-list'?{schemaVersion:1,tasks:parseLearningTasks(payload)}:{schemaVersion:1,task:parseLearningTask(payload?.task)});
    }
    if(action==='word-artifact'||action==='word-decide'){
      if(typeof body.requestId!=='string'||! /^[0-9a-f-]{36}$/i.test(body.requestId))return reply({error:'申請を選択してください。'},400);
      if(action==='word-decide'&&context.canReviewWord!==true)return reply({error:'Word作品の確認・承認権限が必要です。'},403);
      if(link.source_project_ref!==sourceProject)return reply({error:'連携先を確認してください。'},409);
      const latest=await getContext();
      if(action==='word-decide'&&latest.canReviewWord!==true)return reply({error:'Word作品の確認・承認権限が必要です。'},403);
      const result=await wordBridge({action:action==='word-artifact'?'artifact':'decide',requestId:body.requestId,linkId:link.id,childId:body.childId,
        ...(action==='word-decide'?{revision:body.revision,decision:body.decision,reason:body.reason,reviewed:body.reviewed,fileHash:body.fileHash}:{})});
      if(action==='word-artifact'){
        const signed=new URL(result.url);
        if(signed.protocol!=='https:'||signed.hostname!==`${sourceProject}.supabase.co`||!signed.pathname.startsWith('/storage/v1/object/sign/lesson-word-work/')
          ||result.requestId!==body.requestId||! /^[a-f0-9]{64}$/.test(result.fileHash||''))throw failure('作品の取得結果を確認できません。',503);
      }else{
        const validated=parseWordInbox({requests:[result.request]},[link]);
        if(validated[0].id!==body.requestId)throw failure('確認結果を照合できませんでした。更新してください。',503);
      }
      const {data:stillLinked}=await user.from('lesson_child_links').select('id').eq('id',link.id).eq('active',true).eq('revision',link.revision).maybeSingle();
      if(!stillLinked)throw failure('連携状態が変更されました。更新してください。',409);
      return reply(result);
    }
    if (action === 'disable') {
      if (body.revision !== link.revision) return reply({ error: '連携状態が変更されています。更新してください。' }, 409);
      if((await getContext()).canManageLinks!==true)return reply({error:'児童連携の管理権限が必要です。'},403);
      await wordBridge({action:'unbind',studentId:link.source_student_id,linkId:link.id,childId:body.childId});
      const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
      const { data, error } = await service.rpc('mutate_verified_lesson_link', {
        p_actor: context.actorId, p_org: context.organizationId, p_child: body.childId, p_action: 'disable', p_expected_revision: link.revision,
      });
      if (error) throw failure(error.message, error.code === '42501' ? 403 : 409);
      return reply({ link: data });
    }
    if (!isServiceDate(body.date)) return reply({ error: '日付を確認してください。' }, 400);
    if (link.source_project_ref !== sourceProject) return reply({ error: '連携先プロジェクトの変更を確認してください。' }, 409);
    const history = parseHistory(await readSource(link.source_student_id, 'history'), link, body.date);
    await getContext();
    const { data: stillActive } = await user.from('lesson_child_links').select('id').eq('id', link.id).eq('active', true).eq('revision', link.revision).maybeSingle();
    if (!stillActive) return reply({ error: '連携状態が変更されました。更新してください。' }, 409);
    return reply({ ...history, fetchedAt: new Date().toISOString() });
  } catch (error) {
    const failure = error as Error & { status?: number };
    return reply({ error: failure.status ? failure.message : '学習連携を完了できませんでした。通信と設定を確認してください。' }, failure.status || 503);
  }
});
