import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDiagnosticStore,sanitizeDiagnostic,classifyDiagnosticError,apiDiagnosticOperation,DIAGNOSTICS_KEY,type DiagnosticEvent} from './diagnostics';
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
