import test from 'node:test';
import assert from 'node:assert/strict';
import {initialAuditFilters,parseAuditFilters,parseAuditCursor,parseAuditPage,parseAuditDetail} from '../src/learning/taskBatchAudit.ts';
const ids=Array.from({length:24},(_,i)=>`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`);
const org=ids[22],actor=ids[23],time='2026-10-15T01:00:00.123456+00:00';
const entry={operationId:ids[0],createdAt:time,title:'架空課題',kind:'create',parentId:null,actorId:actor,actorName:'架空職員',actorActive:true,total:1,saved:0};
const template={category:'mouse',stageId:'1',title:entry.title,instructions:'クリック',startsOn:'2026-10-15',endsOn:'2026-10-16'};
const item={childId:'fictional-child',linkId:ids[1],revision:1,campusId:'main',group:'A',available:true,taskId:ids[2],status:'pending',errorCode:'connection',savedAt:null};
const batch={operationId:entry.operationId,createdAt:time,template,items:[item]};
const page={schemaVersion:1,organizationId:org,filters:initialAuditFilters,entries:[entry],actors:[{id:actor,name:entry.actorName,active:true}],nextCursor:null};
const detail={schemaVersion:1,organizationId:org,entry,batch};
test('audit filters and cursors reject malformed/unbounded choices; preserve database microseconds',()=>{
 assert.deepEqual(parseAuditFilters(initialAuditFilters),initialAuditFilters);
 assert.equal(parseAuditCursor({createdAt:time,operationId:ids[0]}).createdAt,time);
 for(const patch of [{kind:'delete'},{state:'any'},{actorId:''},{actorId:undefined}])assert.throws(()=>parseAuditFilters({...initialAuditFilters,...patch}));
 for(const cursor of [undefined,{}, {createdAt:'tomorrow',operationId:ids[0]},{createdAt:time,operationId:'bad'}])assert.throws(()=>parseAuditCursor(cursor));
});
test('audit projections whitelist browser fields; omit source targets, credentials, profile email and extras',()=>{
 const result=parseAuditPage({...page,secret:'hidden',actors:[{...page.actors[0],email:'private@example.com'}],entries:[{...entry,password:'hidden',targets:[{studentId:'student_hidden'}]}]},initialAuditFilters,null);
 assert(!JSON.stringify(result).includes('hidden'));assert(!JSON.stringify(result).includes('private@'));
 const resultDetail=parseAuditDetail({...detail,batch:{...batch,targets:[{studentId:'student_hidden'}],items:[{...item,password:'hidden'}]}},ids[0],org);
 assert(!JSON.stringify(resultDetail).includes('hidden'));
});
test('audit page validates scope, filters, unique entries and actor fields',()=>{
 for(const patch of [{schemaVersion:0},{organizationId:'bad'},{entries:[entry,entry]},{actors:[page.actors[0],page.actors[0]]},{entries:[{...entry,actorName:''}]},{entries:[{...entry,actorActive:1}]},{entries:[{...entry,saved:2}]},{entries:[{...entry,kind:'stop',parentId:entry.operationId}]}])assert.throws(()=>parseAuditPage({...page,...patch},initialAuditFilters,null));
 for(const filters of [{...initialAuditFilters,kind:'stop'},{...initialAuditFilters,state:'completed'},{...initialAuditFilters,actorId:ids[3]}]){
  assert.throws(()=>parseAuditPage(page,filters,null));
  assert.throws(()=>parseAuditPage({...page,filters},filters,null));
 }
 assert.throws(()=>parseAuditPage({...page,entries:[{...entry,saved:1}],filters:{...initialAuditFilters,state:'pending'}},{...initialAuditFilters,state:'pending'},null));
});
test('audit keyset uses last displayed item, never overflow item, and rejects repeated cursor',()=>{
 const entries=ids.slice(0,20).map(operationId=>({...entry,operationId})),cursor={createdAt:time,operationId:ids[19]};
 assert.deepEqual(parseAuditPage({...page,entries,nextCursor:cursor},initialAuditFilters,null).nextCursor,cursor);
 assert.throws(()=>parseAuditPage({...page,entries,nextCursor:{...cursor,operationId:ids[20]}},initialAuditFilters,null));
 assert.throws(()=>parseAuditPage({...page,nextCursor:cursor},initialAuditFilters,null));
 assert.throws(()=>parseAuditPage({...page,entries},initialAuditFilters,cursor));
});
test('audit details bind organization, operation, summary and full saved receipts',()=>{
 assert.deepEqual(parseAuditDetail(detail,ids[0],org),{organizationId:org,entry,batch});
 for(const patch of [{organizationId:ids[3]},{entry:{...entry,saved:1}},{entry:{...entry,title:'別の課題'}},{entry:{...entry,total:2}},{batch:{...batch,items:[{...item,status:'saved'}]}}])assert.throws(()=>parseAuditDetail({...detail,...patch},ids[0],org));
 assert.throws(()=>parseAuditDetail(detail,ids[3],org));
});
test('audit details preserve stop/edit before snapshots without enabling creation or mutation',()=>{
 const before={...template,id:item.taskId,revision:2,active:true,updatedAt:time};
 for(const kind of ['edit','stop']){
  const entry2={...entry,operationId:ids[4],kind,parentId:ids[0]},batch2={...batch,operationId:ids[4],kind,parentId:ids[0],items:[{...item,before}]};
  const result=parseAuditDetail({...detail,entry:entry2,batch:batch2},ids[4],org);
  assert.deepEqual(result.batch.items[0].before,before);
  assert.throws(()=>parseAuditDetail({...detail,entry:entry2,batch:{...batch2,parentId:ids[5]}},ids[4],org));
 }
});
