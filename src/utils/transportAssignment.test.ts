import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {TransportRun,TransportStop} from '../types';
import {sameStopCandidate,applyTransportAssignment} from './transportAssignment';
const stop=(id:string,time='14:00')=>({id:`s-${id}`,childId:id,childName:id,location:'学校住所',locationName:'学校A',locationType:'学校',timeMode:'fixed',timeAnchorTime:time,plannedTime:time,order:1}) as TransportStop;
const run=(id:string,direction='迎え',stops=[stop('a')])=>({id,date:'2026-10-07',name:id,direction,stops,vehicleId:'v',assistantRecorderProfileIds:[],routeOptimizedAt:'calculated'}) as TransportRun;
test('same-stop recommendation needs a known address, known times, same rule and bounded time difference',()=>{
  assert.equal(sameStopCandidate(stop('a'),stop('b','14:15'),15),true);
  assert.equal(sameStopCandidate(stop('a'),stop('b','14:16'),15),false);
  assert.equal(sameStopCandidate(stop('a'),{...stop('b'),location:''},15),false);
  assert.equal(sameStopCandidate({...stop('a'),location:'',locationName:'自宅'},{...stop('b'),location:'',locationName:'自宅'},15),false);
  assert.equal(sameStopCandidate(stop('a'),{...stop('b'),timeAnchorTime:undefined,plannedTime:undefined},15),false);
  assert.equal(sameStopCandidate(stop('a'),{...stop('b'),timeMode:'arrival_backward'},15),false);
  assert.equal(sameStopCandidate(stop('a'),stop('a'),15),false);
  assert.equal(sameStopCandidate({...stop('a'),location:'住所1-23'},{...stop('b'),location:'住所12-3'},15),false);
});
test('assignment moves only the selected direction/date, keeps opposite direction and never duplicates children',()=>{
  const source=run('source'),target=run('target','迎え',[stop('b')]),drop=run('drop','送り'),tomorrow={...source,id:'tomorrow',date:'2026-10-08'};
  const before=JSON.stringify([source,target,drop,tomorrow]);
  const result=applyTransportAssignment([source,target,drop,tomorrow],{...target,driverRecorderProfileId:'staff'},[stop('a')]);
  assert.equal(result.find(r=>r.id==='source')?.stops.length,0);
  assert.deepEqual(result.find(r=>r.id==='target')?.stops.map(s=>s.childId),['b','a']);
  assert.equal(result.find(r=>r.id==='target')?.routeOptimizedAt,undefined);
  assert.equal(result.find(r=>r.id==='drop'),drop);assert.equal(result.find(r=>r.id==='tomorrow'),tomorrow);
  assert.equal(JSON.stringify([source,target,drop,tomorrow]),before);
});
test('crew-only edits preserve calculated times; new separate runs are appended',()=>{
  const original=run('original');
  const same=applyTransportAssignment([original],{...original,driverRecorderProfileId:'new'},[stop('a')]);
  assert.equal(same[0].routeOptimizedAt,'calculated');assert.equal(same[0].driverRecorderProfileId,'new');
  const separate=run('new','迎え',[]);
  const result=applyTransportAssignment([original],separate,[stop('a')]);
  assert.equal(result.length,2);assert.equal(result[0].stops.length,0);assert.equal(result[1].stops[0].childId,'a');
  const multiple=run('multiple','迎え',[stop('a'),stop('b'),stop('c')]);
  const preserved=applyTransportAssignment([multiple],multiple,[stop('b')]);
  assert.deepEqual(preserved[0].stops.map(s=>s.childId),['a','b','c']);assert.equal(preserved[0].routeOptimizedAt,'calculated');
});
