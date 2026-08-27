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

type RequestedStop = { id?: string; label?: string; location?: string };
type RequestBody = {
  transportRunId?: string;
  serviceDate?: string;
  departureTime?: string;
  origin?: string;
  destination?: string;
  stops?: RequestedStop[];
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  preserveOrder?: boolean;
};

type GoogleLeg = { distanceMeters?: number; duration?: string };
type GoogleRoute = {
  optimizedIntermediateWaypointIndex?: number[];
  distanceMeters?: number;
  duration?: string;
  legs?: GoogleLeg[];
  polyline?: { encodedPolyline?: string };
};

type GoogleErrorPayload = {
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
};

function parseDuration(value?: string) {
  const seconds = Number(value?.replace(/s$/, '') || 0);
  return Number.isFinite(seconds) ? Math.round(seconds) : 0;
}

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function googleWaypoint(value: string) {
  const coordinate = value.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (coordinate) {
    const latitude = Number(coordinate[1]);
    const longitude = Number(coordinate[2]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90
      && longitude >= -180 && longitude <= 180) {
      return { location: { latLng: { latitude, longitude } } };
    }
  }
  return { address: value };
}

async function requestGoogleRoutes(apiKey: string, body: Record<string, unknown>) {
  let lastResponse: Response | null = null;
  let lastNetworkError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': [
            'routes.optimizedIntermediateWaypointIndex',
            'routes.distanceMeters',
            'routes.duration',
            'routes.legs.distanceMeters',
            'routes.legs.duration',
            'routes.polyline.encodedPolyline',
          ].join(','),
        },
        body: JSON.stringify(body),
      });
      lastResponse = response;
      if (response.status < 500 || attempt === 1) return response;
    } catch (error) {
      lastNetworkError = error;
      if (attempt === 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (lastResponse) return lastResponse;
  throw lastNetworkError || new Error('Google Routes API request failed');
}

async function readGooglePayload(response: Response) {
  const text = await response.text();
  if (!text) return { payload: null, text: '' };
  try {
    return { payload: JSON.parse(text) as GoogleErrorPayload & { routes?: GoogleRoute[] }, text };
  } catch {
    return { payload: null, text };
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
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
  const origin = normalizeText(body?.origin, 300);
  const destination = normalizeText(body?.destination, 300);
  const transportRunId = normalizeText(body?.transportRunId, 100);
  const serviceDate = normalizeText(body?.serviceDate, 10);
  const departureTime = normalizeText(body?.departureTime, 5);
  const stops = (Array.isArray(body?.stops) ? body.stops : []).map((stop) => ({
    id: normalizeText(stop.id, 100),
    label: normalizeText(stop.label, 100),
    location: normalizeText(stop.location, 300),
  }));
  const preserveOrder = body?.preserveOrder === true;
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const writeUsageLog = async (entry: Record<string, unknown>) => {
    const { error } = await serviceClient.from('route_optimization_logs').insert(entry);
    if (error) console.error('Route optimization log failed', error.message);
  };
  const baseLog = {
    organization_id: profile.organization_id,
    actor_id: userId,
    transport_run_id: transportRunId || null,
    provider: 'google_routes',
    stops_count: stops.length,
  };

  const validationError = !origin || !destination
    ? '出発地点と終着地点を入力してください。'
    : stops.length === 0
      ? '乗降場所を1件以上登録してください。'
      : stops.length > 10
        ? '費用管理のため、1便あたりの時間計算は10地点までです。'
        : stops.some((stop) => !stop.id || !stop.location)
          ? '乗降場所が未入力の地点があります。'
          : new Set(stops.map((stop) => stop.id)).size !== stops.length
            ? '乗降地点IDが重複しています。'
            : '';
  if (validationError) return jsonResponse({ error: validationError }, 400);
  if (!googleMapsApiKey) return jsonResponse({ error: 'Google Maps API is not configured' }, 503);

  const requestedDeparture = new Date(`${serviceDate}T${departureTime}:00+09:00`);
  const validRequestedDeparture = Number.isFinite(requestedDeparture.getTime());
  const effectiveDeparture = validRequestedDeparture ? new Date(requestedDeparture) : null;
  let shiftedToComparableFuture = false;
  // Google Routes does not provide historical traffic. When a past service
  // date is recalculated, use the next same weekday/time so the estimate still
  // reflects the requested departure time band instead of dropping traffic.
  if (effectiveDeparture) {
    const minimumDeparture = Date.now() + 5 * 60 * 1000;
    while (effectiveDeparture.getTime() <= minimumDeparture) {
      effectiveDeparture.setDate(effectiveDeparture.getDate() + 7);
      shiftedToComparableFuture = true;
    }
  }
  const useTraffic = Boolean(effectiveDeparture);
  const googleBody: Record<string, unknown> = {
    origin: googleWaypoint(origin),
    destination: googleWaypoint(destination),
    intermediates: stops.map((stop) => googleWaypoint(stop.location)),
    travelMode: 'DRIVE',
    optimizeWaypointOrder: !preserveOrder,
    languageCode: 'ja',
    units: 'METRIC',
    routeModifiers: {
      avoidTolls: body?.avoidTolls === true,
      avoidHighways: body?.avoidHighways === true,
      avoidFerries: false,
    },
  };
  if (useTraffic) {
    googleBody.routingPreference = 'TRAFFIC_AWARE';
    googleBody.departureTime = effectiveDeparture!.toISOString();
  }

  let googleResponse: Response;
  let trafficApplied = useTraffic;
  let trafficFallback = false;
  try {
    googleResponse = await requestGoogleRoutes(googleMapsApiKey, googleBody);
  } catch (error) {
    console.error('Google Routes API network failure', error instanceof Error ? error.message : 'unknown');
    await writeUsageLog({ ...baseLog, status: 'error', error_code: 'GOOGLE_API_UNAVAILABLE' });
    return jsonResponse({
      error: '経路APIへ接続できませんでした。通信状況を確認し、時間を置いて再度お試しください。',
      code: 'GOOGLE_API_UNAVAILABLE',
    }, 503);
  }

  // Google may reject a traffic-aware request for a particular departure
  // time even though the same route can be calculated normally. Preserve the
  // manually arranged stop order and fall back once instead of failing the
  // whole dispatch board with a generic 502.
  if (!googleResponse.ok && useTraffic && [400, 422].includes(googleResponse.status)) {
    const firstFailure = await readGooglePayload(googleResponse);
    console.warn(
      'Traffic-aware route rejected; retrying without traffic',
      googleResponse.status,
      firstFailure.payload?.error?.status || 'GOOGLE_ROUTE_INVALID',
    );
    const fallbackBody = { ...googleBody };
    delete fallbackBody.routingPreference;
    delete fallbackBody.departureTime;
    try {
      googleResponse = await requestGoogleRoutes(googleMapsApiKey, fallbackBody);
      if (googleResponse.ok) {
        trafficApplied = false;
        trafficFallback = true;
      }
    } catch (error) {
      console.error('Google Routes fallback network failure', error instanceof Error ? error.message : 'unknown');
      await writeUsageLog({ ...baseLog, status: 'error', error_code: 'GOOGLE_API_UNAVAILABLE' });
      return jsonResponse({
        error: '経路APIへ接続できませんでした。通信状況を確認し、時間を置いて再度お試しください。',
        code: 'GOOGLE_API_UNAVAILABLE',
      }, 503);
    }
  }

  if (!googleResponse.ok) {
    const googleFailure = await readGooglePayload(googleResponse);
    const errorCode = googleResponse.status === 403
      ? 'GOOGLE_API_FORBIDDEN'
      : googleResponse.status === 429
        ? 'GOOGLE_API_RATE_LIMIT'
        : googleResponse.status >= 500
          ? 'GOOGLE_API_UNAVAILABLE'
          : 'GOOGLE_ROUTE_INVALID';
    console.error(
      'Google Routes API failed',
      googleResponse.status,
      errorCode,
      googleFailure.payload?.error?.status || '',
      (googleFailure.payload?.error?.message || googleFailure.text).slice(0, 300),
    );
    await writeUsageLog({ ...baseLog, status: 'error', error_code: errorCode });
    const message = errorCode === 'GOOGLE_API_FORBIDDEN'
      ? 'Google Routes APIの有効化、課金設定、APIキー制限を確認してください。'
      : errorCode === 'GOOGLE_API_RATE_LIMIT'
        ? '経路APIの利用上限に達しました。時間を置いて再度お試しください。'
        : errorCode === 'GOOGLE_ROUTE_INVALID'
          ? '住所を経路として特定できませんでした。都道府県・市区町村から入力してください。'
          : '経路APIへ接続できませんでした。時間を置いて再度お試しください。';
    const responseStatus = errorCode === 'GOOGLE_API_FORBIDDEN'
      ? 503
      : errorCode === 'GOOGLE_API_RATE_LIMIT'
        ? 429
        : errorCode === 'GOOGLE_ROUTE_INVALID'
          ? 422
          : 503;
    return jsonResponse({ error: message, code: errorCode }, responseStatus);
  }

  const googleData = await googleResponse.json() as { routes?: GoogleRoute[] };
  const route = googleData.routes?.[0];
  if (!route) {
    await writeUsageLog({ ...baseLog, status: 'error', error_code: 'NO_ROUTE' });
    return jsonResponse({ error: '入力された地点を結ぶ経路が見つかりませんでした。', code: 'NO_ROUTE' }, 422);
  }

  const indexes = preserveOrder
    ? stops.map((_, index) => index)
    : route.optimizedIntermediateWaypointIndex || stops.map((_, index) => index);
  const validIndexes = indexes.length === stops.length
    && new Set(indexes).size === stops.length
    && indexes.every((index) => Number.isInteger(index) && index >= 0 && index < stops.length);
  if (!validIndexes) {
    await writeUsageLog({ ...baseLog, status: 'error', error_code: 'INVALID_ORDER' });
    return jsonResponse({ error: '経路の並び順を取得できませんでした。', code: 'INVALID_ORDER' }, 502);
  }

  const optimizedStops = indexes.map((index) => stops[index]);
  const labels = ['出発地点', ...optimizedStops.map((stop) => stop.label || '乗降地点'), '終着地点'];
  const legs = (route.legs || []).map((leg, index) => ({
    fromLabel: labels[index] || '経由地',
    toLabel: labels[index + 1] || '経由地',
    distanceMeters: Math.max(0, Math.round(Number(leg.distanceMeters) || 0)),
    durationSeconds: parseDuration(leg.duration),
  }));
  const totalDistanceMeters = Math.max(0, Math.round(Number(route.distanceMeters) || 0));
  const totalDurationSeconds = parseDuration(route.duration);
  await writeUsageLog({
    ...baseLog,
    status: 'success',
    distance_meters: totalDistanceMeters,
    duration_seconds: totalDurationSeconds,
  });

  const warnings = [
    ...(stops.length > 3
      ? ['Googleマップを携帯ブラウザで開く場合、一部の経由地点が省略されることがあります。']
      : []),
    ...(shiftedToComparableFuture
      ? ['指定日時が過去のため、同じ曜日・同じ出発時間帯の将来交通予測で計算しました。']
      : []),
    ...(!useTraffic ? ['出発日時を特定できなかったため、通常の道路所要時間で計算しました。'] : []),
    ...(trafficFallback
      ? ['出発時間帯の交通予測を利用できなかったため、通常の道路所要時間で計算しました。']
      : []),
  ];
  return jsonResponse({
    provider: 'google_routes',
    optimizedStopIds: optimizedStops.map((stop) => stop.id),
    totalDistanceMeters,
    totalDurationSeconds,
    legs,
    encodedPolyline: route.polyline?.encodedPolyline || undefined,
    trafficApplied,
    departureTimeUsed: trafficApplied ? effectiveDeparture?.toISOString() : undefined,
    warnings,
  });
});
