import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
import * as privacy from '../supabase/functions/_shared/externalAiPrivacy.ts';
const org='22222222-2222-4222-8222-222222222222',actor='11111111-1111-4111-8111-111111111111',child='44444444-4444-4444-8444-444444444444';
async function fixture(name){
 let handler,enabled=false,revision=1,networkCalls=0,policyError=false;const logs=[],writes=[],sent=[];
 const profile={organization_id:org,active:true,display_name:'架空指導員'};
 const identity={id:child,name:'架空 太郎',kana:'カクウタロウ',birth_date:'2016-01-01',regular_days:['月'],care_type:'放課後等デイサービス'};
 const action={id:'55555555-5555-4555-8555-555555555555',organization_id:org,child_id:child,requested_by:actor,status:'proposed',action_type:'summarize_recent_records',proposal:{periodDays:30}};
 const client={auth:{getClaims:async()=>({data:{claims:{sub:actor}},error:null})},rpc:async n=>n==='facility_session_allowed'?{data:true,error:null}:{data:{enabled,revision,policyVersion:1},error:policyError?{code:'offline'}:null},from(table){
  let mutation=false;const chain={select(){return chain;},eq(){return chain;},is(){return chain;},gte(){return chain;},lte(){return chain;},order(){return chain;},limit(){return chain;},range(){return chain;},insert(value){mutation=true;writes.push(table);if(table==='ai_generation_logs')logs.push(value);return chain;},update(){mutation=true;writes.push(table);return chain;},upsert(){mutation=true;writes.push(table);return chain;},single(){return result(true);},maybeSingle(){return result(true);},then(ok,bad){return result(false).then(ok,bad);}};
  async function result(single){let data=table==='profiles'?profile:table==='children'?(single?identity:[identity]):table==='organization_ai_settings'?null:table==='assistant_actions'?(mutation?{id:action.id}:action):table==='support_records'?[{record_date:'2026-10-26',synthesized_summary:'架空 太郎が取り組んだ。test@example.invalid',section_answers:{}}]:[];return {data,error:null};}return chain;
 }};
 const source=readFileSync(`supabase/functions/${name}/index.ts`,'utf8').replace(/^import .*?;\r?\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});assert.equal(code.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 const names=['createClient','Deno','fetch',...Object.keys(privacy)];
 const fakeFetch=async(url,init)=>{networkCalls++;const prompt=JSON.parse(init.body).contents[0].parts[0].text;sent.push(prompt);assert.ok(!/架空|2016-01-01|test@example/.test(prompt),'no known identifiers sent');const text=name==='home-assistant'&&JSON.parse(init.body).generationConfig.maxOutputTokens<=500?JSON.stringify({supported:true,actionType:'open_child_records',payload:{}}):'入力された事実の整理';return new Response(JSON.stringify({candidates:[{content:{parts:[{text}]}}]}),{status:200});};
 new Function(...names,code.outputText)(()=>client,{env:{get:n=>({SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'anonymous-test',SUPABASE_SERVICE_ROLE_KEY:'fictional-secret',GEMINI_API_KEY:'fake-key'})[n]},serve:h=>handler=h},fakeFetch,...Object.values(privacy));
 return {call:async body=>{const r=await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer fake'},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};},enable:v=>enabled=v,revision:v=>revision=v,policyError:v=>policyError=v,action,logs,writes,sent,get networkCalls(){return networkCalls;}};
}
for(const name of ['polish-record','home-assistant'])test(`${name}: server gates external calls; exact preview, organization policy, revoked policy and metadata-only AI logs`,async()=>{
 const f=await fixture(name),isPolish=name==='polish-record';
 const input=isPolish?{childId:child,taskType:'abc_summary',sectionTitle:'学習',abc:{behavior:'架空 太郎が取り組んだ。test@example.invalid'}}:{childId:child,instruction:'架空 太郎の記録一覧を開く'};
 const previewMode='preview',generateMode=isPolish?'generate':'propose';
 assert.equal((await f.call({...input,mode:previewMode})).status,403);assert.equal(f.networkCalls,0);
 f.enable(true);f.policyError(true);assert.equal((await f.call({...input,mode:previewMode})).status,403);f.policyError(false);
 assert.equal((await f.call({...input,mode:generateMode})).status,403);assert.equal(f.networkCalls,0);
 const p=await f.call({...input,mode:previewMode});assert.equal(p.status,200);assert.ok(p.data.preview);assert.equal(f.networkCalls,0);assert.equal(f.writes.length,0);
 const modified=isPolish?{...input,abc:{behavior:'別の入力'}}:{...input,instruction:'別の入力'};
 assert.equal((await f.call({...modified,mode:generateMode,previewToken:p.data.preview.token})).status,403);
 f.revision(2);assert.equal((await f.call({...input,mode:generateMode,previewToken:p.data.preview.token})).status,403);f.revision(1);
 f.enable(false);assert.equal((await f.call({...input,mode:generateMode,previewToken:p.data.preview.token})).status,403);f.enable(true);
 const result=await f.call({...input,mode:generateMode,previewToken:p.data.preview.token});assert.equal(result.status,200);assert.equal(f.networkCalls,1);assert.equal(f.sent[0],p.data.preview.text);
 assert.ok(f.logs.length);assert.ok(f.logs.every(l=>l.generated_text==='[本文は保存しません]'));assert.ok(!/取り組んだ|test@example|架空/.test(JSON.stringify(f.logs)));
 if(!isPolish){
  const startCalls=f.networkCalls;const preview=await f.call({mode:'preview_execute',actionId:f.action.id});assert.equal(preview.status,200);assert.equal(preview.data.requiresAi,true);assert.equal(f.networkCalls,startCalls);
  assert.equal((await f.call({mode:'execute',actionId:f.action.id})).status,403);
  assert.equal((await f.call({mode:'execute',actionId:f.action.id,previewToken:preview.data.preview.token})).status,200);assert.equal(f.networkCalls,startCalls+1);assert.equal(f.sent.at(-1),preview.data.preview.text);
  f.action.action_type='open_child_records';const before=f.writes.length;assert.deepEqual((await f.call({mode:'preview_execute',actionId:f.action.id})).data,{requiresAi:false});assert.equal(f.writes.length,before);
  f.action.action_type='update_child_profile';assert.equal((await f.call({mode:'execute',actionId:f.action.id})).status,403);
 }
});
