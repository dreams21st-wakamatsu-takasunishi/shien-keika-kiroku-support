import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTimedAccountCheck, parseAccountAudits } from '../learning/accounts';
const link = { id: '11111111-1111-4111-8111-111111111111', child_id: 'child-test', source_project_ref: 'abcdefghijklmnopqrst', source_student_id: 'student_test', source_table: 'user_data', source_campus_id: 'main' };
const fixture = () => ({ schemaVersion: 1, childId: link.child_id, linkId: link.id,
  identity: { sourceProjectRef: link.source_project_ref, studentId: link.source_student_id, dataTable: link.source_table, campusId: 'main', displayName: '架空児童', birthDate: '' },
  account: { status: 'ready', authCount: 1, loginNumber: '19' }, card: { verified: true, loginNumber: '19', loginUrl: 'https://dreams21st-wakamatsu-takasunishi.github.io/d-lesson-v4/?campus=main' },
  checkedAt: '2026-10-08T01:00:00Z', expiresAt: '2026-10-08T01:10:00Z',
});
test('account checks strip secrets, Auth IDs and raw account properties', () => {
  const source = fixture(); const result = parseTimedAccountCheck({ ...source, passcode: 'SECRET', account: { ...source.account, email: 'SECRET', authUserId: 'SECRET' } }, link);
  assert.equal(result.card?.verified, true); assert(!JSON.stringify(result).includes('SECRET'));
});
test('another child, source, student, table, campus or link cannot receive a card', () => {
  for (const patch of [{ childId: 'other' }, { linkId: 'other' }, { identity: { ...fixture().identity, studentId: 'student_other' } },
    { identity: { ...fixture().identity, campusId: 'other' } }, { identity: { ...fixture().identity, dataTable: 'test_user_data' } }]) assert.throws(() => parseTimedAccountCheck({ ...fixture(), ...patch }, link));
});
test('unverified/mismatched password results cannot become cards', () => {
  for (const patch of [{ card: { ...fixture().card, verified: false } }, { card: { ...fixture().card, loginNumber: '20' } },
    { account: { ...fixture().account, status: 'review' } }, { account: { ...fixture().account, authCount: 0 } }]) assert.throws(() => parseTimedAccountCheck({ ...fixture(), ...patch }, link));
});
test('URLs cannot leak credentials or navigate away from Dlesson', () => {
  for (const url of ['https://evil.example/d-lesson-v4/', 'https://dreams21st-wakamatsu-takasunishi.github.io/d-lesson-v4/?passcode=123456',
    'https://dreams21st-wakamatsu-takasunishi.github.io/d-lesson-v4/?campus=main&campus=other', 'https://dreams21st-wakamatsu-takasunishi.github.io/other/',
    'https://user:secret@dreams21st-wakamatsu-takasunishi.github.io/d-lesson-v4/', 'https://dreams21st-wakamatsu-takasunishi.github.io/d-lesson-v4/#secret']) {
    assert.throws(() => parseTimedAccountCheck({ ...fixture(), card: { ...fixture().card, loginUrl: url } }, link));
  }
});
test('expiry must be positive and no more than ten minutes', () => {
  for (const expiresAt of [null, 'bad', '2026-10-08T00:59:59Z', '2026-10-08T01:10:01Z']) assert.throws(() => parseTimedAccountCheck({ ...fixture(), expiresAt }, link));
  const source = fixture(); assert.equal(parseTimedAccountCheck({ ...source, card: null, expiresAt: null }, link).card, null);
});
test('audit rows are bounded and do not relay passwords or arbitrary actions', () => {
  const row = { id: link.id, action: 'verify-card', outcome: 'verified', at: fixture().checkedAt, passcode: 'SECRET' };
  assert(!JSON.stringify(parseAccountAudits([row])).includes('SECRET'));
  assert.throws(() => parseAccountAudits(Array(11).fill(row))); assert.throws(() => parseAccountAudits([{ ...row, action: 'delete-user' }]));
});
