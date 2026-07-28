import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || './';
  const authorization = request.headers.get('Authorization');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration is incomplete' }, 500);
  }
  if (!vapidPublicKey || !vapidPrivateKey) {
    return jsonResponse({ error: 'VAPID keys are not configured' }, 503);
  }
  if (!authorization) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => null) as { announcementId?: string } | null;
  const announcementId = body?.announcementId?.trim();
  if (!announcementId) return jsonResponse({ error: 'announcementId is required' }, 400);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
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
    return jsonResponse({ error: 'Manager permission is required' }, 403);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: announcement, error: announcementError } = await serviceClient
    .from('announcements')
    .select('id, title, content, priority')
    .eq('organization_id', caller.organization_id)
    .eq('id', announcementId)
    .is('archived_at', null)
    .single();
  if (announcementError || !announcement) {
    return jsonResponse({ error: 'Announcement was not found' }, 404);
  }

  const { data: subscriptions, error: subscriptionsError } = await serviceClient
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('organization_id', caller.organization_id);
  if (subscriptionsError) return jsonResponse({ error: subscriptionsError.message }, 500);

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const payload = JSON.stringify({
    title: announcement.priority === 'urgent' ? `【緊急】${announcement.title}` : announcement.title,
    body: announcement.content,
    tag: `announcement-${announcement.id}`,
    url: appUrl,
  });

  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];
  await Promise.all((subscriptions || []).map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth_key,
        },
      }, payload, { TTL: 60 * 60 * 24 });
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) expiredEndpoints.push(subscription.endpoint);
      console.error('Push delivery failed', statusCode);
    }
  }));

  if (expiredEndpoints.length > 0) {
    await serviceClient.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
  }

  return jsonResponse({ ok: true, sent, failed });
});
