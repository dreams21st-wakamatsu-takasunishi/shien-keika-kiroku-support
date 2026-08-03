import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function localDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
}

function occursOn(event: { event_date: string; end_date?: string | null; recurrence: string }, date: string) {
  if (event.recurrence === 'なし') return event.end_date
    ? event.event_date <= date && event.end_date >= date
    : event.event_date === date;
  if (date < event.event_date || (event.end_date && date > event.end_date)) return false;
  if (event.recurrence === '毎日') return true;
  // Date-only values are compared in UTC so month boundaries do not shift.
  const start = new Date(`${event.event_date}T00:00:00Z`);
  const target = new Date(`${date}T00:00:00Z`);
  return event.recurrence === '毎週'
    ? start.getUTCDay() === target.getUTCDay()
    : start.getUTCDate() === target.getUTCDate();
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  return hour * 60 + minute;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = Deno.env.get('CALENDAR_REMINDER_CRON_SECRET');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || './';
  if (!supabaseUrl || !serviceRoleKey || !cronSecret || !vapidPublicKey || !vapidPrivateKey) {
    return jsonResponse({ error: 'Server configuration is incomplete' }, 500);
  }
  if (request.headers.get('x-cron-secret') !== cronSecret) return jsonResponse({ error: 'Unauthorized' }, 401);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const now = localDateParts();
  const nowMinutes = timeToMinutes(now.time);
  const { data: events, error: eventsError } = await serviceClient
    .from('calendar_events')
    .select('organization_id,id,title,event_type,event_date,end_date,start_time,location,note,recurrence')
    .eq('notification_enabled', true)
    .eq('all_day', false)
    .not('start_time', 'is', null)
    .lte('event_date', now.date)
    .or(`end_date.is.null,end_date.gte.${now.date}`)
    .limit(1000);
  if (eventsError) return jsonResponse({ error: eventsError.message }, 500);

  const dueEvents = (events || []).filter((event) => {
    if (!occursOn(event, now.date)) return false;
    const due = timeToMinutes(event.start_time);
    return due >= nowMinutes && due < nowMinutes + 6;
  });
  if (dueEvents.length === 0) return jsonResponse({ ok: true, due: 0, sent: 0, failed: 0 });

  const eventIds = dueEvents.map((event) => event.id);
  const { data: delivered } = await serviceClient
    .from('calendar_notification_deliveries')
    .select('calendar_event_id')
    .eq('occurrence_date', now.date)
    .in('calendar_event_id', eventIds);
  const deliveredIds = new Set((delivered || []).map((row) => row.calendar_event_id));
  const pendingEvents = dueEvents.filter((event) => !deliveredIds.has(event.id));
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  let sentTotal = 0;
  let failedTotal = 0;
  for (const event of pendingEvents) {
    const { data: subscriptions } = await serviceClient
      .from('push_subscriptions')
      .select('endpoint,p256dh,auth_key')
      .eq('organization_id', event.organization_id);
    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];
    const payload = JSON.stringify({
      title: `まもなく：${event.title}`,
      body: [event.start_time.slice(0, 5), event.location, event.note].filter(Boolean).join('・'),
      tag: `calendar-${event.id}-${now.date}`,
      url: appUrl,
    });
    await Promise.all((subscriptions || []).map(async (subscription) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
        }, payload, { TTL: 60 * 30 });
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = typeof error === 'object' && error && 'statusCode' in error
          ? Number((error as { statusCode?: number }).statusCode)
          : 0;
        if (statusCode === 404 || statusCode === 410) expiredEndpoints.push(subscription.endpoint);
      }
    }));
    if (expiredEndpoints.length > 0) await serviceClient.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
    await serviceClient.from('calendar_notification_deliveries').upsert({
      organization_id: event.organization_id,
      calendar_event_id: event.id,
      occurrence_date: now.date,
      sent_count: sent,
      failed_count: failed,
      sent_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,calendar_event_id,occurrence_date' });
    sentTotal += sent;
    failedTotal += failed;
  }

  return jsonResponse({ ok: true, due: pendingEvents.length, sent: sentTotal, failed: failedTotal });
});
