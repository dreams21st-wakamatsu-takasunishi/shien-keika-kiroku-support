import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

type RequestLocation = { id?: string; address?: string; label?: string };
type GoogleGeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ error: 'サーバー設定が不足しています。' }, 500);
  if (!authorization) return jsonResponse({ error: 'Unauthorized' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
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
    return jsonResponse({ error: '地図の更新は児発管または管理者のみ行えます。' }, 403);
  }
  if (!googleMapsApiKey) return jsonResponse({ error: 'Google Maps APIが設定されていません。' }, 503);

  const body = await request.json().catch(() => null) as { locations?: RequestLocation[] } | null;
  const locations = (Array.isArray(body?.locations) ? body.locations : []).map((location) => ({
    id: text(location.id, 160),
    address: text(location.address, 300),
    label: text(location.label, 100),
  }));
  if (!locations.length || locations.length > 50 || locations.some((location) => !location.id || !location.address)) {
    return jsonResponse({ error: '住所は1回に1～50件、IDとともに指定してください。' }, 400);
  }

  const geocodeOne = async (location: { id: string; address: string; label: string }) => {
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', location.address);
      url.searchParams.set('language', 'ja');
      url.searchParams.set('region', 'jp');
      url.searchParams.set('key', googleMapsApiKey);
      const response = await fetch(url);
      const payload = await response.json().catch(() => null) as GoogleGeocodeResponse | null;
      if (!response.ok || !payload) return { id: location.id, address: location.address, status: 'error' as const };
      if (payload.status === 'ZERO_RESULTS') return { id: location.id, address: location.address, status: 'not_found' as const };
      if (payload.status !== 'OK') {
        console.error('Google geocoding failed', payload.status || response.status);
        return { id: location.id, address: location.address, status: 'error' as const, code: payload.status };
      }
      const result = payload.results?.[0];
      const latitude = Number(result?.geometry?.location?.lat);
      const longitude = Number(result?.geometry?.location?.lng);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { id: location.id, address: location.address, status: 'not_found' as const };
      return {
        id: location.id,
        address: location.address,
        formattedAddress: result?.formatted_address,
        latitude,
        longitude,
        status: 'resolved' as const,
      };
    } catch (error) {
      console.error('Geocoding request failed', error instanceof Error ? error.message : 'unknown');
      return { id: location.id, address: location.address, status: 'error' as const };
    }
  };

  const results: Awaited<ReturnType<typeof geocodeOne>>[] = [];
  for (let index = 0; index < locations.length; index += 5) {
    results.push(...await Promise.all(locations.slice(index, index + 5).map(geocodeOne)));
  }
  const resolvedCount = results.filter((result) => result.status === 'resolved').length;
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  await serviceClient.from('route_optimization_logs').insert({
    organization_id: profile.organization_id,
    actor_id: userId,
    transport_run_id: null,
    provider: 'google_geocoding',
    stops_count: locations.length,
    status: resolvedCount > 0 ? 'success' : 'error',
    error_code: resolvedCount > 0 ? null : 'NO_LOCATIONS_RESOLVED',
  });
  return jsonResponse({ results, resolvedCount, unresolvedCount: results.length - resolvedCount });
});
