import {createClient} from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-support-device-token','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(b:unknown,status=200)=>new Response(JSON.stringify(b),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return reply({error:'POST required'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!,authorization=request.headers.get('authorization')||'';
  if(!/^Bearer\s+\S+$/i.test(authorization))return reply({error:'職員ログインが必要です。'},401);
  const db=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization,'x-support-device-token':request.headers.get('x-support-device-token')||''}}});
  const auth=await db.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
  if(auth.error||!auth.data.user)return reply({error:'職員ログインを確認してください。'},401);
  const context=async()=>{const {data,error}=await db.rpc('get_lesson_learning_context');if(error||!data||data.actorId!==auth.data.user!.id||!data.organizationId||data.canManageLinks!==true||data.canIssueAccounts!==true)throw Error('DENIED');return data;};
  const current=await context(),raw=await request.text();if(raw.length>2048)return reply({error:'送信内容を確認してください。'},400);
  const b=JSON.parse(raw);
  if(!['status','archive','restore'].includes(b.action)||(b.action!=='status'&&(b.confirmed!==true||typeof b.childId!=='string'
   ||!Number.isSafeInteger(b.expectedRevision)||!Number.isSafeInteger(b.linkRevision))))return reply({error:'児童と確認欄を確認してください。'},400);
  const project=Deno.env.get('D_LESSON_PROJECT_REF')||'',secret=Deno.env.get('D_LESSON_BRIDGE_SECRET')||'';
  if(!/^[a-z0-9]{20}$/.test(project)||secret.length<32)return reply({error:'連携設定を確認してください。'},503);
  let query=db.from('lesson_child_links').select('*').eq('organization_id',current.organizationId).eq('active',true).eq('source_project_ref',project).order('id').limit(501);
  if(b.action!=='status')query=query.eq('child_id',b.childId);
  const {data:links,error}=await query;
  if(error||!links||links.length>500)return reply({error:'連携一覧を再取得してください。'},503);
  if(b.action==='status'&&links.length===0){await context();return reply({items:[]});}
  if(b.action!=='status'){
   const child=await db.from('children').select('name').eq('organization_id',current.organizationId).eq('id',b.childId).is('deleted_at',null).maybeSingle();
   if(child.error||!child.data||b.confirmName!==child.data.name||links.length!==1||links[0].revision!==b.linkRevision)
    return reply({error:'児童名・連携情報を再確認してください。'},409);
  }
  const items=[];
  for(let offset=0;offset<links.length;offset+=100){
   const batch=links.slice(offset,offset+100);
   const response=await fetch(`https://${project}.supabase.co/functions/v1/support-student-admin`,{method:'POST',headers:{'Content-Type':'application/json','x-lesson-bridge-key':secret},
    body:JSON.stringify({action:b.action,supportProjectRef:new URL(url).hostname.split('.')[0],organizationId:current.organizationId,actorId:current.actorId,
     links:batch.map(({id,child_id,source_student_id,source_campus_id,source_table})=>({id,child_id,source_student_id,source_campus_id,source_table})),expectedRevision:b.expectedRevision}),redirect:'error',signal:AbortSignal.timeout(60000)});
   const result=await response.json();
   if(!response.ok)return reply({error:typeof result?.error==='string'?result.error:'操作結果を確認できませんでした。'},[403,409].includes(response.status)?response.status:503);
   if(!Array.isArray(result?.items)||result.items.length!==batch.length)return reply({error:'取得結果が一致しません。'},503);
   items.push(...result.items);
  }
  const latest=await context();
  const check=await db.from('lesson_child_links').select('id,revision').eq('organization_id',current.organizationId).eq('active',true).in('id',links.map(x=>x.id));
  if(latest.organizationId!==current.organizationId||check.error||check.data?.length!==links.length||links.some(x=>!check.data?.some(y=>y.id===x.id&&y.revision===x.revision)))
   return reply({error:'連携が変更されています。再取得してください。'},409);
  return reply({items});
 }catch(e){return reply({error:e instanceof Error&&e.message==='DENIED'?'児童管理・アカウント発行の権限と承認端末が必要です。':'児童の管理情報を取得できませんでした。'},e instanceof Error&&e.message==='DENIED'?403:503);}
});
