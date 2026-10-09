import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraftWriteQueue, planRecordSave, removeSavedDraftChildren, replaceDeletedRecordIds, sameSavedRecordContent, runRecordSaveWorkflow } from './recordSaveWorkflow';
import type { SupportRecord } from '../types';

const record = (overrides: Partial<SupportRecord> = {}): SupportRecord => ({
  id: 'new-a', childId: 'a', childName: 'テスト児童A', date: '2026-09-08',
  templateId: 'template', templateName: '記録', templateType: '平日', attendance: '出席',
  expressions: [], snack: '', recorderName: 'テスト職員', sectionAnswers: {},
  approvalStatus: '未確認', createdAt: '2026-09-08T00:00:00Z', updatedAt: '2026-09-08T01:00:00Z', ...overrides,
});

test('same child and date previews both records and saves with the existing identity/version', () => {
  const previous = record({ id: 'old-a', version: 7, synthesizedSummary: '保存済み本文', recorderName: '前の職員' });
  const incoming = record({ synthesizedSummary: '変更予定の本文' });
  const plan = planRecordSave([incoming], [previous]);
  assert.equal(plan.comparisons.length, 1);
  assert.equal(plan.comparisons[0].existing, previous);
  assert.equal(plan.comparisons[0].proposed.synthesizedSummary, '変更予定の本文');
  assert.equal(plan.records[0].id, 'old-a');
  assert.equal(plan.records[0].version, 7);
  assert.equal(incoming.id, 'new-a');
  assert.equal(previous.synthesizedSummary, '保存済み本文');
});

test('new drafts preserve approval and service metadata, including protected approval', () => {
  const previous = record({ id: 'old-a', version: 5, approvalStatus: '確認済み', jihatsukanComment: '確認者の内容', serviceStartTime: '15:00' });
  const plan = planRecordSave([record()], [previous]);
  assert.equal(plan.comparisons[0].existing.approvalStatus, '確認済み');
  assert.equal(plan.records[0].approvalStatus, '確認済み');
  assert.equal(plan.records[0].jihatsukanComment, '確認者の内容');
  assert.equal(plan.records[0].serviceStartTime, '15:00');
});

test('date changes on an existing id are also compared; unrelated dates/children remain new', () => {
  const previous = record({ id: 'old-a', version: 3 });
  assert.equal(planRecordSave([record({ id: 'old-a', date: '2026-09-09' })], [previous]).comparisons.length, 1);
  assert.equal(planRecordSave([record({ date: '2026-09-09' })], [previous]).comparisons.length, 0);
  assert.equal(planRecordSave([record({ childId: 'b' })], [previous]).comparisons.length, 0);
});

test('batch comparisons contain every overlap and preserve genuinely new records', () => {
  const input = [record(), record({ id: 'new-b', childId: 'b' }), record({ id: 'new-c', childId: 'c' })];
  const previous = [record({ id: 'old-a', version: 2 }), record({ id: 'old-b', childId: 'b', version: 4 })];
  const plan = planRecordSave(input, previous);
  assert.deepEqual(plan.records.map((item) => item.id), ['old-a', 'old-b', 'new-c']);
  assert.equal(plan.comparisons.length, 2);
});

test('ambiguous duplicate data is rejected instead of choosing an arbitrary overwrite target', () => {
  assert.throws(() => planRecordSave([record()], [record({ id: 'old-a' }), record({ id: 'other-a' })]), /複数/);
  assert.throws(() => planRecordSave([record(), record({ id: 'other-a' })], []), /重複/);
});

const draft = () => ({
  selectedChildIds: ['a', 'b', 'c'], activeChildId: 'a',
  childDrafts: { a: { text: '保存する内容' }, b: { text: '編集中の内容' }, c: { text: '引継ぎ内容' } },
  childStepIds: { a: 'review', b: 'activity', c: 'arrival' },
  childTemplateIds: { a: 't', b: 't', c: 't' }, currentStepIndex: 5, date: '2026-09-08',
});

test('single-child save removes all its draft indices and keeps other children and cursor', () => {
  const original = draft();
  const remaining = removeSavedDraftChildren(original, ['a']);
  assert.deepEqual(remaining.selectedChildIds, ['b', 'c']);
  assert.equal(remaining.activeChildId, 'b');
  assert.equal(remaining.childDrafts.b, original.childDrafts.b);
  assert.equal(remaining.childStepIds.b, 'activity');
  assert.equal(remaining.currentStepIndex, 5);
  for (const values of [remaining.childDrafts, remaining.childStepIds, remaining.childTemplateIds]) assert.equal('a' in values, false);
  assert.equal(original.selectedChildIds.length, 3);
});

