import {createClient} from 'npm:@supabase/supabase-js@2';
import {createUnifiedLoginHandler} from './handler.ts';
Deno.serve(request=>{
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!key||!anon)return new Response(JSON.stringify({error:'認証設定を確認できません。'}),{status:503,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 return createUnifiedLoginHandler(createClient(url,key,options),createClient(url,anon,options))(request);
});
