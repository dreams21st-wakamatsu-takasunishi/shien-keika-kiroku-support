import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const actionLabels: Record<string, string> = {
  departed: '出発しました',
  arrived: '乗降場所へ到着しました',
  boarded: '乗車を登録しました',
  dropped_off: '降車を登録しました',
  facility_arrived: '事業所へ到着しました',
  returned: '事業所へ帰着しました',
  delay: '遅延連絡があります',
  help_requested: '応援要請があります',
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
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || './';
  const authorization = request.headers.get('Authorization');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration is incomplete' }, 500);
  }
  if (!authorization) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => null) as { eventId?: string } | null;
  const eventId = body?.eventId?.trim();
  if (!eventId) return jsonResponse({ error: 'eventId is required' }, 400);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(accessToken);
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== 'string') return jsonResponse({ error: 'Unauthorized' }, 401);

  const { data: caller } = await userClient
    .from('profiles')
    .select('organization_id, role, active')
    .eq('id', userId)
    .single();
  if (!caller?.active || !['staff', 'manager', 'admin'].includes(caller.role)) {
    return jsonResponse({ error: 'An active staff account is required' }, 403);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: event } = await serviceClient
    .from('transport_stop_events')
    .select('id, transport_run_id, event_type, cancelled_at, notification_sent_at')
    .eq('organization_id', caller.organization_id)
    .eq('id', eventId)
    .maybeSingle();
  if (!event || event.cancelled_at) return jsonResponse({ error: 'Transport event was not found' }, 404);
  if (event.notification_sent_at) return jsonResponse({ ok: true, sent: 0, failed: 0, duplicate: true });

  const { data: run } = await serviceClient
    .from('transport_runs')
    .select('name')
    .eq('organization_id', caller.organization_id)
    .eq('id', event.transport_run_id)
    .maybeSingle();
  if (!run) return jsonResponse({ error: 'Transport run was not found' }, 404);

  // Realtime already updates open screens. Push is best effort for background
  // devices and deliberately excludes child names, addresses and notes.
  if (!vapidPublicKey || !vapidPrivateKey) {
    await serviceClient.from('transport_stop_events').update({ notification_sent_at: new Date().toISOString() }).eq('organization_id', caller.organization_id).eq('id', event.id);
    return jsonResponse({ ok: true, sent: 0, failed: 0, pushDisabled: true });
  }
  const { data: subscriptions, error: subscriptionsError } = await serviceClient
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('organization_id', caller.organization_id);
  if (subscriptionsError) return jsonResponse({ error: subscriptionsError.message }, 500);

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const urgent = event.event_type === 'help_requested';
  const payload = JSON.stringify({
    title: urgent ? '【応援要請】送迎状況' : '送迎状況が更新されました',
    body: `${run.name}：${actionLabels[event.event_type] || '運行状況が更新されました'}`,
    tag: `transport-${event.id}`,
    url: appUrl,
  });

  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];
  await Promise.all((subscriptions || []).map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
      }, payload, { TTL: urgent ? 60 * 30 : 60 * 10 });
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) expiredEndpoints.push(subscription.endpoint);
    }
  }));
  if (expiredEndpoints.length > 0) {
    await serviceClient.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
  }
  await serviceClient.from('transport_stop_events').update({ notification_sent_at: new Date().toISOString() }).eq('organization_id', caller.organization_id).eq('id', event.id);
  return jsonResponse({ ok: true, sent, failed });
});
