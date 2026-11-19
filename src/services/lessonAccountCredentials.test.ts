import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCredentialResult, parseCredentialOperations } from '../learning/accountCredentials';

test('chosen passcode requires a matching custom receipt and preserves leading zeroes', () => {
  const raw = { ...fixture(), customPasscode: true, card: { ...fixture().card, passcode: '069513' } };
  assert.equal(parseCredentialResult(raw, link, id, 'reset', true, '069513').passcode, '069513');
  assert.throws(() => parseCredentialResult(raw, link, id, 'reset', true, '069514'));
  assert.throws(() => parseCredentialResult(raw, link, id, 'reset'));
  assert.throws(() => parseCredentialResult(fixture(), link, id, 'reset', true, '0123456789'));
});
const id = '11111111-1111-4111-8111-111111111111';
const link = { id, organization_id: id, child_id: 'child-test', source_project_ref: 'abcdefghijklmnopqrst', source_student_id: 'student_test', source_table: 'user_data', source_campus_id: 'main', source_display_name: '架空児童', active: true, revision: 1, verified_at: '2026-10-08T00:00:00Z' };
const fixture = () => ({ schemaVersion: 1, operationId: id, action: 'reset', childId: link.child_id, linkId: link.id,
  identity: { sourceProjectRef: link.source_project_ref, studentId: link.source_student_id, dataTable: 'user_data', campusId: 'main', displayName: '架空児童', birthDate: '' },
  account: { status: 'ready', authCount: 1, loginNumber: '19' }, card: { verified: true, loginNumber: '19', loginUrl: 'https://dreams21st-wakamatsu-takasunishi.github.io/d-lesson-v4/?campus=main', passcode: '0123456789' },
  checkedAt: '2026-10-08T01:00:00Z', expiresAt: '2026-10-08T01:10:00Z',
});
test('new credentials are bound to operation/action/child and preserve leading zero', () => {
  const result = parseCredentialResult({ ...fixture(), authUserId: 'SECRET', email: 'SECRET' }, link, id, 'reset');
  assert.equal(result.passcode, '0123456789'); assert(!JSON.stringify(result).includes('SECRET'));
  for (const patch of [{ operationId: 'other' }, { action: 'issue' }, { childId: 'other' }, { linkId: 'other' }]) assert.throws(() => parseCredentialResult({ ...fixture(), ...patch }, link, id, 'reset'));
});
test('unverified, malformed, expired-duration and oversized mutation results are rejected', () => {
  for (const patch of [{ card: { ...fixture().card, passcode: '12345' } }, { card: { ...fixture().card, verified: false } },
    { account: { ...fixture().account, authCount: 11 } }, { expiresAt: '2026-10-08T01:10:01Z' }, { expiresAt: null }]) assert.throws(() => parseCredentialResult({ ...fixture(), ...patch }, link, id, 'reset'));
});
test('six-digit cards and verified same-child login aliases are accepted',()=>{
 const raw={...fixture(),account:{...fixture().account,authCount:2},card:{...fixture().card,passcode:'001234'}};
 assert.equal(parseCredentialResult(raw,link,id,'reset').passcode,'001234');
});
test('credential card cannot send a password in QR or use another source', () => {
  assert.throws(() => parseCredentialResult({ ...fixture(), card: { ...fixture().card, loginUrl: fixture().card.loginUrl + '&passcode=0123456789' } }, link, id, 'reset'));
  assert.throws(() => parseCredentialResult({ ...fixture(), identity: { ...fixture().identity, studentId: 'student_other' } }, link, id, 'reset'));
});
test('operation receipts strip secrets and cannot resume denied operations', () => {
  const row = { id, action: 'reset', status: 'requested', at: fixture().checkedAt, finishedAt: null, canResume: true, passcode: 'SECRET', actor_id: 'SECRET' };
  assert(!JSON.stringify(parseCredentialOperations([row])).includes('SECRET'));
  assert.throws(() => parseCredentialOperations([{ ...row, status: 'denied' }])); assert.throws(() => parseCredentialOperations(Array(21).fill(row)));
});
