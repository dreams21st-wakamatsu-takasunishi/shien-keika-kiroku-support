import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHandoffResult, parseRegistrationConfig, registrationRecoveryAvailability } from '../src/learning/studentRegistration.ts';
const original = '11111111-1111-4111-8111-111111111111', admin = '22222222-2222-4222-8222-222222222222', now = Date.now();
const row = { actor_id: original, executor_id: null, phase: 'source-created', lease_until: null };
test('only another admin may take an idle pending registration', () => {
  assert.deepEqual(registrationRecoveryAvailability(row, admin, true, true, now), { canResume: false, canTakeOver: true });
  for (const args of [[admin, false, true], [admin, true, false], [original, true, true]]) assert.equal(registrationRecoveryAvailability(row, ...args, now).canTakeOver, false);
  for (const phase of ['completed', 'denied', 'unknown']) assert.equal(registrationRecoveryAvailability({ ...row, phase }, admin, true, true, now).canTakeOver, false);
  assert.equal(registrationRecoveryAvailability({ ...row, lease_until: new Date(now + 10000).toISOString() }, admin, true, true, now).canTakeOver, false);
});
test('delegation replaces only the executor and fails closed after role or identity changes', () => {
  const delegated = { ...row, executor_id: admin };
  assert.deepEqual(registrationRecoveryAvailability(delegated, admin, true, true, now), { canResume: true, canTakeOver: false });
  assert.equal(registrationRecoveryAvailability(delegated, original, true, true, now).canResume, false);
  assert.equal(registrationRecoveryAvailability(delegated, admin, false, true, now).canResume, false);
  assert.equal(registrationRecoveryAvailability(delegated, admin, true, false, now).canResume, false);
  assert.equal(registrationRecoveryAvailability({ ...delegated, phase: 'completed', finished_at: new Date(now - 86400001).toISOString() }, admin, true, true, now).canResume, false);
});
test('handoff response must bind request operation child and next revision', () => {
  const result = { schemaVersion: 1, childId: 'fixture', operationId: original, requestId: admin, revision: 1 };
  assert.deepEqual(parseHandoffResult(result, 'fixture', original, admin, 0), { operationId: original, requestId: admin, revision: 1 });
  for (const patch of [{ schemaVersion: 2 }, { childId: 'other' }, { operationId: admin }, { requestId: original }, { revision: 0 }, { revision: 2 }]) assert.throws(() => parseHandoffResult({ ...result, ...patch }, 'fixture', original, admin, 0));
});
test('configuration rejects unsafe takeover flags revisions and exposes no actor IDs', () => {
  const operation = { id: original, campusId: 'main', phase: 'source-created', at: new Date().toISOString(), canResume: false, canTakeOver: true, handoffRevision: 0 };
  const config = { sourceProject: 'abcdefghijklmnopqrst', fingerprint: 'a'.repeat(64), name: '架空児童', birthDate: '2018-01-01', allowNew: false, campuses: [{ id: 'main', name: '本校' }], operations: [operation] };
  assert.deepEqual(parseRegistrationConfig({ ...config, operations: [{ ...operation, actor_id: original, passcode: 'secret' }] }).operations, [operation]);
  for (const patch of [{ canResume: true }, { phase: 'completed' }, { phase: 'denied' }, { handoffRevision: -1 }, { handoffRevision: 0.5 }, { canTakeOver: undefined }]) assert.throws(() => parseRegistrationConfig({ ...config, operations: [{ ...operation, ...patch }] }));
});