test('saving an inactive child keeps active child; final save leaves no stale selection', () => {
  assert.equal(removeSavedDraftChildren(draft(), ['b']).activeChildId, 'a');
  const remaining = removeSavedDraftChildren(draft(), ['a', 'b', 'c']);
  assert.equal(remaining.activeChildId, '');
  assert.deepEqual(remaining.selectedChildIds, []);
  assert.deepEqual(remaining.childDrafts, {});
});

test('retrying a completed prune is idempotent and preserves subsequently transferred children', () => {
  const first = removeSavedDraftChildren(draft(), ['a']);
  const retry = removeSavedDraftChildren(first, ['a']);
  assert.deepEqual(retry.selectedChildIds, ['b', 'c']);
  assert.equal(retry.childDrafts.c.text, '引継ぎ内容');
});

test('an older in-flight autosave cannot run after the final prune or deletion', async () => {
  const writes = createDraftWriteQueue();
  const log: string[] = [];
  let release!: () => void;
  const old = writes.run(async () => { await new Promise<void>((resolve) => { release = resolve; }); log.push('old'); });
  const prune = writes.run(async () => { log.push('pruned'); });
  await Promise.resolve();
  assert.deepEqual(log, []);
  release();
  await Promise.all([old, prune]);
  assert.deepEqual(log, ['old', 'pruned']);
});

test('a failed autosave does not block a subsequent explicit cleanup retry', async () => {
  const writes = createDraftWriteQueue();
  await assert.rejects(writes.run(async () => { throw new Error('offline'); }));
  assert.equal(await writes.run(async () => 'cleaned'), 'cleaned');
  await writes.idle();
});

test('a new draft pointing to a deleted record gets a new identity without reviving old data', async () => {
  const draft=record(); const writes:SupportRecord[][]=[];const recovery:string[]=[];
  const outcome=await runRecordSaveWorkflow([draft],{
    load:async()=>({records:[],deletedIds:['new-a']}),newId:()=> 'new-safe-id',
    confirm:async()=>{throw Error('no active record to compare');},
    recovery:kind=>recovery.push(kind),
    write:async records=>{writes.push(records);return [{id:records[0].id,version:1,outcome:'inserted'}];},
  });
  assert.equal(outcome.status,'saved');assert.equal(writes[0][0].id,'new-safe-id');
  assert.equal(writes[0][0].version,undefined);assert.equal(draft.id,'new-a');
  assert.deepEqual(recovery,['deleted_id_replaced']);
});

test('deleted existing edits and colliding replacement IDs fail safely instead of resurrecting', () => {
  assert.throws(()=>replaceDeletedRecordIds([record({version:3})],['new-a'],()=> 'new-id'),/削除され/);
  assert.throws(()=>replaceDeletedRecordIds([record()],['new-a'],()=> 'new-a'),/生成でき/);
});

test('save equivalence normalizes SQL time and object order but protects every content change', () => {
  const section=(detailText:string)=>({sectionId:'section',sectionTitle:'様子',answers:{},detailText});
  const a=record({version:1,serviceStartTime:'15:00',sectionAnswers:{a:section('観察'),b:section('補足')}});
  const b=record({...a,id:'other',version:8,updatedAt:'other',serviceStartTime:'15:00:00',sectionAnswers:{b:section('補足'),a:section('観察')}});
  assert.equal(sameSavedRecordContent(a,b),true);
  for(const change of [{synthesizedSummary:'変化'},{recorderName:'別職員'},{serviceStartTime:'15:01'},{approvalStatus:'確認済み' as const},{attendance:'欠席' as const},{sectionAnswers:{a:section('変更')}}]) assert.equal(sameSavedRecordContent(a,{...b,...change}),false);
});

test('network interruption after commit is recovered by rereading exact content without another write', async () => {
  const draft=record();let remote:SupportRecord[]=[];let calls=0;
  const dependencies={load:async()=>({records:remote,deletedIds:[]}),newId:()=> 'unused',confirm:async()=>{throw Error('identical data must not ask to overwrite');},
    write:async(records:SupportRecord[])=>{calls++;remote=records.map(r=>({...r,version:1}));throw Error('Failed to fetch');}};
  await assert.rejects(runRecordSaveWorkflow([draft],dependencies),/fetch/);
  const retry=await runRecordSaveWorkflow([draft],dependencies);
  assert.equal(retry.status,'saved');assert.equal(calls,1);if(retry.status==='saved')assert.equal(retry.records[0].version,1);
});

test('already_saved with same content is rechecked and completed, not attributed to another device', async () => {
  let reads=0,writes=0;const draft=record();
  const result=await runRecordSaveWorkflow([draft],{load:async()=>({records:reads++?[{...draft,version:1}]:[],deletedIds:[]}),newId:()=> 'unused',
    confirm:async()=>{throw Error('no changes');},write:async()=>{writes++;return [{id:draft.id,version:1,outcome:'already_saved'}];}});
  assert.equal(result.status,'saved');assert.equal(writes,1);assert.equal(reads,2);
});

