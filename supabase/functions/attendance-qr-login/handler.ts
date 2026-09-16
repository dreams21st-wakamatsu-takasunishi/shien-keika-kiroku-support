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
  QR_LOGIN_INVALID: 'このQRコードは使用できません。玄関端末に表示中のQRコードを読み取ってください。',
  QR_LOGIN_EXPIRED: 'QRコードの有効期限が切れています。玄関端末の新しいQRコードを読み取ってください。',
  QR_LOGIN_DEVICE_REQUIRED: 'QRログインは承認済みの個人端末専用です。初回は職員ID・メールでログインし、端末の登録・承認を確認してください。',
  QR_LOGIN_ACCOUNT_UNAVAILABLE: 'この端末の職員情報を確認できません。職員の利用状態とログインの紐づきを管理者に確認してください。',
  QR_LOGIN_OUTSIDE_ACCESS_TIME: '現在は個人端末から利用できる時間外です。',
  QR_LOGIN_ALREADY_USED: 'このQRコードはこの端末のログインに使用済みです。玄関端末でQRが切り替わってから読み取るか、職員ID・メールでログインしてください。',
  QR_LOGIN_RATE_LIMITED: '短時間にログインが繰り返されています。5分ほど待ってから、もう一度お試しください。',
};

// Each request must receive fresh clients: verifyOtp mutates the login client's
// session, which must never leak into another request on a warm Edge instance.
export function createQrLoginHandler(service: SupabaseClient, login: SupabaseClient) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return qrLoginResponse({ error: 'Method not allowed' }, 405);
    try {
      if (Number(request.headers.get('content-length')) > 4096) return qrLoginResponse({ error: failures.QR_LOGIN_INVALID }, 400);
      const raw = await request.text();
      if (raw.length > 4096) return qrLoginResponse({ error: failures.QR_LOGIN_INVALID }, 400);
      let body: Record<string, unknown> | null;
      try { body = JSON.parse(raw); } catch { return qrLoginResponse({ error: failures.QR_LOGIN_INVALID }, 400); }
      const qrToken = body?.qrToken;
      const deviceToken = body?.deviceToken;
      if (typeof qrToken !== 'string' || !/^[a-fA-F0-9]{64}$/.test(qrToken)
        || typeof deviceToken !== 'string' || !/^[a-fA-F0-9]{64}$/.test(deviceToken)) {
        return qrLoginResponse({ error: failures.QR_LOGIN_INVALID }, 400);
      }
      // Identity/organization are intentionally NOT accepted from the browser.
      const { data: authorization, error: authorizationError } = await service.rpc('consume_attendance_qr_login', {
        p_qr_token: qrToken, p_device_token: deviceToken,
      });
      if (authorizationError) {
        const message = failures[authorizationError.message];
        return qrLoginResponse({ error: message || 'QRログインを確認できませんでした。職員ID・メールでログインし、管理者に連絡してください。' },
          message ? (authorizationError.message === 'QR_LOGIN_RATE_LIMITED' ? 429 : 403) : 503);
      }
      if (typeof authorization?.userId !== 'string' || typeof authorization?.deviceId !== 'string') {
        return qrLoginResponse({ error: failures.QR_LOGIN_ACCOUNT_UNAVAILABLE }, 403);
      }

      const { data: userData, error: userError } = await service.auth.admin.getUserById(authorization.userId);
      const user = userData?.user;
      if (userError || !user?.email || !user.email_confirmed_at || user.is_anonymous || user.is_sso_user
        || user.id !== authorization.userId || user.deleted_at
        || (user.banned_until && Date.parse(user.banned_until) > Date.now())) {
        return qrLoginResponse({ error: failures.QR_LOGIN_ACCOUNT_UNAVAILABLE }, 403);
      }
      if (user.user_metadata?.needs_password_setup) {
        return qrLoginResponse({ error: '初回のパスワード設定を完了してからQRログインをご利用ください。' }, 403);
      }
      const { data: factors, error: factorError } = await service.auth.admin.mfa.listFactors({ userId: user.id });
      if (factorError || !factors) return qrLoginResponse({ error: '認証設定を確認できませんでした。通常のログインをご利用ください。' }, 503);
      if (factors.factors.some((factor) => factor.status === 'verified')) {
        return qrLoginResponse({ error: '二段階認証が設定されています。通常のログインから本人確認を行ってください。' }, 403);
      }

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
      return qrLoginResponse({ error: 'QRログインで通信エラーが発生しました。職員ID・メールでログインするか、新しいQRコードで再試行してください。' }, 503);
    }
  };
}
