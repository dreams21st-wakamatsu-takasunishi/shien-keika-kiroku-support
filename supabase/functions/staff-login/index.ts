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

const genericLoginError = () => jsonResponse({
  error: '事業所コード、職員ID、またはパスワードを確認してください。',
}, 401);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration is incomplete' }, 500);
  }

  const body = await request.json().catch(() => null) as {
    organizationCode?: string;
    employeeCode?: string;
    password?: string;
  } | null;
  const organizationCode = body?.organizationCode?.trim().toUpperCase() || '';
  const employeeCode = body?.employeeCode?.trim() || '';
  const password = body?.password || '';
  if (!/^[A-Z0-9]{8,16}$/.test(organizationCode)
      || !/^[A-Za-z0-9._-]{3,32}$/.test(employeeCode)
      || password.length < 10) {
    return genericLoginError();
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: organization } = await serviceClient
    .from('organizations')
    .select('id')
    .ilike('staff_login_code', organizationCode)
    .maybeSingle();
  if (!organization) return genericLoginError();

  const { data: recorder } = await serviceClient
    .from('recorder_profiles')
    .select('auth_user_id')
    .eq('organization_id', organization.id)
    .ilike('employee_code', employeeCode)
    .eq('active', true)
    .eq('individual_login_enabled', true)
    .maybeSingle();
  if (!recorder?.auth_user_id) return genericLoginError();

  const { data: authUser, error: authUserError } = await serviceClient.auth.admin.getUserById(recorder.auth_user_id);
  const email = authUser.user?.email;
  if (authUserError || !email) return genericLoginError();

  const loginClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await loginClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) return genericLoginError();

  return jsonResponse({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
    },
  });
});

