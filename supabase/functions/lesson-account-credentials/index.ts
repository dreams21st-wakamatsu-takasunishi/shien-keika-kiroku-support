import { createClient } from 'npm:@supabase/supabase-js@2';
import { credentialUuid, parseCredentialResult, type CredentialAction } from '../../../src/learning/accountCredentials.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-support-device-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const failure = (message: string, status: number) => Object.assign(Error(message), { status });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'POSTで送信してください。' }, 405);
  try {
    const authorization = request.headers.get('authorization') || '', url = Deno.env.get('SUPABASE_URL')!;
    if (!/^Bearer\s+\S+$/i.test(authorization)) throw failure('職員アカウントでログインしてください。', 401);
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization, 'x-support-device-token': request.headers.get('x-support-device-token') || '' } } });
    const { data: auth, error: authError } = await user.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (authError || !auth.user) throw failure('職員ログインを確認してください。', 401);
    const context = async () => {
      const { data, error } = await user.rpc('get_lesson_learning_context');
      if (error || !data || data.actorId !== auth.user!.id || typeof data.organizationId !== 'string' || data.canIssueAccounts !== true) throw failure('学習アカウント発行・再発行の専用権限と承認端末が必要です。', 403);
      return data as { actorId: string; organizationId: string };
    };
    const current = await context(), raw = await request.text();
    if (raw.length > 2048) throw failure('送信内容を確認してください。', 400);
    const body = JSON.parse(raw);
    if (!['operations', 'issue', 'reset'].includes(body.action) || typeof body.childId !== 'string' || !body.childId || body.childId.length > 160
      || (body.action !== 'operations' && (!credentialUuid(body.operationId) || body.confirmed !== true || !Number.isInteger(body.revision)))) throw failure('児童・操作・確認欄を確認してください。', 400);
    const sourceProject = Deno.env.get('D_LESSON_PROJECT_REF') || '', secret = Deno.env.get('D_LESSON_BRIDGE_SECRET') || '';
    if (!/^[a-z0-9]{20}$/.test(sourceProject) || secret.length < 32) throw failure('学習連携のサーバー設定を確認してください。', 503);
    const binding = async () => {
      const child = await user.from('children').select('id').eq('id', body.childId).eq('organization_id', current.organizationId).is('deleted_at', null).maybeSingle();
      const link = await user.from('lesson_child_links').select('*').eq('child_id', body.childId).eq('organization_id', current.organizationId).eq('active', true).maybeSingle();
      if (child.error || !child.data) throw failure('対象児童を確認してください。', 403);
      if (link.error || !link.data || link.data.source_project_ref !== sourceProject) throw failure('有効な学習連携がありません。', 409);
      return link.data;
    };
    const link = await binding();
    if (body.action === 'operations') {
      const { data, error } = await user.from('lesson_credential_operations').select('id,actor_id,action,status,at,finished_at').eq('organization_id', current.organizationId).eq('child_id', body.childId).eq('link_id', link.id).order('at', { ascending: false }).limit(20);
      if (error) throw failure('発行操作履歴を取得できませんでした。', 503);
      return reply({ operations: (data || []).map(row => ({ id: row.id, action: row.action, status: row.status, at: row.at, finishedAt: row.finished_at,
        canResume: row.actor_id === current.actorId && (row.status === 'requested' || (row.status === 'completed' && Date.parse(row.finished_at) > Date.now() - 86400000)) })) });
    }
    if (body.revision !== link.revision) throw failure('学習連携が変更されています。再取得してください。', 409);
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: reserveError } = await service.rpc('begin_lesson_credential_operation', { p_id: body.operationId, p_org: current.organizationId, p_actor: current.actorId, p_child: body.childId, p_link: link.id, p_revision: link.revision, p_action: body.action });
    if (reserveError) throw failure('発行権限・連携・未確定の操作を確認してください。', reserveError.code === '42501' ? 403 : reserveError.code === 'PT429' ? 429 : 409);
    const response = await fetch(`https://${sourceProject}.supabase.co/functions/v1/support-account-credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-lesson-bridge-key': secret }, redirect: 'error', signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ action: body.action, operationId: body.operationId, studentId: link.source_student_id, childId: link.child_id, linkId: link.id,
        supportProjectRef: new URL(url).hostname.split('.')[0], organizationId: current.organizationId, actorId: current.actorId }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      // Only a positively denied, pre-mutation receipt may release a pending support operation.
      if (payload?.operationId === body.operationId && payload.resumable === false) {
        const { error } = await service.from('lesson_credential_operations').update({ status: 'denied', finished_at: new Date().toISOString() }).eq('id', body.operationId).eq('status', 'requested');
        if (error) throw failure('操作履歴の保存結果を確認してください。', 503);
      }
      throw failure(typeof payload?.error === 'string' ? payload.error : '発行結果が未確定です。同じ操作を再確認してください。', [400, 403, 409, 423, 429].includes(response.status) ? response.status : 503);
    }
    const result = parseCredentialResult(payload, link, body.operationId, body.action as CredentialAction, false);
    const latest = await context(), stillLink = await binding();
    if (latest.organizationId !== current.organizationId || stillLink.id !== link.id || stillLink.revision !== link.revision) throw failure('職員・児童・連携が変更されています。発行結果は操作履歴で確認してください。', 409);
    const { error } = await service.from('lesson_credential_operations').update({ status: 'completed', finished_at: new Date().toISOString() }).eq('id', body.operationId).eq('organization_id', current.organizationId).eq('status', 'requested');
    if (error) throw failure('発行結果の操作履歴を保存できません。同じ操作を再確認してください。', 503);
    const checkedAt = new Date().toISOString();
    return reply({ ...result, passcode: undefined, card: { ...result.card, passcode: result.passcode }, checkedAt, expiresAt: new Date(Date.parse(checkedAt) + 600000).toISOString() });
  } catch (error) {
    const cause = error as { status?: number; message?: string };
    return reply({ error: cause.status ? cause.message : '発行結果が未確定です。同じ操作を再確認してください。' }, cause.status || 503);
  }
});
