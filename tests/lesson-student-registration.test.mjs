import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRegistrationConfig, parsePreparedRegistration, parseRegistrationResult, registrationFingerprint } from '../src/learning/studentRegistration.ts';
const id = '11111111-1111-4111-8111-111111111111', childId = 'fixture-child', sourceProject = 'abcdefghijklmnopqrst';
const expected = { operationId: id, childId, linkId: id, studentId: `student_support_${id.replaceAll('-', '')}`, campusId: 'main', sourceProject, name: '架空児童', birthDate: '2016-01-01' };
const config = { sourceProject, fingerprint: 'a'.repeat(64), name: expected.name, birthDate: expected.birthDate, allowNew: true, campuses: [{ id: 'main', name: '本校' }], operations: [] };
const identity = { sourceProjectRef: sourceProject, dataTable: 'user_data', studentId: expected.studentId, campusId: 'main', displayName: expected.name, birthDate: expected.birthDate };
const prepared = { schemaVersion: 1, operationId: id, childId, linkId: id, identity, loginNumber: '19' };
const link = { id, child_id: childId, organization_id: id, active: true, revision: 1, source_project_ref: sourceProject, source_table: 'user_data', source_student_id: expected.studentId, source_campus_id: 'main', source_display_name: expected.name, verified_at: new Date().toISOString() };
const credentials = () => ({ schemaVersion: 1, operationId: id, action: 'issue', childId, linkId: id, identity, account: { status: 'ready', authCount: 1, loginNumber: '19' }, card: { verified: true, loginNumber: '19', passcode: '0123456789', loginUrl: 'https://dreams21st-wakamatsu-takasunishi.github.io/d-lesson-v4/?campus=main' }, checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString() });
test('registration fingerprint changes with child identity snapshot', async () => {
  const hash = await registrationFingerprint(childId, expected.name, expected.birthDate);
  assert.match(hash, /^[a-f0-9]{64}$/);
  for (const args of [['other', expected.name, expected.birthDate], [childId, 'other', expected.birthDate], [childId, expected.name, '2015-01-01']]) assert.notEqual(await registrationFingerprint(...args), hash);
});
test('configuration validates dates campuses bounded receipts and strips extras', () => {
  assert.deepEqual(parseRegistrationConfig({ ...config, passcode: 'secret' }), config);
  for (const patch of [{ birthDate: '2026-02-30' }, { campuses: [{ id: 'public', name: 'public' }] }, { campuses: [...config.campuses, ...config.campuses] }, { campuses: Array(101).fill(config.campuses[0]) }, { operations: [{ id, campusId: 'main', phase: 'requested', at: new Date().toISOString(), canResume: true }] }]) assert.throws(() => parseRegistrationConfig({ ...config, ...patch }));
});
test('prepared identity must match every reservation field and login range', () => {
  assert.equal(parsePreparedRegistration(prepared, expected).loginNumber, '19');
  for (const patch of [{ operationId: crypto.randomUUID() }, { childId: 'other' }, { linkId: crypto.randomUUID() }, { loginNumber: '51' }, { identity: { ...identity, campusId: 'other' } }, { identity: { ...identity, birthDate: '' } }]) assert.throws(() => parsePreparedRegistration({ ...prepared, ...patch }, expected));
});
test('card result binds deterministic student child link source name birthday and time', () => {
  assert.equal(parseRegistrationResult({ link, credentials: credentials() }, childId, id, expected).credentials.passcode, '0123456789');
  for (const patch of [{ child_id: 'other' }, { revision: 2 }, { source_student_id: 'student_other' }, { source_project_ref: 'zyxwvutsrqponmlkjihg' }, { active: false }]) assert.throws(() => parseRegistrationResult({ link: { ...link, ...patch }, credentials: credentials() }, childId, id, expected));
  for (const patch of [{ identity: { ...identity, birthDate: '2015-01-01' } }, { expiresAt: new Date(Date.now() - 1).toISOString() }, { card: { ...credentials().card, loginUrl: 'https://example.com' } }]) assert.throws(() => parseRegistrationResult({ link, credentials: { ...credentials(), ...patch } }, childId, id, expected));
  assert.throws(() => parseRegistrationResult({ link, credentials: { ...credentials(), checkedAt: new Date(Date.now() - 700000).toISOString(), expiresAt: new Date(Date.now() - 100000).toISOString() } }, childId, id, expected));
});
