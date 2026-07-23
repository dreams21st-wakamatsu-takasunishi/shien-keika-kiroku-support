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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return jsonResponse({ error: 'Server configuration is incomplete' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const { data: caller } = await userClient
    .from('profiles')
    .select('organization_id, role')
    .eq('id', userData.user.id)
    .single();
  if (!caller || !['manager', 'admin'].includes(caller.role)) {
    return jsonResponse({ error: 'Manager permission is required' }, 403);
  }

  const body = await request.json().catch(() => null) as {
    email?: string;
    displayName?: string;
    role?: 'staff' | 'manager' | 'admin';
  } | null;
  const email = body?.email?.trim().toLowerCase() || '';
  const displayName = body?.displayName?.trim().slice(0, 100) || email.split('@')[0];
  const role = body?.role || 'staff';
  if (!email.includes('@') || !['staff', 'manager', 'admin'].includes(role)) {
    return jsonResponse({ error: 'Invalid invitation details' }, 400);
  }
  if (caller.role !== 'admin' && role !== 'staff') {
    return jsonResponse({ error: 'Only administrators can invite managers or administrators' }, 403);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: invitation, error: inviteRowError } = await serviceClient
    .from('member_invitations')
    .insert({
      organization_id: caller.organization_id,
      email,
      role,
      invited_by: userData.user.id,
    })
    .select('id')
    .single();
  if (inviteRowError) return jsonResponse({ error: inviteRowError.message }, 409);

  const { error: authError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    data: {
      display_name: displayName,
      needs_password_setup: true,
    },
  });
  if (authError) {
    await serviceClient.from('member_invitations').delete().eq('id', invitation.id);
    return jsonResponse({ error: authError.message }, 400);
  }

  return jsonResponse({ ok: true });
});
