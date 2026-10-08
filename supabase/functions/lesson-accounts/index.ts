import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseAccountCheck, parseAccountAudits } from '../../../src/learning/accounts.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-support-device-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const failure = (message: string, status: number) => Object.assign(Error(message), { status });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'POSTで送信してください。' }, 405);
  let auditId: string | null = null;
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const finish = async (outcome: string) => {
    if (!auditId) return;
    const { error } = await service.from('lesson_account_audit').update({ outcome, finished_at: new Date().toISOString() }).eq('id', auditId).eq('outcome', 'started');
    if (error) throw failure('監査記録を保存できませんでした。', 503);
  };
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) return reply({ error: '職員アカウントでログインしてください。' }, 401);
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: {
      Authorization: authorization, 'x-support-device-token': request.headers.get('x-support-device-token') || '' } } });
    const { data: auth, error: authError } = await user.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (authError || !auth.user) return reply({ error: 'ログインの有効期限を確認してください。' }, 401);
    const context = async () => {
      const { data, error } = await user.rpc('get_lesson_learning_context');
      if (error || !data || data.actorId !== auth.user!.id || typeof data.organizationId !== 'string' || data.canManageAccounts !== true)
        throw failure('学習アカウント管理の専用権限と承認端末が必要です。', 403);
      return data as { organizationId: string; actorId: string };
    };
    const current = await context();
    const raw = await request.text(); if (raw.length > 2048) return reply({ error: '送信内容を確認してください。' }, 400);
    const body = JSON.parse(raw);
    if (!['inspect', 'verify-card', 'audit'].includes(body.action) || typeof body.childId !== 'string' || !body.childId || body.childId.length > 160
      || (body.action === 'verify-card' && (body.confirmed !== true || typeof body.passcode !== 'string' || !/^\d{6,12}$/.test(body.passcode)))) return reply({ error: '児童と合言葉を確認してください。' }, 400);
    const sourceProject = Deno.env.get('D_LESSON_PROJECT_REF') || '', secret = Deno.env.get('D_LESSON_BRIDGE_SECRET') || '';
    if (!/^[a-z0-9]{20}$/.test(sourceProject) || secret.length < 32) throw failure('学習連携のサーバー設定を確認してください。', 503);
    const { data: child, error: childError } = await user.from('children').select('id').eq('id', body.childId).eq('organization_id', current.organizationId).is('deleted_at', null).maybeSingle();
    const { data: link, error: linkError } = await user.from('lesson_child_links').select('*').eq('child_id', body.childId).eq('organization_id', current.organizationId).eq('active', true).maybeSingle();
    if (childError || !child) throw failure('対象児童を確認してください。', 403);
    if (linkError || !link || link.source_project_ref !== sourceProject) throw failure('有効な学習連携がありません。', 409);
    if (body.action === 'audit') {
      const { data, error } = await user.from('lesson_account_audit').select('id,action,outcome,at').eq('organization_id', current.organizationId)
        .eq('child_id', body.childId).eq('link_id', link.id).order('at', { ascending: false }).limit(10);
      if (error) throw failure('操作履歴を取得できませんでした。', 503);
      return reply({ audits: parseAccountAudits(data) });
    }
    const { data: reserved, error: reserveError } = await service.rpc('begin_lesson_account_check', { p_org: current.organizationId, p_actor: current.actorId,
      p_child: body.childId, p_link: link.id, p_revision: link.revision, p_action: body.action });
    if (reserveError) throw failure('アカウント確認の権限・監査設定を確認してください。', reserveError.code === '42501' ? 403 : 409);
    auditId = reserved;
    const response = await fetch(`https://${sourceProject}.supabase.co/functions/v1/support-learning-accounts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-lesson-bridge-key': secret }, signal: AbortSignal.timeout(30000), redirect: 'error',
      body: JSON.stringify({ action: body.action, studentId: link.source_student_id, childId: link.child_id, linkId: link.id,
        supportProjectRef: new URL(url).hostname.split('.')[0], organizationId: current.organizationId, actorId: current.actorId,
        ...(body.action === 'verify-card' ? { passcode: body.passcode } : {}) }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      await finish([400, 403, 409, 429].includes(response.status) ? 'denied' : 'failed');
      throw failure(typeof payload?.error === 'string' ? payload.error : '学習側のアカウント確認に失敗しました。', [400, 403, 409, 429].includes(response.status) ? response.status : 503);
    }
    const result = parseAccountCheck(payload, link);
    if ((body.action === 'verify-card') !== Boolean(result.card)) throw failure('アカウントの確認結果を照合できません。', 503);
    const latest = await context();
    const { data: stillChild } = await user.from('children').select('id').eq('id', body.childId).eq('organization_id', current.organizationId).is('deleted_at', null).maybeSingle();
    const { data: stillLinked } = await user.from('lesson_child_links').select('id').eq('id', link.id).eq('organization_id', current.organizationId).eq('active', true).eq('revision', link.revision).maybeSingle();
    if (!stillChild || !stillLinked || latest.organizationId !== current.organizationId) throw failure('児童・職員・連携状態が変更されました。', 409);
    await finish(result.card ? 'verified' : 'checked');
    const checkedAt = new Date().toISOString();
    return reply({ ...result, checkedAt, expiresAt: result.card ? new Date(Date.parse(checkedAt) + 600000).toISOString() : null });
  } catch (error) {
    try { await finish('failed'); } catch { /* Do not log credential-bearing requests. */ }
    const cause = error as Error & { status?: number };
    return reply({ error: cause.status ? cause.message : 'アカウント確認に失敗しました。設定と通信を確認してください。' }, cause.status || 503);
  }
});
