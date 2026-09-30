import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLearningTasks,validTaskDates} from '../learning/tasks';
const task={id:'11111111-1111-4111-8111-111111111111',revision:1,category:'mouse',title:'M-1のれんしゅう',instructions:'クリックを5回',startsOn:'2026-09-30',endsOn:'2026-10-01',active:true,updatedAt:'2026-09-30T00:00:00Z'};
test('task dates reject reversed, nonexistent and over-90-day intervals',()=>{
 assert.equal(validTaskDates('2026-09-30','2026-10-01'),true);
 for(const [start,end] of [['2026-10-01','2026-09-30'],['2026-02-30','2026-03-01'],['2026-01-01','2026-12-31'],['','2026-10-01']])assert.equal(validTaskDates(start,end),false);
});
test('task contracts reject unknown categories, malformed versions, oversized content and duplicate IDs',()=>{
 assert.deepEqual(parseLearningTasks({schemaVersion:1,tasks:[task]}),[task]);
 for(const patch of [{category:'__proto__'},{category:'free'},{revision:0},{title:''},{title:'a'.repeat(81)},{instructions:'a'.repeat(501)},{active:'true'},{endsOn:'2026-02-30'}])assert.throws(()=>parseLearningTasks({schemaVersion:1,tasks:[{...task,...patch}]}));
 assert.throws(()=>parseLearningTasks({schemaVersion:2,tasks:[task]}));
 assert.throws(()=>parseLearningTasks({schemaVersion:1,tasks:[task,task]}));
});
