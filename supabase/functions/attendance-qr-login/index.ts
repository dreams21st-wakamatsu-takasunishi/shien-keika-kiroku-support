import { createClient } from 'npm:@supabase/supabase-js@2';
import { createQrLoginHandler, qrLoginResponse } from './handler.ts';

Deno.serve((request) => {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return qrLoginResponse({ error: 'QRログインのサーバー設定が完了していません。' }, 503);
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  return createQrLoginHandler(createClient(url, serviceKey, options), createClient(url, anonKey, options))(request);
});
