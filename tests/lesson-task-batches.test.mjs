import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTaskTemplate,parseTaskTargets,parseTaskBatch,parseBatchConfiguration,filterTaskTargets,assertSameTaskBatch} from '../src/learning/taskBatches.ts';
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
