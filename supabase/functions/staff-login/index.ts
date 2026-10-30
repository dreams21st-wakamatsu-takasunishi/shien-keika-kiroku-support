import { createClient } from 'npm:@supabase/supabase-js@2';
import { createStaffLoginHandler } from './handler.ts';

Deno.serve(request => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return new Response(JSON.stringify({error:'認証設定を確認できません。'}), {status:503,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
  const options = {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  return createStaffLoginHandler(createClient(url,serviceKey,options),createClient(url,anonKey,options))(request);
});
