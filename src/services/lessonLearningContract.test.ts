import test from 'node:test';
import assert from 'node:assert/strict';
import { identityFingerprint, isServiceDate, isStudentId, parseHistory, parseIdentity } from '../learning/contracts';

const project = 'abcdefghijklmnopqrst';
const identity = { sourceProjectRef: project, dataTable: 'user_data' as const, studentId: 'student_test', campusId: 'main', displayName: 'テスト児童', birthDate: '2018-01-01' };
const link = { source_project_ref: project, source_table: 'user_data', source_student_id: 'student_test', source_campus_id: 'main' };
const event = { id: 'event1', at: '2026-09-29T15:01:00Z', category: 'mouse', title: 'M-1', detail: 'クリア', amount: 'ステージをクリア' };
const history = { schemaVersion: 1, identity, date: '2026-09-30', events: [event], historyComplete: false };

test('learning links accept internal IDs, not names or guest/system IDs', () => {
  assert.ok(isStudentId('student_123-abc'));
  for (const value of ['児童名', '__GUEST_USER__', 'Master_Debug', '', 'student_' + 'a'.repeat(141), null]) assert.equal(isStudentId(value), false);
});
test('learning dates reject impossible dates and accept leap years', () => {
  assert.ok(isServiceDate('2024-02-29'));
  for (const value of ['2026-02-29', '2026-09-31', '2026-9-30', '2026-09-30T00:00:00Z']) assert.equal(isServiceDate(value), false);
});
test('identity requires the configured project and excludes public campus', () => {
  assert.deepEqual(parseIdentity({ ...identity, email: 'not-exported' }, project), identity);
  for (const patch of [{ campusId: 'public' }, { sourceProjectRef: 'wrong' }, { dataTable: 'other' }, { displayName: '' }, { birthDate: '2018-02-31' }]) assert.throws(() => parseIdentity({ ...identity, ...patch }, project));
});
test('confirmation fingerprint changes when learner, campus, name or birthday changes', async () => {
  const original = await identityFingerprint(identity);
  assert.equal(original.length, 64);
  for (const patch of [{ studentId: 'student_other' }, { campusId: 'other' }, { displayName: '別の名前' }, { birthDate: '2019-01-01' }]) assert.notEqual(await identityFingerprint({ ...identity, ...patch }), original);
});
test('history is bound to project, student, campus, table and Japanese service date', () => {
  assert.equal(parseHistory(history, link, '2026-09-30').events.length, 1);
  for (const patch of [{ source_project_ref: 'xxxxxxxxxxxxxxxxxxxx' }, { source_student_id: 'student_other' }, { source_campus_id: 'other' }, { source_table: 'test_user_data' }]) assert.throws(() => parseHistory(history, { ...link, ...patch }, '2026-09-30'));
  assert.throws(() => parseHistory(history, link, '2026-09-29'));
  assert.throws(() => parseHistory({ ...history, events: [{ ...event, at: '2026-09-29T14:59:00Z' }] }, link, history.date));
});
test('partial/empty history stays unknown and does not claim non-participation', () => {
  const result = parseHistory({ ...history, events: [] }, link, history.date);
  assert.equal(result.historyComplete, false);
  assert.match(result.historyNotice, /未実施とは判断できません/);
  assert.throws(() => parseHistory({ ...history, historyComplete: true }, link, history.date));
});
test('duplicate, malformed and oversized results are rejected; unrelated properties are omitted', () => {
  assert.throws(() => parseHistory({ ...history, events: [event, event] }, link, history.date));
  assert.throws(() => parseHistory({ ...history, events: [{ ...event, amount: 'x'.repeat(161) }] }, link, history.date));
  assert.throws(() => parseHistory({ ...history, events: [{ ...event, at: 'invalid' }] }, link, history.date));
  const result = parseHistory({ ...history, events: [{ ...event, coins: 500, fullUserData: { email: 'private' } }] }, link, history.date);
  assert.deepEqual(result.events[0], event);
});
