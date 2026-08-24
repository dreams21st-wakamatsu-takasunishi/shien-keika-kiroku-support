import { createClient } from 'npm:@supabase/supabase-js@2';

type IndividualLoginRole = 'staff' | 'manager' | 'classroom_manager';

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
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(accessToken);
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== 'string') return jsonResponse({ error: 'Unauthorized' }, 401);

  const { data: caller } = await userClient
    .from('profiles')
    .select('organization_id, role')
    .eq('id', userId)
    .single();
  if (!caller || !['manager', 'admin'].includes(caller.role)) {
    return jsonResponse({ error: '管理者または児発管の権限が必要です。' }, 403);
  }

  const body = await request.json().catch(() => null) as {
    action?: 'configure' | 'disable';
    recorderProfileId?: string;
    employeeCode?: string;
    password?: string;
    loginRole?: IndividualLoginRole;
  } | null;
  const action = body?.action;
  const recorderProfileId = body?.recorderProfileId || '';
  const employeeCode = body?.employeeCode?.trim() || '';
  const password = body?.password || '';
  if (!recorderProfileId || !['configure', 'disable'].includes(action || '')) {
    return jsonResponse({ error: '操作内容が不正です。' }, 400);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: recorder } = await serviceClient
    .from('recorder_profiles')
    .select('id, organization_id, display_name, employee_code, auth_user_id, active, individual_login_enabled, individual_login_role')
    .eq('id', recorderProfileId)
    .eq('organization_id', caller.organization_id)
    .maybeSingle();
  if (!recorder || !recorder.active) return jsonResponse({ error: '対象の記録者が見つかりません。' }, 404);

  const loginRole = (body?.loginRole || recorder.individual_login_role || 'staff') as IndividualLoginRole;
  if (!['staff', 'manager', 'classroom_manager'].includes(loginRole)) {
    return jsonResponse({ error: 'ログイン権限の指定が不正です。' }, 400);
  }
  if (loginRole !== 'staff' && caller.role !== 'admin') {
    return jsonResponse({ error: '児発管・教室長権限の設定は管理者のみ行えます。' }, 403);
  }

  if (action === 'disable') {
    if (recorder.auth_user_id) {
      // Removing the internal auth user also removes its profile. Existing JWTs
      // immediately lose organization access because current_organization_id()
      // can no longer resolve an active profile.
      const { error: disableError } = await serviceClient.auth.admin.deleteUser(recorder.auth_user_id);
      if (disableError) return jsonResponse({ error: disableError.message }, 400);
    }
    const { error: recorderError } = await serviceClient
      .from('recorder_profiles')
      .update({ individual_login_enabled: false })
      .eq('id', recorder.id)
      .eq('organization_id', caller.organization_id);
    if (recorderError) return jsonResponse({ error: recorderError.message }, 400);
    return jsonResponse({ ok: true });
  }

  if (!/^[A-Za-z0-9._-]{3,32}$/.test(employeeCode)) {
    return jsonResponse({ error: '職員IDは半角英数字・ピリオド・ハイフン・下線の3～32文字で入力してください。' }, 400);
  }
  if (password.length < 10 || password.length > 72) {
    return jsonResponse({ error: 'パスワードは10～72文字で入力してください。' }, 400);
  }

  const { data: duplicate } = await serviceClient
    .from('recorder_profiles')
    .select('id')
    .eq('organization_id', caller.organization_id)
    .ilike('employee_code', employeeCode)
    .neq('id', recorder.id)
    .maybeSingle();
  if (duplicate) return jsonResponse({ error: '同じ職員IDがすでに使用されています。' }, 409);

  let authUserId = recorder.auth_user_id as string | null;
  let createdNewUser = false;
  if (authUserId) {
    const { data: existingProfile } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', authUserId)
      .eq('organization_id', caller.organization_id)
      .maybeSingle();
    if (existingProfile?.role === 'admin') {
      return jsonResponse({ error: '管理者ログインの権限は職員ID設定から変更できません。' }, 400);
    }
    const { error: updateAuthError } = await serviceClient.auth.admin.updateUserById(authUserId, {
      password,
      ban_duration: 'none',
      user_metadata: {
        display_name: recorder.display_name,
        login_method: 'staff_id',
        needs_password_setup: false,
      },
    });
    if (updateAuthError) return jsonResponse({ error: updateAuthError.message }, 400);
  } else {
    const internalEmail = `staff-${crypto.randomUUID()}@staff-login.invalid`;
    const { data: invitation, error: invitationError } = await serviceClient
      .from('member_invitations')
      .insert({
        organization_id: caller.organization_id,
        email: internalEmail,
        role: loginRole,
        invited_by: userId,
      })
      .select('id')
      .single();
    if (invitationError) return jsonResponse({ error: invitationError.message }, 409);

    const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: recorder.display_name,
        login_method: 'staff_id',
        needs_password_setup: false,
      },
    });
    if (createError || !created.user) {
      await serviceClient.from('member_invitations').delete().eq('id', invitation.id);
      return jsonResponse({ error: createError?.message || '職員ログインを作成できませんでした。' }, 400);
    }
    authUserId = created.user.id;
    createdNewUser = true;
  }

  const { error: recorderError } = await serviceClient
    .from('recorder_profiles')
    .update({
      employee_code: employeeCode,
      auth_user_id: authUserId,
      individual_login_enabled: true,
      individual_login_role: loginRole,
    })
    .eq('id', recorder.id)
    .eq('organization_id', caller.organization_id);
  if (recorderError) {
    if (createdNewUser && authUserId) await serviceClient.auth.admin.deleteUser(authUserId);
    return jsonResponse({ error: recorderError.message }, 400);
  }

  const { error: profileError } = await serviceClient
    .from('profiles')
    .update({
      active: true,
      display_name: recorder.display_name,
      email: null,
      role: loginRole,
      recorder_profile_id: null,
    })
    .eq('id', authUserId)
    .eq('organization_id', caller.organization_id);
  if (profileError) {
    await serviceClient
      .from('recorder_profiles')
      .update({
        employee_code: recorder.employee_code,
        auth_user_id: createdNewUser ? null : recorder.auth_user_id,
        individual_login_enabled: createdNewUser ? false : recorder.individual_login_enabled,
        individual_login_role: recorder.individual_login_role || 'staff',
      })
      .eq('id', recorder.id)
      .eq('organization_id', caller.organization_id);
    if (createdNewUser && authUserId) await serviceClient.auth.admin.deleteUser(authUserId);
    return jsonResponse({ error: `ログイン権限を保存できませんでした: ${profileError.message}` }, 400);
  }

  const { data: organization } = await serviceClient
    .from('organizations')
    .select('staff_login_code')
    .eq('id', caller.organization_id)
    .single();

  return jsonResponse({
    ok: true,
    organizationCode: organization?.staff_login_code,
    employeeCode,
    loginRole,
  });
});
