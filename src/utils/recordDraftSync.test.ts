import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileRecordDraft, sameDraftContent } from './recordDraftSync';
const sample = () => ({ selectedChildIds: ['a','b'], activeChildId: 'a', currentStepIndex: 3, childStepIds: { a: 'attendance' },
  updatedAt: '2099-01-01', childDrafts: { a: { note: '', expression: '', values: ['出席'] }, b: { note: '', expression: '', values: [] as string[] } } });
test('another device content replaces a clean draft regardless of local clock, preserving local view', () => {
  const base=sample(), remote=sample(), local={...base,activeChildId:'b',currentStepIndex:5};remote.childDrafts.a.note='PCの入力';
  const result=reconcileRecordDraft(base,local,remote);
  assert.deepEqual(result.conflicts,[]);assert.equal(result.payload.childDrafts.a.note,'PCの入力');assert.equal(result.payload.activeChildId,'b');assert.equal(result.payload.currentStepIndex,5);assert.equal(result.dirty,false);
});
test('independent child or field edits merge without losing offline edits', () => {
  const base=sample(),local=sample(),remote=sample();local.childDrafts.b.note='タブレット';remote.childDrafts.a.expression='PC';
  const result=reconcileRecordDraft(base,local,remote);assert.deepEqual(result.conflicts,[]);assert.equal(result.payload.childDrafts.b.note,'タブレット');assert.equal(result.payload.childDrafts.a.expression,'PC');assert.equal(result.dirty,true);
});
test('same-field changes, deletion versus editing, and conflicting arrays require confirmation', () => {
  const base=sample(),local=sample(),remote=sample();local.childDrafts.a.note='タブレット';remote.childDrafts.a.note='PC';
  assert.deepEqual(reconcileRecordDraft(base,local,remote).conflicts,['childDrafts.a.note']);
  const deleted=sample() as any;delete deleted.childDrafts.a;
  assert.ok(reconcileRecordDraft(base,deleted,remote).conflicts.length);
  local.childDrafts.a.values=['欠席'];remote.childDrafts.a.values=['出席','別項目'];assert.ok(reconcileRecordDraft(base,local,remote).conflicts.includes('childDrafts.a.values'));
});
test('legacy local drafts never silently override unknown cloud edits; identical content is clean', () => {
  const local=sample(),remote=sample();remote.childDrafts.a.note='最新PC入力';
  assert.deepEqual(reconcileRecordDraft(null,local,remote).conflicts,['unknown-baseline']);
  assert.equal(reconcileRecordDraft(null,local,sample()).dirty,false);
});
test('navigation and object key order do not create a write or mask content changes', () => {
  const a=sample(),b={...a,currentStepIndex:9,updatedAt:'2000-01-01',__cloudSync:{revision:4}};
  assert.equal(sameDraftContent(a,b),true);b.childDrafts=structuredClone(a.childDrafts);b.childDrafts.a.note='新規';assert.equal(sameDraftContent(a,b),false);
});
test('removing the active child selects a remaining child instead of reviving it', () => {
  const base=sample(), remote=sample();remote.selectedChildIds=['b'];delete (remote.childDrafts as any).a;remote.activeChildId='b';
  const result=reconcileRecordDraft(base,sample(),remote);assert.deepEqual(result.conflicts,[]);assert.equal(result.payload.activeChildId,'b');assert.equal('a' in result.payload.childDrafts,false);
});
