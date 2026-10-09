import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTaskTemplate,parseTaskTargets,parseTaskBatch,parseBatchConfiguration,filterTaskTargets,assertSameTaskBatch,parseChangeCandidates,desiredBatchTask} from '../src/learning/taskBatches.ts';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const template={category:'mouse',stageId:'1',title:'M-1',instructions:'クリック',startsOn:'2026-10-09',endsOn:'2026-10-09'};
const target={childId:'fictional',linkId:id,revision:1,campusId:'main',group:'A',available:true};
const item={...target,taskId:other,status:'pending',errorCode:'',savedAt:null};
const batch={operationId:id,template,createdAt:'2026-10-09T00:00:00Z',items:[item]};
test('batch projections exclude names, credentials and source IDs; template normalizes title',()=>{
 assert.deepEqual(parseTaskTargets([{...target,password:'secret',studentId:'student_secret'}]),[target]);
 assert.deepEqual(parseTaskTemplate({...template,title:' M-1 ',password:'secret'}),template);
 assert.deepEqual(parseTaskBatch({...batch,password:'secret'},id),batch);
 assert.deepEqual(parseBatchConfiguration({schemaVersion:1,targets:[target],catalog:[],history:[]}),{targets:[target],catalog:[],history:[]});
});
test('batch parser rejects duplicated bindings, invalid revision/campus/group, invalid dates and mismatched receipts',()=>{
 for(const rows of [[target,target],[{...target,revision:0}],[{...target,campusId:'public'}],[{...target,group:'x'.repeat(81)}],[{...target,available:1}]])assert.throws(()=>parseTaskTargets(rows));
 for(const patch of [{operationId:other},{items:[]},{items:[item,item]},{items:[{...item,status:'saved'}]},{items:[{...item,errorCode:'raw secret'}]},{items:[{...item,savedAt:'2026-10-09T00:00:00Z'}]}])assert.throws(()=>parseTaskBatch({...batch,...patch},id));
 assert.throws(()=>parseTaskTemplate({...template,endsOn:'2027-10-09'}));
 assert.throws(()=>parseBatchConfiguration({schemaVersion:1,targets:[],catalog:[],history:[{operationId:id,title:'test',createdAt:batch.createdAt,total:2,saved:3}]}));
});
test('campus/group filters distinguish blank and literal-star groups; do not mutate selections',()=>{
 const rows=[target,{...target,childId:'b',linkId:other,group:''},{...target,childId:'c',linkId:'33333333-3333-4333-8333-333333333333',campusId:'other',group:'*'}];
 assert.equal(filterTaskTargets(rows,'main',null).length,2);
 assert.equal(filterTaskTargets(rows,'','').length,1);
 assert.equal(filterTaskTargets(rows,'','*').length,1);
 assert.equal(rows.length,3);
});
test('batch results cannot retarget learners, alter immutable template/task IDs or regress saved receipts',()=>{
 const saved={...batch,items:[{...item,status:'saved',savedAt:batch.createdAt}]};
 assert.deepEqual(assertSameTaskBatch(batch,saved),saved);
 assert.throws(()=>assertSameTaskBatch(saved,batch));
 assert.throws(()=>assertSameTaskBatch(batch,{...batch,template:{...template,title:'other'}}));
 assert.throws(()=>assertSameTaskBatch(batch,{...batch,items:[{...item,taskId:id}]}));
 assert.throws(()=>assertSameTaskBatch(batch,{...batch,items:[{...item,group:'other'}]}));
});
const before={...template,id:item.taskId,revision:2,active:true,updatedAt:batch.createdAt};
const change={...batch,kind:'edit',parentId:other,items:[{...item,before}]};
test('edit and stop snapshots require exact original task and preserve before state, kind and parent',()=>{
 assert.deepEqual(parseTaskBatch(change,id),change);
 for(const patch of [{kind:'delete'},{parentId:null},{parentId:id},{items:[{...item,before:{...before,id}}]},{items:[{...item,before:{...before,active:false}}]},{items:[item]}])assert.throws(()=>parseTaskBatch({...change,...patch},id));
 assert.throws(()=>assertSameTaskBatch(change,{...change,kind:'stop'}));
 assert.throws(()=>assertSameTaskBatch(change,{...change,items:[{...item,before:{...before,revision:3}}]}));
 assert.equal(desiredBatchTask(change,change.items[0]).revision,2);
 assert.deepEqual(desiredBatchTask({...change,kind:'stop',template:{...template,title:'ignored original title'}},change.items[0]),{...template,id:item.taskId,revision:2,active:false});
 const history={operationId:id,title:'test',createdAt:batch.createdAt,total:1,saved:0,kind:'stop',parentId:other};
 assert.deepEqual(parseBatchConfiguration({schemaVersion:1,targets:[],catalog:[],history:[history]}).history,[history]);
});
test('change candidates bind to original created tasks and reject ambiguous ready/stopped states or credential extras',()=>{
 const candidate={...target,taskId:item.taskId,reason:'ready',task:before};
 const value={schemaVersion:1,parentId:batch.operationId,candidates:[candidate],catalog:[]};
 assert.deepEqual(parseChangeCandidates(value,batch).candidates,[candidate]);
 const sanitized=parseChangeCandidates({...value,candidates:[{...candidate,password:'secret',task:{...before,password:'secret'}}]},batch);
 assert(!JSON.stringify(sanitized).includes('secret'));
 for(const patch of [{parentId:other},{candidates:[]},{candidates:[candidate,candidate]},{candidates:[{...candidate,taskId:id}]},{candidates:[{...candidate,task:undefined}]},
  {candidates:[{...candidate,available:false}]},{candidates:[{...candidate,reason:'stopped'}]},{candidates:[{...candidate,task:{...before,active:false}}]}])assert.throws(()=>parseChangeCandidates({...value,...patch},batch));
});
