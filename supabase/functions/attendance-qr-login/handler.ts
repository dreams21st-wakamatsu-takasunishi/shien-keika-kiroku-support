import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function qrLoginResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const failures: Record<string, string> = {
  STAFF_QR_INVALID: '本人用QRを確認できません。個人端末で新しい本人用QRを表示してください。',
  STAFF_QR_EXPIRED: 'QRの有効期限が切れています。個人端末でQRを更新してください。',
  STAFF_QR_SHARED_REQUIRED: '読み取りは承認済みの施設共用端末専用です。管理者に端末登録・承認を確認してください。',
  STAFF_QR_PERSONAL_REQUIRED: 'QRを表示した個人端末の登録・承認、所有職員を確認してください。',
  STAFF_QR_ACCOUNT_UNAVAILABLE: '職員情報を確認できません。利用状態とログインの紐づきを管理者に確認してください。',
  STAFF_QR_OUTSIDE_ACCESS_TIME: '現在は個人端末を利用できる時間外です。',
  STAFF_QR_ALREADY_USED: 'このQRは使用済みです。個人端末で新しいQRを表示してください。',
  STAFF_QR_RATE_LIMITED: '短時間にログインが繰り返されています。5分ほど待ってからお試しください。',
  ATTENDANCE_ALREADY_CLOCKED_IN: '本日はすでに出勤打刻されています。',
  ATTENDANCE_ALREADY_CLOCKED_OUT: '本日はすでに退勤打刻されています。',
  ATTENDANCE_NOT_CLOCKED_IN: '本日の出勤打刻がないため退勤できません。',
};

function authorizationFailure(message: string) {
  return qrLoginResponse({ error: failures[message] || 'QRを確認できませんでした。通信状況・サーバーの更新状況を管理者に確認してください。' },
    failures[message] ? (message === 'STAFF_QR_RATE_LIMITED' ? 429 : 403) : 503);
}

// Each request must receive fresh clients: verifyOtp mutates the login client's
// session, which must never leak into another request on a warm Edge instance.
export function createQrLoginHandler(service: SupabaseClient, login: SupabaseClient) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return qrLoginResponse({ error: 'Method not allowed' }, 405);
    try {
      if (Number(request.headers.get('content-length')) > 4096) return qrLoginResponse({ error: failures.STAFF_QR_INVALID }, 400);
      const raw = await request.text();
      if (raw.length > 4096) return qrLoginResponse({ error: failures.STAFF_QR_INVALID }, 400);
      let body: Record<string, unknown> | null;
      try { body = JSON.parse(raw); } catch { return qrLoginResponse({ error: failures.STAFF_QR_INVALID }, 400); }
      const qrToken = body?.qrToken;
      const deviceToken = body?.deviceToken;
      const action = body?.action;
      if (typeof qrToken !== 'string' || !/^[a-fA-F0-9]{64}$/.test(qrToken)
        || typeof deviceToken !== 'string' || !/^[a-fA-F0-9]{64}$/.test(deviceToken)
        || !['ログイン', '出勤', '退勤'].includes(String(action))) {
        return qrLoginResponse({ error: failures.STAFF_QR_INVALID }, 400);
      }
      // Identity/organization are intentionally NOT accepted from the browser.
      const { data: authorization, error: authorizationError } = await service.rpc('inspect_personal_staff_qr', {
        p_qr_token: qrToken, p_device_token: deviceToken,
      });
      if (authorizationError) return authorizationFailure(authorizationError.message);
      if (typeof authorization?.userId !== 'string' || typeof authorization?.deviceId !== 'string') {
        return qrLoginResponse({ error: failures.STAFF_QR_ACCOUNT_UNAVAILABLE }, 403);
      }

      const { data: userData, error: userError } = await service.auth.admin.getUserById(authorization.userId);
      const user = userData?.user;
      if (userError || !user?.email || !user.email_confirmed_at || user.is_anonymous || user.is_sso_user
        || user.id !== authorization.userId || user.deleted_at
        || (user.banned_until && Date.parse(user.banned_until) > Date.now())) {
        return qrLoginResponse({ error: failures.STAFF_QR_ACCOUNT_UNAVAILABLE }, 403);
      }
      if (user.user_metadata?.needs_password_setup) {
        return qrLoginResponse({ error: '初回のパスワード設定を完了してからQRログインをご利用ください。' }, 403);
      }
      if (action === 'ログイン') {
        const { data: factors, error: factorError } = await service.auth.admin.mfa.listFactors({ userId: user.id });
        if (factorError || !factors) return qrLoginResponse({ error: '認証設定を確認できませんでした。通常のログインをご利用ください。' }, 503);
        if (factors.factors.some((factor) => factor.status === 'verified')) {
          return qrLoginResponse({ error: '二段階認証が設定されています。通常のログインから本人確認を行ってください。' }, 403);
        }
      }

      const { data: consumed, error: consumeError } = await service.rpc('consume_personal_staff_qr', {
        p_qr_token: qrToken, p_device_token: deviceToken, p_action: action, p_expected_user_id: user.id,
      });
      if (consumeError) return authorizationFailure(consumeError.message);
      if (consumed?.userId !== user.id || consumed?.deviceId !== authorization.deviceId || consumed?.action !== action) {
        return qrLoginResponse({ error: failures.STAFF_QR_ACCOUNT_UNAVAILABLE }, 403);
      }
      // A punch never creates a session or changes the kiosk's logged-in user.
      if (action !== 'ログイン') return qrLoginResponse({ attendance: {
        displayName: consumed.displayName, action: consumed.action, scannedAt: consumed.scannedAt,
        clockInAt: consumed.clockInAt, clockOutAt: consumed.clockOutAt,
      } });

      // Server-only, one-time exchange. No email is sent; the magic-link token
      // is never placed in a URL, returned to the browser, or logged.
      const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: 'magiclink', email: user.email });
      if (linkError || link?.user?.id !== user.id || !link.properties?.hashed_token) {
        return qrLoginResponse({ error: 'ログイン情報を発行できませんでした。新しいQRコードで再試行してください。' }, 503);
      }
      const { data: verified, error: verifyError } = await login.auth.verifyOtp({
        token_hash: link.properties.hashed_token, type: 'email',
      });
      if (verifyError || !verified.session || verified.user?.id !== user.id || verified.session.user.id !== user.id) {
        return qrLoginResponse({ error: 'ログインできませんでした。新しいQRコードで再試行してください。' }, 503);
      }
      return qrLoginResponse({ session: {
        access_token: verified.session.access_token,
        refresh_token: verified.session.refresh_token,
      } });
    } catch {
      // Never include tokens, auth-user details or raw provider errors in logs.
      return qrLoginResponse({ error: '通信エラーが発生しました。打刻の場合は個人端末のQR画面で処理結果を確認し、不明な場合は勤務実績を確認してください。' }, 503);
    }
  };
}
