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

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isWithinPersonalAccessTime(organization: {
  personal_access_time_enabled?: boolean;
  personal_access_start?: string;
  personal_access_end?: string;
  personal_access_days?: number[];
}) {
  if (!organization.personal_access_time_enabled) return true;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const weekday = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[value('weekday')];
  const current = `${value('hour')}:${value('minute')}`;
  const start = (organization.personal_access_start || '07:00').slice(0, 5);
  const end = (organization.personal_access_end || '22:00').slice(0, 5);
  const allowedDays = Array.isArray(organization.personal_access_days) ? organization.personal_access_days : [1, 2, 3, 4, 5, 6, 7];
  const withinClock = start <= end ? current >= start && current <= end : current >= start || current <= end;
  return allowedDays.includes(weekday) && withinClock;
}

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
    deviceToken?: string;
    deviceLabel?: string;
    platform?: string;
  } | null;
  const organizationCode = body?.organizationCode?.trim().toUpperCase() || '';
  const employeeCode = body?.employeeCode?.trim() || '';
  const password = body?.password || '';
  const deviceToken = body?.deviceToken || '';
  const deviceLabel = body?.deviceLabel?.trim().slice(0, 160) || '名称未設定の端末';
  const platform = body?.platform?.trim().slice(0, 500) || null;
  if (!/^[A-Z0-9]{8,16}$/.test(organizationCode)
      || !/^[A-Za-z0-9._-]{3,32}$/.test(employeeCode)
      || password.length < 10
      || !/^[A-Fa-f0-9]{64}$/.test(deviceToken)) {
    return genericLoginError();
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: organization } = await serviceClient
    .from('organizations')
    .select('id, device_approval_enabled, personal_access_time_enabled, personal_access_start, personal_access_end, personal_access_days, default_personal_field_mode')
    .ilike('staff_login_code', organizationCode)
    .maybeSingle();
  if (!organization) return genericLoginError();

  const { data: recorder } = await serviceClient
    .from('recorder_profiles')
    .select('id, auth_user_id')
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

  const tokenHash = await sha256Hex(deviceToken);
  const { data: existingDevice } = await serviceClient
    .from('staff_devices')
    .select('id, status, device_kind, field_mode_only')
    .eq('auth_user_id', recorder.auth_user_id)
    .eq('token_hash', tokenHash)
    .maybeSingle();

  let device = existingDevice;
  if (!device) {
    const initiallyApproved = organization.device_approval_enabled !== true;
    const { data: inserted, error: deviceError } = await serviceClient
      .from('staff_devices')
      .insert({
        organization_id: organization.id,
        recorder_profile_id: recorder.id,
        auth_user_id: recorder.auth_user_id,
        token_hash: tokenHash,
        label: deviceLabel,
        platform,
        device_kind: 'personal',
        status: initiallyApproved ? 'approved' : 'pending',
        field_mode_only: initiallyApproved ? false : organization.default_personal_field_mode !== false,
        approved_at: initiallyApproved ? new Date().toISOString() : null,
        last_seen_at: new Date().toISOString(),
      })
      .select('id, status, device_kind, field_mode_only')
      .single();
    if (deviceError || !inserted) {
      return jsonResponse({ error: '端末情報を登録できませんでした。管理者にお問い合わせください。' }, 500);
    }
    device = inserted;
  } else {
    await serviceClient
      .from('staff_devices')
      .update({ label: deviceLabel, platform, last_seen_at: new Date().toISOString() })
      .eq('id', device.id);
  }

  if (device.status === 'revoked') {
    return jsonResponse({ error: 'この端末の利用許可は取り消されています。', code: 'DEVICE_REVOKED' }, 403);
  }
  if (organization.device_approval_enabled && device.status !== 'approved') {
    return jsonResponse({ error: 'この端末は管理者または児発管の承認待ちです。承認後にもう一度ログインしてください。', code: 'DEVICE_PENDING' }, 403);
  }
  if (device.device_kind === 'personal' && !isWithinPersonalAccessTime(organization)) {
    return jsonResponse({ error: '現在は個人端末から利用できる時間外です。', code: 'OUTSIDE_ACCESS_TIME' }, 403);
  }

  return jsonResponse({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
    },
    device: {
      id: device.id,
      fieldModeOnly: device.field_mode_only,
      kind: device.device_kind,
    },
  });
});
