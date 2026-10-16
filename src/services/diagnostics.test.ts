import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDiagnosticStore,sanitizeDiagnostic,classifyDiagnosticError,apiDiagnosticOperation,DIAGNOSTICS_KEY,diagnosticFetch,setDiagnosticScreen,readDiagnostics,clearDiagnostics,formatDiagnosticReport,type DiagnosticEvent} from './diagnostics';
const now=Date.parse('2026-10-09T12:00:00.000Z');
const event=(overrides:Partial<DiagnosticEvent>={}):DiagnosticEvent=>({id:'test',at:new Date(now).toISOString(),version:'25963ee.195.1',screen:'form',online:true,kind:'error',code:'NETWORK',operation:'record.save',actions:[{at:new Date(now).toISOString(),operation:'record.save.single'}],...overrides});
const storage=()=>{const items=new Map<string,string>();return {items,getItem:(key:string)=>items.get(key)||null,setItem:(key:string,value:string)=>{items.set(key,value);},removeItem:(key:string)=>{items.delete(key);}};};
test('diagnostic whitelist removes all private values, raw messages, DOM, URLs, credentials and stacks',()=>{
  const privateValue='秘密の児童 https://example.com/private?token=secret';
  const value=sanitizeDiagnostic({...event(),message:privateValue,stack:privateValue,token:privateValue,body:{text:privateValue},screen:privateValue,operation:privateValue,version:privateValue,
    actions:[{at:new Date(now).toISOString(),operation:privateValue,value:privateValue}],userId:privateValue});
  assert.ok(value);assert.equal(JSON.stringify(value).includes(privateValue),false);assert.equal(value.operation,'api.other');assert.equal(value.screen,'unknown');
});
test('storage survives reload and expires old events with a 200-event cap',()=>{
  const s=storage();const store=createDiagnosticStore(s,()=>now);
  store.append(event({id:'old',at:new Date(now-31*86400000).toISOString()}));
  for(let i=0;i<205;i++)store.append(event({id:`event-${i}`}));
  assert.equal(store.read().length,200);assert.equal(store.read()[0].id,'event-5');
  assert.equal(createDiagnosticStore(s,()=>now).read().at(-1)?.id,'event-204');
  assert.equal(createDiagnosticStore(s,()=>now+31*86400000).read().length,0);
});
test('quota failure keeps in-memory history and later writes recover without breaking the operation',()=>{
  const s=storage();let blocked=false;const store=createDiagnosticStore({...s,setItem:(k,v)=>{if(blocked)throw Error('quota');s.setItem(k,v);}},()=>now);
  store.append(event({id:'first'}));blocked=true;store.append(event({id:'second'}));
  assert.equal(store.persisted(),false);assert.deepEqual(store.read().map(e=>e.id),['first','second']);
  blocked=false;store.append(event({id:'third'}));assert.equal(store.persisted(),true);assert.equal(store.read().length,3);
});
test('corrupt or hostile persisted data is not exported and clearing affects only diagnostic storage',()=>{
  const s=storage();s.items.set('draft','important');s.items.set(DIAGNOSTICS_KEY,'[{"message":"secret"}]');
  const store=createDiagnosticStore(s,()=>now);assert.deepEqual(store.read(),[]);store.clear();assert.equal(s.items.get('draft'),'important');
  s.items.set(DIAGNOSTICS_KEY,'broken json');assert.deepEqual(createDiagnosticStore(s,()=>now).read(),[]);
});
test('error classifications are static and API operation drops every query and unknown resource',()=>{
  assert.equal(classifyDiagnosticError({message:'Failed to fetch secret'}),'NETWORK');
  assert.equal(classifyDiagnosticError({message:'RECORD_CONFLICT private record-id'}),'CONFLICT');
  assert.equal(classifyDiagnosticError({code:'42501',message:'private'}),'PERMISSION');
  assert.equal(classifyDiagnosticError({message:'sensitive exception'}),'UNEXPECTED');
  assert.equal(apiDiagnosticOperation('https://example.com/rest/v1/rpc/save_support_records_guarded?child_name=秘密&token=secret'),'api.save_support_records_guarded');
  assert.equal(apiDiagnosticOperation('https://example.com/private-title'),'api.other');
});

test('new diagnostic context allows only bounded timing, HTTP methods, screen names and known server codes',()=>{
 const valid=sanitizeDiagnostic(event({requestScreen:'team',requestMethod:'GET',durationMs:8199.2,serverCode:'57014'}));
 assert.equal(valid?.requestScreen,'team');assert.equal(valid?.durationMs,8199);assert.equal(valid?.serverCode,'57014');
 const hostile=sanitizeDiagnostic(event({requestScreen:'private child name',requestMethod:'secret',durationMs:Infinity,serverCode:'private-token'}));
 assert.equal(hostile?.requestScreen,'unknown');assert.equal(hostile?.requestMethod,undefined);assert.equal(hostile?.durationMs,undefined);assert.equal(hostile?.serverCode,undefined);
});

test('copy includes the failed operation and date, distinguishes request from detection screen, and never copies raw errors',()=>{
 const text=formatDiagnosticReport({...event({operation:'api.audit_logs',screen:'templates',requestScreen:'team',httpStatus:500,serverCode:'57014',durationMs:8200,requestMethod:'GET'}),message:'private message',token:'secret'} as any);
 for(const marker of ['api.audit_logs','2026/10/9','要求開始画面：team','エラー検知時の画面：templates','8.20秒','57014'])assert.ok(text.includes(marker),marker);
 assert.ok(!text.includes('private message')&&!text.includes('secret'));
 assert.ok(formatDiagnosticReport(event()).includes('未記録（旧版）'));
});

test('in-flight failure keeps original screen and SQLSTATE while deliberate aborts are not logged',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,s=storage();
 Object.assign(globalThis,{window:{localStorage:s,dispatchEvent:()=>true}});
 try{
  clearDiagnostics();setDiagnosticScreen('team');let resolve!:(value:Response)=>void;
  globalThis.fetch=()=>new Promise<Response>(done=>{resolve=done;});
  const pending=diagnosticFetch('https://example.com/rest/v1/audit_logs?private=secret',{method:'GET'});
  setDiagnosticScreen('templates');resolve(new Response(JSON.stringify({code:'57014',message:'private child info'}),{status:500}));
  await pending;const result=readDiagnostics().at(-1)!;
  assert.equal(result.requestScreen,'team');assert.equal(result.screen,'templates');assert.equal(result.operation,'api.audit_logs');assert.equal(result.serverCode,'57014');assert.equal(result.requestMethod,'GET');assert.equal(typeof result.durationMs,'number');assert.ok(!JSON.stringify(result).includes('secret')&&!JSON.stringify(result).includes('private child'));
  globalThis.fetch=async()=>{throw new DOMException('Canceled','AbortError');};
  await assert.rejects(()=>diagnosticFetch('https://example.com/rest/v1/audit_logs'));assert.equal(readDiagnostics().length,1);
  clearDiagnostics();
 }finally{globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow});}
});
