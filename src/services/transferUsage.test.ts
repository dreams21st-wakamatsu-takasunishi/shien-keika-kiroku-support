import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessFreeEgress,createTransferCounter,createTransferHistory,declaredResponseBytes,mergeTransferSample,parseTransferGB,parseTransferSample,projectTransferSample,TRANSFER_HISTORY_LIMIT} from './transferUsage';

const sample={start:'2026-10-14',end:'2026-11-13',observed:'2026-10-28',uncached:2.5,cached:0.1};
test('free cached and uncached budgets are independent; readings distinguish zero from missing',()=>{
 assert.equal(parseTransferGB('0'),0);
 for(const invalid of ['','-1','2,3','1e3','Infinity','NaN','2 GB','2.0000001'])assert.equal(parseTransferGB(invalid),undefined);
 for(const [gb,level] of [[0,'ok'],[3.49,'ok'],[3.5,'watch'],[4.25,'high'],[5,'limit'],[10.928,'limit']] as const)assert.equal(assessFreeEgress(gb).level,level);
 assert.equal(assessFreeEgress(10.928).remaining,0);
 assert.equal(assessFreeEgress(0).remaining,5);
});
test('records are validated and store no extra data; projections only use partial periods with sufficient days',()=>{
 assert.deepEqual(parseTransferSample({...sample,secret:'not stored'}),sample);
 for(const observed of ['2026-02-30','2026-10-13','2026-11-14','bad'])assert.equal(parseTransferSample({...sample,observed}),null);
 assert.deepEqual(projectTransferSample(sample),{uncached:5,cached:0.2});
 assert.equal(projectTransferSample({...sample,observed:sample.start}),null);
 assert.equal(projectTransferSample({...sample,observed:sample.end}),null);
});
test('history replaces same-day readings within the same period, retains older periods and is isolated per organization',()=>{
 const other={...sample,start:'2026-09-14',end:'2026-10-14',observed:'2026-10-14'};
 const items=mergeTransferSample(mergeTransferSample([other],sample),{...sample,uncached:3});
 assert.deepEqual(items,[{...sample,uncached:3},other]);
 const data=new Map<string,string>();
 const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 const a=createTransferHistory(storage,'org-a'),b=createTransferHistory(storage,'org-b');
 a.write(items);assert.deepEqual(a.read(),items);assert.deepEqual(b.read(),[]);
 a.write(Array.from({length:40},()=>sample));assert.equal(a.read().length,TRANSFER_HISTORY_LIMIT);
});
test('declared response sizes never consume a body or treat unknown sizes as zero',()=>{
 const response=(size?:string,status=200)=>({status,headers:new Headers(size===undefined?{}:{'content-length':size})});
 assert.equal(declaredResponseBytes(response('123'),'GET'),123);
 assert.equal(declaredResponseBytes(response(),'GET'),null);
 assert.equal(declaredResponseBytes(response('-1'),'GET'),null);
 assert.equal(declaredResponseBytes(response('9999999999999999'),'GET'),null);
 assert.equal(declaredResponseBytes(response('123'),'HEAD'),0);
 assert.equal(declaredResponseBytes(response(undefined,204),'POST'),0);
});
test('counter counts known and unknown responses separately, ignores late responses from a prior session',()=>{
 const c=createTransferCounter();
 const stale=c.begin('api.children');c.clear();stale(false,80);assert.equal(c.read().length,0);
 const settle=c.begin('api.children');settle(false,12);settle(false,99);
 c.begin('api.children')(true,null);c.begin('api.other')(false,0);
 assert.deepEqual(c.read()[0],{operation:'api.children',requests:2,failures:1,measured:1,declaredBytes:12});
 assert.equal(c.read()[1].measured,1);
 for(let i=0;i<120;i++)c.begin('fixture.'+i)(false,null);
 assert.ok(c.read().length<=96);
});
