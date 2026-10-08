import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFetchedLessonProgress, parseLessonProgress } from '../learning/progress';

const link = { id: '22222222-2222-4222-8222-222222222222', child_id: 'child-test', source_project_ref: 'abcdefghijklmnopqrst', source_table: 'user_data', source_student_id: 'student_test', source_campus_id: 'main' };
const fixture = () => ({ schemaVersion: 1, childId: link.child_id, linkId: link.id,
  identity: { sourceProjectRef: link.source_project_ref, dataTable: link.source_table, studentId: link.source_student_id, campusId: link.source_campus_id, displayName: '架空児童', birthDate: '' },
  courses: ['mouse', 'keyboard', 'vision', 'word'].map(id => ({ id, title: id, completed: 0, total: 1, next: null, stages: [{ id: 's1', title: 'stage', status: 'pending', bestSeconds: null }] })),
  weakKeys: [{ key: 'A', count: 5 }], recentEvents: [{ id: 'e1', at: '2026-10-07T15:00:00Z', category: 'text', title: '文章入力', detail: '最近の結果', amount: '3回' }],
  account: { authIdSaved: true, loginNumber: '19', passcodeIssuedAt: null, loginVerified: false }, fetchedAt: '2026-10-08T01:00:00Z',
});
test('progress parser reconstructs bounded data and strips raw secret fields', () => {
  const source = fixture();
  const result = parseFetchedLessonProgress({ ...source, passcode: 'SECRET', authUserId: 'SECRET', account: { ...source.account, email: 'SECRET' } }, link);
  assert.equal(result.account.loginVerified, false); assert.equal(result.recentEvents.length, 1);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('rejects another child/link/student/campus/project/table', () => {
  for (const patch of [{ childId: 'other' }, { linkId: 'other' }, { identity: { ...fixture().identity, studentId: 'student_other' } },
    { identity: { ...fixture().identity, campusId: 'other' } }, { identity: { ...fixture().identity, sourceProjectRef: 'zyxwvutsrqponmlkjihg' } }, { identity: { ...fixture().identity, dataTable: 'test_user_data' } }]) {
    assert.throws(() => parseLessonProgress({ ...fixture(), ...patch }, link));
  }
});
test('unknown progress remains unknown', () => {
  const source = fixture();
  source.courses[0].completed = null as unknown as number;
  source.courses[0].stages[0].status = 'unknown';
  assert.equal(parseLessonProgress(source, link).courses[0].completed, null);
});
test('rejects contradictory counts, duplicates, missing courses, huge stages, invalid times', () => {
  for (const mutate of [
    (s: ReturnType<typeof fixture>) => { s.courses[0].completed = 2; },
    (s: ReturnType<typeof fixture>) => { s.courses[0].total = 501; },
    (s: ReturnType<typeof fixture>) => { s.courses[1].id = 'mouse'; },
    (s: ReturnType<typeof fixture>) => { s.courses.pop(); },
    (s: ReturnType<typeof fixture>) => { s.courses[0].stages[0].bestSeconds = -1 as unknown as null; },
    (s: ReturnType<typeof fixture>) => { s.courses[0].stages[0].status = 'unknown'; },
    (s: ReturnType<typeof fixture>) => { s.courses[0].next = { id: 'missing' } as unknown as null; },
  ]) { const source = fixture(); mutate(source); assert.throws(() => parseLessonProgress(source, link)); }
});
test('review recommendation may point at an already counted keyboard stage', () => {
  const source = fixture(); source.courses[1].completed = 1; source.courses[1].stages[0].status = 'current';
  source.courses[1].next = source.courses[1].stages[0] as unknown as null;
  assert.equal(parseLessonProgress(source, link).courses[1].next?.id, 's1');
});
test('rejects duplicate/arbitrary weak keys, excess recent logs and duplicate event IDs', () => {
  for (const patch of [{ weakKeys: [{ key: 'password', count: 1 }] }, { weakKeys: [{ key: 'A', count: 1 }, { key: 'A', count: 2 }] },
    { weakKeys: [{ key: 'A', count: 0 }] }, { recentEvents: Array(31).fill(fixture().recentEvents[0]) }, { recentEvents: Array(2).fill(fixture().recentEvents[0]) }]) {
    assert.throws(() => parseLessonProgress({ ...fixture(), ...patch }, link));
  }
});
test('Auth saving status cannot be misrepresented as login verification', () => {
  const source = fixture();
  assert.throws(() => parseLessonProgress({ ...source, account: { ...source.account, loginVerified: true } }, link));
  assert.throws(() => parseLessonProgress({ ...source, account: { ...source.account, loginNumber: 'secret@example.com' } }, link));
  assert.throws(() => parseFetchedLessonProgress({ ...source, fetchedAt: 'bad' }, link));
});
