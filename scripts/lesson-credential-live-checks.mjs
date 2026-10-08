import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseCredentialResult } from '../src/learning/accountCredentials.ts';

export async function runCredentialChecks({ staff, support, lesson, student, link, data, email, passcode, authId, staffId, check, rememberAuth }) {
  const call = (action, id, extra = {}) => staff.functions.invoke('lesson-account-credentials', { body: { action, operationId: id, childId: link.child_id, revision: link.revision, confirmed: true, ...extra } });
  const initialAuth = authId, resetId = randomUUID();
  check(await support.from('profiles').update({ role: 'staff' }).eq('id', staffId));
  assert.equal((await call('reset', resetId)).error?.context.status, 403);
  check(await support.from('profiles').update({ role: 'admin' }).eq('id', staffId));
  assert.equal((await call('reset', resetId, { confirmed: false })).error?.context.status, 400);
  assert.equal((await call('reset', resetId, { revision: link.revision + 1 })).error?.context.status, 409);
  assert.equal((await call('reset', resetId, { childId: 'child-foreign-fixture' })).error?.context.status, 403);
  const reset = parseCredentialResult(check(await call('reset', resetId)), link, resetId, 'reset');
  assert.notEqual(reset.passcode, passcode);
  const resetData = check(await lesson.from('user_data').select('data').eq('id', link.source_student_id).single()).data;
  assert.equal(resetData.authUserId, initialAuth);
  const withoutIssued = value => { const { authUserId, authPasscodeIssuedAt, ...learning } = value; return learning; };
  assert.deepEqual(withoutIssued(resetData), withoutIssued(data));
  assert((await student.auth.signInWithPassword({ email, password: passcode })).error, 'old fixture passphrase must fail');
  check(await student.auth.signInWithPassword({ email, password: reset.passcode }));
  assert.equal(check(await student.from('user_data').select('id').eq('id', link.source_student_id).single()).id, link.source_student_id);
  const otherRows = check(await student.from('user_data').select('id').neq('id', link.source_student_id));
  assert(otherRows.every(row => row.id === '__GLOBAL_SETTINGS__'), 'only the shared settings row may be readable besides the own learner');
  check(await student.auth.signOut({ scope: 'local' }));
  const replay = parseCredentialResult(check(await call('reset', resetId)), link, resetId, 'reset');
  assert.equal(replay.passcode, reset.passcode);
  assert.deepEqual(check(await lesson.from('user_data').select('data').eq('id', link.source_student_id).single()).data, resetData);
  const newerId = randomUUID(), newer = parseCredentialResult(check(await call('reset', newerId)), link, newerId, 'reset');
  assert.notEqual(newer.passcode, reset.passcode);
  assert.equal((await call('reset', resetId)).error?.context.status, 409, 'superseded receipt must not roll back the password');
  check(await student.auth.signInWithPassword({ email, password: newer.passcode })); check(await student.auth.signOut({ scope: 'local' }));
  // Only this fixture loses its Auth, simulating an already linked child awaiting initial issuance.
  check(await lesson.auth.admin.deleteUser(initialAuth));
  const missing = { ...data }; delete missing.authUserId;
  check(await lesson.from('user_data').update({ data: missing }).eq('id', link.source_student_id));
  const duplicateId = `${link.source_student_id}_collision`;
  try {
    check(await lesson.from('user_data').insert({ id: duplicateId, data: { ...missing, displayName: '架空児童・番号重複試験' } }));
    assert.equal((await call('issue', randomUUID())).error?.context.status, 409, 'duplicate classroom number must block issuance');
  } finally { check(await lesson.from('user_data').delete().eq('id', duplicateId)); }
  const collisionAuth = check(await lesson.auth.admin.createUser({ email, password: passcode, email_confirm: true, user_metadata: { user_data_id: link.source_student_id } })).user.id;
  rememberAuth(collisionAuth);
  assert.equal((await call('issue', randomUUID())).error?.context.status, 409, 'an orphan Auth at the email must never be adopted implicitly');
  check(await lesson.auth.admin.deleteUser(collisionAuth));
  const issueId = randomUUID(), issue = parseCredentialResult(check(await call('issue', issueId)), link, issueId, 'issue');
  const issuedData = check(await lesson.from('user_data').select('data').eq('id', link.source_student_id).single()).data;
  authId = issuedData.authUserId; rememberAuth(authId);
  assert(authId && authId !== initialAuth); assert.deepEqual(withoutIssued(issuedData), withoutIssued(data));
  const issueReplay = parseCredentialResult(check(await call('issue', issueId)), link, issueId, 'issue');
  assert.equal(issueReplay.passcode, issue.passcode);
  assert.equal(check(await lesson.from('lesson_user_access').select('auth_user_id').eq('user_data_id', link.source_student_id)).length, 1);
  assert.equal((await call('issue', randomUUID())).error?.context.status, 409, 'existing Auth cannot be issued twice');
  // Reproduce the durable cut point after Auth creation, before access/data completion.
  check(await lesson.from('lesson_user_access').delete().eq('auth_user_id', authId).eq('user_data_id', link.source_student_id));
  check(await lesson.from('user_data').update({ data: missing }).eq('id', link.source_student_id));
  check(await lesson.from('lesson_support_account_operations').update({ phase: 'auth-ready', finished_at: null }).eq('id', issueId).eq('student_id', link.source_student_id));
  check(await support.from('lesson_credential_operations').update({ status: 'requested', finished_at: null }).eq('id', issueId).eq('child_id', link.child_id));
  assert.equal((await call('issue', randomUUID())).error?.context.status, 409, 'unresolved receipt blocks another operation');
  const recovered = parseCredentialResult(check(await call('issue', issueId)), link, issueId, 'issue');
  assert.equal(recovered.passcode, issue.passcode);
  const recoveredData = check(await lesson.from('user_data').select('data').eq('id', link.source_student_id).single()).data;
  assert.equal(recoveredData.authUserId, authId); assert.deepEqual(withoutIssued(recoveredData), withoutIssued(data));
  check(await student.auth.signInWithPassword({ email, password: recovered.passcode })); check(await student.auth.signOut({ scope: 'local' }));
  const receipts = check(await staff.functions.invoke('lesson-account-credentials', { body: { action: 'operations', childId: link.child_id } }));
  const sourceReceipts = check(await lesson.from('lesson_support_account_operations').select('*').eq('student_id', link.source_student_id));
  for (const secret of [reset.passcode, newer.passcode, issue.passcode]) {
    assert(!JSON.stringify(receipts).includes(secret)); assert(!JSON.stringify(sourceReceipts).includes(secret));
  }
  check(await lesson.from('lesson_support_students').update({ enabled: false }).eq('student_id', link.source_student_id).eq('organization_id', link.organization_id));
  assert.equal((await call('reset', randomUUID())).error?.context.status, 403);
  console.log('PASS: isolated live issuance/reset, dedicated permission, confirmation/revision/foreign-child denial, unchanged learning and Auth on reset, own-only RLS, number/email collision denial, idempotent replay, superseded-password protection, partial-issuance recovery, pending-operation guard, revoked-source denial and no persisted passwords');
}
