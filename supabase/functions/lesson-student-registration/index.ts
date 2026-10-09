import { createClient } from 'npm:@supabase/supabase-js@2';
import { credentialUuid, parseCredentialResult } from '../../../src/learning/accountCredentials.ts';
import { handoffReasons, parsePreparedRegistration, registrationFingerprint, registrationRecoveryAvailability } from '../../../src/learning/studentRegistration.ts';
import { isServiceDate } from '../../../src/learning/contracts.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-support-device-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const failure = (message: string, status: number) => Object.assign(Error(message), { status });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'POSTで送信してください。' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!, lease = crypto.randomUUID();
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  let operation: { id: string; phase: string; link_id: string; source_student_id: string; actor_id: string } | null = null;
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) throw failure('職員ログインが必要です。', 401);
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization, 'x-support-device-token': request.headers.get('x-support-device-token') || '' } } });
    const { data: auth, error: authError } = await user.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (authError || !auth.user) throw failure('職員ログインを確認してください。', 401);
    const context = async () => {
      const { data, error } = await user.rpc('get_lesson_learning_context');
      if (error || !data || data.actorId !== auth.user!.id || typeof data.organizationId !== 'string' || data.canManageLinks !== true || data.canIssueAccounts !== true)
        throw failure('学習連携管理とアカウント発行の両方の権限、承認端末が必要です。', 403);
      const profile = await user.from('profiles').select('role').eq('id', auth.user!.id).eq('organization_id', data.organizationId).eq('active', true).maybeSingle();
      if (profile.error || !profile.data) throw failure('職員権限を確認してください。', 403);
      return { ...data, isAdmin: profile.data.role === 'admin' } as { actorId: string; organizationId: string; isAdmin: boolean };
    };
    const current = await context(), raw = await request.text();
    if (raw.length > 2048) throw failure('送信内容を確認してください。', 400);
    const body = JSON.parse(raw);
    if (!['configuration', 'register', 'handoff'].includes(body.action) || typeof body.childId !== 'string' || !body.childId || body.childId.length > 160
      || (body.action !== 'configuration' && (!credentialUuid(body.operationId) || typeof body.campusId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.campusId) || body.confirmed !== true))
      || (body.action === 'handoff' && (!credentialUuid(body.requestId) || !Number.isSafeInteger(body.handoffRevision) || body.handoffRevision < 0 || !handoffReasons.includes(body.reason)))) throw failure('児童・校舎・確認欄を確認してください。', 400);
    const sourceProject = Deno.env.get('D_LESSON_PROJECT_REF') || '', secret = Deno.env.get('D_LESSON_BRIDGE_SECRET') || '';
    if (!/^[a-z0-9]{20}$/.test(sourceProject) || secret.length < 32) throw failure('学習連携のサーバー設定を確認してください。', 503);
    const readChild = async () => {
      const { data, error } = await user.from('children').select('id,name,birth_date').eq('id', body.childId).eq('organization_id', current.organizationId).is('deleted_at', null).maybeSingle();
      if (error || !data) throw failure('対象児童を確認してください。', 403); return data;
    };
    const child = await readChild(), name = String(child.name || '').trim(), birthDate = child.birth_date || '';
    const fingerprint = await registrationFingerprint(child.id, name, birthDate);
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const validBirth = isServiceDate(birthDate) && birthDate <= today;
    const bridge = async (endpoint: string, payload: Record<string, unknown>) => {
      const response = await fetch(`https://${sourceProject}.supabase.co/functions/v1/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-lesson-bridge-key': secret }, redirect: 'error', signal: AbortSignal.timeout(90000),
        // Source ledgers keep the original creator; the support ledger authorizes and audits the current executor.
        body: JSON.stringify({ ...payload, supportProjectRef: new URL(url).hostname.split('.')[0], organizationId: current.organizationId, actorId: operation?.actor_id || current.actorId }) });
      return { response, payload: await response.json().catch(() => null) };
    };
    if (body.action === 'configuration') {
      const result = await bridge('support-student-registration', { action: 'campuses' });
      if (!result.response.ok || !Array.isArray(result.payload?.campuses)) throw failure('登録できる校舎を確認できませんでした。', 503);
      const links = await user.from('lesson_child_links').select('id').eq('organization_id', current.organizationId).eq('child_id', child.id).limit(1);
      const rows = await user.from('lesson_student_registrations').select('id,actor_id,executor_id,handoff_revision,source_project_ref,source_campus_id,display_name,birth_date,phase,at,finished_at,lease_until').eq('organization_id', current.organizationId).eq('child_id', child.id).order('at', { ascending: false }).limit(20);
      if (links.error || rows.error) throw failure('登録履歴を取得できませんでした。', 503);
      const latestContext = await context(), latestChild = await readChild();
      if (latestContext.organizationId !== current.organizationId) throw failure('職員の事業所が変更されています。', 403);
      if (await registrationFingerprint(latestChild.id, String(latestChild.name).trim(), latestChild.birth_date || '') !== fingerprint) throw failure('名簿情報が変更されています。再取得してください。', 409);
      return reply({ sourceProject, fingerprint, name, birthDate, allowNew: links.data?.length === 0 && !rows.data?.some(row => row.phase !== 'denied') && validBirth, campuses: result.payload.campuses,
        operations: (rows.data || []).map(row => ({ id: row.id, campusId: row.source_campus_id, phase: row.phase, at: row.at, handoffRevision: row.handoff_revision,
          ...registrationRecoveryAvailability(row, current.actorId, latestContext.isAdmin, row.display_name === name && row.birth_date === birthDate && row.source_project_ref === sourceProject && result.payload.campuses.some((campus: { id: string }) => campus.id === row.source_campus_id)) })) });
    }
    if (body.fingerprint !== fingerprint || !validBirth) throw failure('氏名・生年月日が変更されたか未登録です。名簿を確認し、再取得してください。', 409);
    if (body.action === 'handoff') {
      if (!current.isAdmin) throw failure('同じ事業所の管理者だけが引き継げます。', 403);
      const campuses = await bridge('support-student-registration', { action: 'campuses' });
      if (!campuses.response.ok || !Array.isArray(campuses.payload?.campuses)) throw failure('校舎の連携許可を確認できません。', 503);
      if (!campuses.payload.campuses.some((campus: { id: string }) => campus.id === body.campusId)) throw failure('この校舎の連携許可を確認してください。', 403);
      await context();
      const handoff = await service.rpc('handoff_lesson_student_registration', { p: { operation: body.operationId, request: body.requestId, revision: body.handoffRevision, reason: body.reason,
        actor: current.actorId, org: current.organizationId, child: child.id, project: sourceProject, campus: body.campusId, name, birth: birthDate } });
      if (handoff.error) throw failure(handoff.error.code === '42501' ? '同じ事業所の管理者だけが引き継げます。' : handoff.error.code === 'PT423' ? '登録処理中です。しばらく待って再取得してください。' : '担当者・名簿・連携・登録段階が変更されています。再取得してください。', handoff.error.code === '42501' ? 403 : handoff.error.code === 'PT423' ? 423 : handoff.error.code === 'PT429' ? 429 : 409);
      await context();
      return reply({ schemaVersion: 1, childId: child.id, ...handoff.data });
    }
    const { data: reserved, error: reserveError } = await service.rpc('claim_lesson_student_registration', { p: { id: body.operationId, lease, actor: current.actorId, org: current.organizationId, child: child.id, project: sourceProject, campus: body.campusId, name, birth: birthDate } });
    if (reserveError) throw failure(reserveError.code === '42501' ? '登録権限を確認してください。' : reserveError.code === 'PT423' ? '同じ登録操作を処理中です。しばらく待って再確認してください。' : '過去の連携・未確定の登録操作・名簿情報を確認してください。', reserveError.code === '42501' ? 403 : reserveError.code === 'PT423' ? 423 : reserveError.code === 'PT429' ? 429 : 409);
    operation = reserved;
    if (!operation) throw failure('登録履歴の保存結果を確認してください。', 503);
    const guard = async () => {
      const latest = await context();
      if (latest.organizationId !== current.organizationId) throw failure('職員の事業所が変更されています。', 403);
      const asserted = await service.rpc('assert_lesson_registration_execution', { p_id: operation!.id, p_lease: lease, p_actor: current.actorId });
      if (asserted.error) throw failure('担当者・権限・児童・連携または処理期限が変更されています。再取得してください。', asserted.error.code === '42501' ? 403 : 409);
    };
    await guard();
    const prepared = await bridge('support-student-registration', { action: 'prepare', operationId: operation.id, linkId: operation.link_id, childId: child.id, campusId: body.campusId, displayName: name, birthDate });
    if (!prepared.response.ok) {
      if (operation.phase === 'requested' && prepared.payload?.operationId === operation.id && prepared.payload.resumable === false) {
        const saved = await service.from('lesson_student_registrations').update({ phase: 'denied', finished_at: new Date().toISOString() }).eq('id', operation.id).eq('lease_id', lease).eq('phase', 'requested').select('id').single();
        if (saved.error) throw failure('登録履歴の結果を確認してください。', 503); operation.phase = 'denied';
      }
      throw failure(typeof prepared.payload?.error === 'string' ? prepared.payload.error : '登録結果が未確定です。同じ操作を再確認してください。', [400, 403, 409, 422].includes(prepared.response.status) ? prepared.response.status : 503);
    }
    const source = parsePreparedRegistration(prepared.payload, { operationId: operation.id, childId: child.id, linkId: operation.link_id, studentId: operation.source_student_id, campusId: body.campusId, sourceProject, name, birthDate });
    if (operation.phase === 'requested') {
      const saved = await service.from('lesson_student_registrations').update({ phase: 'source-created' }).eq('id', operation.id).eq('lease_id', lease).eq('phase', 'requested').select('id').single();
      if (saved.error) throw failure('登録途中です。同じ操作を再確認してください。', 503); operation.phase = 'source-created';
    }
    await guard();
    const { data: link, error: linkError } = await service.rpc('link_registered_lesson_student', { p_id: operation.id, p_lease: lease, p_table: source.identity.dataTable });
    if (linkError || !link) throw failure('学習IDは確保済みです。連携・権限を確認し、同じ登録操作を再確認してください。', linkError?.code === '42501' ? 403 : 409);
    await guard();
    const issued = await bridge('support-account-credentials', { action: 'issue', operationId: operation.id, childId: child.id, linkId: link.id, studentId: link.source_student_id });
    if (!issued.response.ok) throw failure(typeof issued.payload?.error === 'string' ? issued.payload.error : '登録途中です。同じ操作を再確認してください。', [400, 403, 409, 423, 429].includes(issued.response.status) ? issued.response.status : 503);
    const credentials = parseCredentialResult(issued.payload, link, operation.id, 'issue', false);
    if (credentials.identity.displayName !== name || credentials.identity.birthDate !== birthDate) throw failure('登録後の本人情報が変更されています。確認してください。', 409);
    const latestContext = await context(), latestChild = await readChild();
    const latestLink = await user.from('lesson_child_links').select('id').eq('id', link.id).eq('active', true).eq('revision', 1).maybeSingle();
    if (latestContext.organizationId !== current.organizationId || await registrationFingerprint(latestChild.id, String(latestChild.name).trim(), latestChild.birth_date || '') !== fingerprint || latestLink.error || !latestLink.data) throw failure('児童・職員・連携状態が変更されています。登録結果は履歴で確認してください。', 409);
    const completed = await service.rpc('complete_lesson_student_registration', { p_id: operation.id, p_lease: lease, p_actor: current.actorId });
    if (completed.error) throw failure('担当者・権限・登録結果の保存を確認できません。同じ操作を再確認してください。', completed.error.code === '42501' ? 403 : 409);
    const checkedAt = new Date().toISOString();
    return reply({ link, credentials: { ...credentials, passcode: undefined, card: { ...credentials.card, passcode: credentials.passcode }, checkedAt, expiresAt: new Date(Date.parse(checkedAt) + 600000).toISOString() } });
  } catch (error) {
    if (operation) await service.from('lesson_student_registrations').update({ lease_id: null, lease_until: null }).eq('id', operation.id).eq('lease_id', lease);
    const cause = error as { status?: number; message?: string };
    return reply({ error: cause.status ? cause.message : '登録結果が未確定です。同じ登録操作を再確認してください。' }, cause.status || 503);
  }
});
