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
    role?: 'staff' | 'manager' | 'admin';
  } | null;
  const action = body?.action;
  const targetUserId = body?.userId || '';
  if (!targetUserId || !['update', 'delete'].includes(action || '')) {
    return jsonResponse({ error: '操作内容が不正です。' }, 400);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: target } = await serviceClient
    .from('profiles')
    .select('id, organization_id, role, email, display_name')
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
    const { error } = await serviceClient.auth.admin.deleteUser(targetUserId);
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ok: true });
  }

  const displayName = body?.displayName?.trim().slice(0, 100) || '';
  const email = body?.email?.trim().toLowerCase() || '';
  const role = body?.role;
  if (!displayName || !email.includes('@') || !role || !['staff', 'manager', 'admin'].includes(role)) {
    return jsonResponse({ error: '氏名、メールアドレス、権限を確認してください。' }, 400);
  }
  if (targetUserId === userId && role !== 'admin') {
    return jsonResponse({ error: '自分自身の管理者権限は変更できません。' }, 400);
  }
  if (target.role === 'admin' && role !== 'admin' && !(await ensureAnotherAdmin())) {
    return jsonResponse({ error: '最後の管理者の権限は変更できません。' }, 400);
  }

  if (email !== target.email) {
    const { error: authError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
      email,
      email_confirm: true,
    });
    if (authError) return jsonResponse({ error: authError.message }, 400);
  }

  const { error: profileError } = await userClient
    .from('profiles')
    .update({ display_name: displayName, email, role })
    .eq('id', targetUserId)
    .eq('organization_id', caller.organization_id);
  if (profileError) return jsonResponse({ error: profileError.message }, 400);

  return jsonResponse({ ok: true });
});