test('a late deletion after preflight is rechecked and safely saved under a new identity', async () => {
  let reads=0;const writes:string[]=[];
  const result=await runRecordSaveWorkflow([record()],{load:async()=>({records:[],deletedIds:reads++?['new-a']:[]}),newId:()=> 'fresh',confirm:async()=>false,
    write:async records=>{writes.push(records[0].id);return [{id:records[0].id,version:1,outcome:writes.length===1?'already_saved':'inserted'}];}});
  assert.equal(result.status,'saved');assert.deepEqual(writes,['new-a','fresh']);
});

test('server deletion guard rechecks a new draft but stops a deleted saved-record edit', async () => {
  for (const version of [undefined, 2]) {
    let reads=0,writes=0;
    const action=runRecordSaveWorkflow([record({version})],{
      load:async()=>({records:[],deletedIds:reads++?['new-a']:[]}),newId:()=> 'fresh',confirm:async()=>false,
      write:async records=>{if(!writes++)throw Object.assign(Error('deleted'),{code:'RECORD_DELETED'});return [{id:records[0].id,version:1,outcome:'inserted'}];},
    });
    if(version) {await assert.rejects(action,/削除され/);assert.equal(writes,1);}
    else {const result=await action;assert.equal(result.status,'saved');if(result.status==='saved')assert.equal(result.records[0].id,'fresh');assert.equal(writes,2);}
  }
});

test('partially saved batches recheck every result without rewriting already saved siblings', async () => {
  const a=record(),b=record({id:'new-b',childId:'b'});let reads=0;const writes:SupportRecord[][]=[];
  const result=await runRecordSaveWorkflow([a,b],{load:async()=>({records:reads++?[{...a,version:1},{...b,version:1}]:[],deletedIds:[]}),newId:()=> 'unused',confirm:async()=>false,
    write:async records=>{writes.push(records);return [{id:a.id,version:1,outcome:'inserted'},{id:b.id,version:1,outcome:'already_saved'}];}});
  assert.equal(result.status,'saved');assert.equal(writes.length,1);if(result.status==='saved')assert.equal(result.records.length,2);
});

test('differing retry content requires a new comparison and cancellation retains the original draft', async () => {
  const a=record({synthesizedSummary:'この端末の入力'});let reads=0,writes=0,confirm=0;
  const outcome=await runRecordSaveWorkflow([a],{load:async()=>({records:reads++?[record({version:2,synthesizedSummary:'保存済みの別内容'})]:[],deletedIds:[]}),newId:()=> 'unused',
    write:async()=>{writes++;return[{id:a.id,version:2,outcome:'already_saved'}];},
    confirm:async pairs=>{confirm++;assert.equal(pairs[0].proposed.synthesizedSummary,a.synthesizedSummary);return false;}});
  assert.equal(outcome.status,'cancelled');assert.equal(writes,1);assert.equal(confirm,1);assert.equal(a.version,undefined);
});

test('persistent ambiguous outcomes stop after bounded rechecks and never silently drop results', async () => {
  let writes=0;
  await assert.rejects(runRecordSaveWorkflow([record()],{load:async()=>({records:[],deletedIds:[]}),newId:()=> 'unused',confirm:async()=>false,
    write:async()=>{writes++;return[{id:'new-a',version:1,outcome:'already_saved'}];}}),/繰り返し変化/);
  assert.equal(writes,3);
  await assert.rejects(runRecordSaveWorkflow([record()],{load:async()=>({records:[],deletedIds:[]}),newId:()=> 'unused',confirm:async()=>false,write:async()=>[]}),/保存結果を確認/);
});

test('real version conflicts and protected approvals are never bypassed by recovery', async () => {
  const old=record({version:3,synthesizedSummary:'前の内容'}),draft=record({synthesizedSummary:'新しい内容'});let writes=0;
  await assert.rejects(runRecordSaveWorkflow([draft],{load:async()=>({records:[old],deletedIds:[]}),newId:()=> 'unused',confirm:async()=>true,
    write:async records=>{writes++;assert.equal(records[0].version,3);throw Error('RECORD_CONFLICT');}}),/CONFLICT/);assert.equal(writes,1);
  await assert.rejects(runRecordSaveWorkflow([draft],{load:async()=>({records:[{...old,approvalStatus:'確認済み'}],deletedIds:[]}),newId:()=> 'unused',confirm:async()=>true,
    write:async()=>{throw Error('must not write');}}),/確認済み/);
});
