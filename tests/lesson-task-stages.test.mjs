import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTaskDetails} from '../src/learning/tasks.ts';
const task={id:'11111111-1111-4111-8111-111111111111',revision:1,category:'mouse',stageId:'1',title:'M-1',instructions:'',startsOn:'2026-10-01',endsOn:'2026-10-02',active:true,updatedAt:'2026-10-01T00:00:00Z'};
const result={taskId:task.id,revision:1,count:1,historyComplete:false,unidentifiedCount:2,latest:[{id:'event',at:'2026-09-30T15:00:00Z',detail:'クリア',amount:'5回'}]};
const payload={schemaVersion:1,tasks:[task],catalog:[{category:'mouse',stageId:'1',title:'M-1'}],results:[result]};
test('stage task projections retain only safe fields and exact revision/date-matched evidence',()=>{
 const parsed=parseTaskDetails({...payload,password:'secret'});
 assert.deepEqual(parsed.tasks,[task]);assert.deepEqual(parsed.results,[result]);assert(!('password' in parsed));
 assert.equal(parseTaskDetails({...payload,tasks:[{...task,stageId:undefined}]}).tasks[0].stageId,undefined);
});
test('stage task parser rejects missing catalog, category mismatch, duplicate evidence, stale revision and non-JST period evidence',()=>{
 for(const patch of [{catalog:undefined},{catalog:[{category:'word',stageId:'1',title:'M-1'}]},{catalog:[...payload.catalog,...payload.catalog]},
  {results:[]},{results:[{...result,revision:2}]},{results:[{...result,count:-1}]},{results:[{...result,historyComplete:true}]},
  {results:[{...result,count:2,latest:[...result.latest,...result.latest]}]},
  {results:[{...result,latest:[{...result.latest[0],at:'2026-09-30T14:59:59Z'}]}]}])assert.throws(()=>parseTaskDetails({...payload,...patch}));
});
