import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraftWriteQueue, planRecordSave, removeSavedDraftChildren } from './recordSaveWorkflow';
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
