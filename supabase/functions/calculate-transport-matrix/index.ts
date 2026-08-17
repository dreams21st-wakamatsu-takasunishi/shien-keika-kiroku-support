import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

type MatrixLocation = { id?: string; label?: string; address?: string };
type RequestBody = {
  locations?: MatrixLocation[];
  avoidTolls?: boolean;
  avoidHighways?: boolean;
};

type GoogleMatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  condition?: string;
  status?: { code?: number; message?: string };
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function text(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function parseDuration(value?: string) {
  const seconds = Number(value?.replace(/s$/, '') || 0);
  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ error: 'Server configuration is incomplete' }, 500);
  if (!authorization) return jsonResponse({ error: 'Unauthorized' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(accessToken);
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== 'string') return jsonResponse({ error: 'Unauthorized' }, 401);

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('organization_id, role, active')
    .eq('id', userId)
    .single();
  if (profileError || !profile?.active || !['manager', 'admin'].includes(profile.role)) {
    return jsonResponse({ error: 'Manager access required' }, 403);
  }

  const body = await request.json().catch(() => null) as RequestBody | null;
  const locations = (Array.isArray(body?.locations) ? body.locations : []).map((location) => ({
    id: text(location.id, 100),
    label: text(location.label, 100),
    address: text(location.address, 300),
  }));
  const invalid = locations.length < 2
    ? '事業所と送迎先を入力してください。'
    : locations.length > 25
      ? '費用とAPI上限の管理のため、1回に計算できる地点は事業所を含め25地点までです。'
      : locations.some((location) => !location.id || !location.address)
        ? '住所が未入力の地点があります。'
        : new Set(locations.map((location) => location.id)).size !== locations.length
          ? '地点IDが重複しています。'
          : '';
  if (invalid) return jsonResponse({ error: invalid }, 400);
  if (!googleMapsApiKey) return jsonResponse({ error: 'Google Maps API is not configured' }, 503);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const writeLog = async (entry: Record<string, unknown>) => {
    const { error } = await serviceClient.from('route_optimization_logs').insert({
      organization_id: profile.organization_id,
      actor_id: userId,
      transport_run_id: null,
      provider: 'google_route_matrix',
      stops_count: locations.length - 1,
      ...entry,
    });
    if (error) console.error('Route matrix log failed', error.message);
  };

  const routeModifiers = {
    avoidTolls: body?.avoidTolls === true,
    avoidHighways: body?.avoidHighways === true,
    avoidFerries: false,
  };
  const origins = locations.map((location) => ({
    waypoint: { address: location.address },
    routeModifiers,
  }));
  const destinations = locations.map((location) => ({
    waypoint: { address: location.address },
  }));
  const googleResponse = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleMapsApiKey,
      'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition,status',
    },
    body: JSON.stringify({
      origins,
      destinations,
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      languageCode: 'ja',
      units: 'METRIC',
    }),
  });

  if (!googleResponse.ok) {
    const googleError = await googleResponse.clone().json().catch(() => null) as {
      error?: { status?: string };
    } | null;
    const errorCode = googleResponse.status === 400
      ? 'GOOGLE_MATRIX_INVALID_REQUEST'
      : googleResponse.status === 403
      ? 'GOOGLE_API_FORBIDDEN'
      : googleResponse.status === 429
        ? 'GOOGLE_API_RATE_LIMIT'
        : googleResponse.status >= 500
          ? 'GOOGLE_API_UNAVAILABLE'
          : 'GOOGLE_MATRIX_UNAVAILABLE';
    console.error('Google route matrix failed', googleResponse.status, googleError?.error?.status || errorCode);
    await writeLog({ status: 'error', error_code: errorCode });
    return jsonResponse({
      error: errorCode === 'GOOGLE_MATRIX_INVALID_REQUEST'
        ? '道路時間の計算条件をGoogle Routes APIが受理できませんでした。送迎先住所と経路設定を確認してください。'
        : errorCode === 'GOOGLE_API_FORBIDDEN'
        ? 'Google Routes APIの有効化、課金設定、APIキー制限を確認してください。'
        : errorCode === 'GOOGLE_API_RATE_LIMIT'
          ? '経路APIの利用上限に達しました。時間を置いて再度お試しください。'
          : errorCode === 'GOOGLE_API_UNAVAILABLE'
            ? 'Google Routes APIへ一時的に接続できませんでした。時間を置いて再度お試しください。'
            : '道路所要時間を取得できませんでした。送迎先住所を確認してください。',
      code: errorCode,
    }, 502);
  }

  const googleElements = await googleResponse.json() as GoogleMatrixElement[];
  const entries = googleElements
    .filter((element) => Number.isInteger(element.originIndex) && Number.isInteger(element.destinationIndex))
    .map((element) => ({
      fromId: locations[element.originIndex!]?.id,
      toId: locations[element.destinationIndex!]?.id,
      distanceMeters: Math.max(0, Math.round(Number(element.distanceMeters) || 0)),
      durationSeconds: parseDuration(element.duration),
      reachable: element.condition === 'ROUTE_EXISTS' && !element.status?.code,
    }))
    .filter((entry) => entry.fromId && entry.toId);
  const unreachable = entries.filter((entry) => !entry.reachable).length;
  await writeLog({
    status: 'success',
    distance_meters: entries.reduce((sum, entry) => sum + entry.distanceMeters, 0),
    duration_seconds: entries.reduce((sum, entry) => sum + entry.durationSeconds, 0),
  });
  return jsonResponse({
    provider: 'google_route_matrix',
    locations,
    entries,
    warnings: unreachable > 0 ? [`${unreachable}区間の経路を特定できませんでした。住所を確認してください。`] : [],
  });
});
