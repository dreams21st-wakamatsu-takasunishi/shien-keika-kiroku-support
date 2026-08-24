import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration is incomplete' }, 500);
  }
  if (!authorization) return jsonResponse({ error: 'Unauthorized' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(accessToken);
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== 'string') {
    console.error('JWT verification failed', claimsError?.message);
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { data: caller } = await userClient
    .from('profiles')
    .select('organization_id, role')
    .eq('id', userId)
    .single();
  if (!caller || caller.role !== 'admin') {
    return jsonResponse({ error: '管理者権限が必要です。' }, 403);
  }

  const body = await request.json().catch(() => null) as {
    action?: 'update' | 'delete';
    userId?: string;
    displayName?: string;
    email?: string;
    role?: 'staff' | 'manager' | 'classroom_manager' | 'admin';
    recorderProfileId?: string | null;
  } | null;
  const action = body?.action;
  const targetUserId = body?.userId || '';
  if (!targetUserId || !['update', 'delete'].includes(action || '')) {
    return jsonResponse({ error: '操作内容が不正です。' }, 400);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: target } = await serviceClient
    .from('profiles')
    .select('id, organization_id, role, email, display_name, recorder_profile_id')
    .eq('id', targetUserId)
    .single();
  if (!target || target.organization_id !== caller.organization_id) {
    return jsonResponse({ error: '対象職員が見つかりません。' }, 404);
  }

  const ensureAnotherAdmin = async () => {
    const { count } = await serviceClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', caller.organization_id)
      .eq('role', 'admin')
      .eq('active', true)
      .neq('id', targetUserId);
    return (count || 0) > 0;
  };

  if (action === 'delete') {
    if (targetUserId === userId) {
      return jsonResponse({ error: '自分自身は削除できません。' }, 400);
    }
    if (target.role === 'admin' && !(await ensureAnotherAdmin())) {
      return jsonResponse({ error: '最後の管理者は削除できません。' }, 400);
    }
    // Staff-ID accounts may still be referenced by the recorder roster. Keep
    // the operational identity and historical records, but remove its login.
    const { error: unlinkError } = await serviceClient
      .from('recorder_profiles')
      .update({ auth_user_id: null, individual_login_enabled: false })
      .eq('organization_id', caller.organization_id)
      .eq('auth_user_id', targetUserId);
    if (unlinkError) return jsonResponse({ error: `職員IDとの紐づけを解除できませんでした: ${unlinkError.message}` }, 400);

    // Soft-delete authentication and archive the public profile instead of
    // deleting it. Historical attendance, transport and audit foreign keys
    // therefore stay valid, while the account immediately disappears from the
    // active login-member list and can no longer sign in.
    const { error: authDeleteError } = await serviceClient.auth.admin.deleteUser(targetUserId, true);
    if (authDeleteError) return jsonResponse({ error: `ログイン認証を削除できませんでした: ${authDeleteError.message}` }, 400);
    const { error: profileArchiveError } = await serviceClient
      .from('profiles')
      .update({ active: false, recorder_profile_id: null })
      .eq('id', targetUserId)
      .eq('organization_id', caller.organization_id);
    if (profileArchiveError) return jsonResponse({ error: `ログイン情報を利用停止へ変更できませんでした: ${profileArchiveError.message}` }, 409);
    return jsonResponse({ ok: true, archived: true });
  }

  const displayName = body?.displayName?.trim().slice(0, 100) || '';
  const email = body?.email?.trim().toLowerCase() || '';
  const role = body?.role;
  const recorderProfileId = typeof body?.recorderProfileId === 'string' && body.recorderProfileId
    ? body.recorderProfileId
    : null;
  if (!displayName || !email.includes('@') || !role || !['staff', 'manager', 'classroom_manager', 'admin'].includes(role)) {
    return jsonResponse({ error: '氏名、メールアドレス、権限を確認してください。' }, 400);
  }
  if (targetUserId === userId && role !== 'admin') {
    return jsonResponse({ error: '自分自身の管理者権限は変更できません。' }, 400);
  }
  if (target.role === 'admin' && role !== 'admin' && !(await ensureAnotherAdmin())) {
    return jsonResponse({ error: '最後の管理者の権限は変更できません。' }, 400);
  }

  if (recorderProfileId) {
    const [{ data: recorder }, { data: duplicateLink }] = await Promise.all([
      serviceClient
        .from('recorder_profiles')
        .select('id, active')
        .eq('organization_id', caller.organization_id)
        .eq('id', recorderProfileId)
        .maybeSingle(),
      serviceClient
        .from('profiles')
        .select('id, active')
        .eq('organization_id', caller.organization_id)
        .eq('recorder_profile_id', recorderProfileId)
        .neq('id', targetUserId)
        .maybeSingle(),
    ]);
    if (!recorder?.active) return jsonResponse({ error: '選択した記録者が見つからないか、名簿から外されています。' }, 400);
    // A recorder may already own a staff-ID login. Email login and staff-ID
    // login are two authentication entrances for the same operational person,
    // so that is not a conflict. Only another active email-login member is.
    if (duplicateLink?.active) return jsonResponse({ error: '選択した記録者は別の有効なログイン職員に紐づいています。' }, 409);
    if (duplicateLink && !duplicateLink.active) {
      const { error: unlinkInactiveError } = await serviceClient
        .from('profiles')
        .update({ recorder_profile_id: null })
        .eq('id', duplicateLink.id)
        .eq('organization_id', caller.organization_id);
      if (unlinkInactiveError) {
        return jsonResponse({ error: `利用停止済みログインの古い紐づけを解除できませんでした: ${unlinkInactiveError.message}` }, 400);
      }
    }
  }

  if (email !== target.email) {
    const { error: authError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
      email,
      email_confirm: true,
    });
    if (authError) return jsonResponse({ error: authError.message }, 400);
  }

  const { error: profileError } = await serviceClient
    .from('profiles')
    .update({ display_name: displayName, email, role, recorder_profile_id: recorderProfileId })
    .eq('id', targetUserId)
    .eq('organization_id', caller.organization_id);
  if (profileError) return jsonResponse({ error: profileError.message }, 400);

  return jsonResponse({ ok: true });
});
