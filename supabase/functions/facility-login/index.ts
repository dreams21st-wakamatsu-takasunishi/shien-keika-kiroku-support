import {createClient} from 'npm:@supabase/supabase-js@2';
import {createFacilityLoginHandler} from './handler.ts';
Deno.serve(request=>{
 const url=Deno.env.get('SUPABASE_URL')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 return createFacilityLoginHandler(createClient(url,serviceKey,options),createClient(url,anon,options))(request);
});
