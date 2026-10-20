// Live transport check, isolated fictional organization only. Never modifies existing people or requests.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { clients, supportRef, lessonRef } from './lesson-operation-client.mjs';
if (!process.argv.includes('--run-fictional-test')) throw Error('Explicit fictional-test flag required');
const { support, lesson } = clients(), org = randomUUID(), run = randomUUID(), requestId = randomUUID(), linkId = randomUUID();
const childId = `word-notice-check-${run}`, studentId = `student_notice_${run}`, campus = `notice-check-${run}`;
const email = `notice-check-${run}@example.invalid`, password = randomBytes(32).toString('hex');
let staffId = '', recorderId = '';
const ok = r => { if (r.error) throw Error(`Fictional check failed (${r.error.code || 'API'}); sensitive output withheld`); return r.data; };
const call = async action => {
  const result = await support.functions.invoke('lesson-learning', { body: { action } });
  if (result.error) {
    const status = result.error.context?.status;
    let reason = 'unavailable';
    try { const body = await result.error.context.clone().json(); if (typeof body.error === 'string') reason = body.error; } catch {}
    throw Error(`Fictional endpoint ${action}: HTTP ${status || 'network'}: ${reason}`);
  }
  return result.data;
};
try {
  ok(await support.from('organizations').insert({ id: org, name: '架空・Word通知検証事業所' }));
  ok(await support.from('member_invitations').insert({ organization_id: org, email, role: 'admin' }));
  staffId = ok(await support.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: '架空・通知検証職員' } })).user.id;
  ok(await support.from('profiles').upsert({ id: staffId, organization_id: org, email, display_name: '架空・通知検証職員', role: 'admin', active: true }));
  recorderId = ok(await support.from('profiles').select('recorder_profile_id').eq('id', staffId).single()).recorder_profile_id;
  // The service client now uses this fictional user's JWT only for calls; separate
  // admin clients below retain their service credentials for scoped setup/cleanup.
  ok(await support.auth.signInWithPassword({ email, password }));
  const { support: setup } = clients();
  ok(await setup.from('children').insert({ id: childId, organization_id: org, name: '架空・通知検証児童' }));
  ok(await setup.from('lesson_child_links').insert({ id: linkId, organization_id: org, child_id: childId,
    source_project_ref: lessonRef, source_table: 'user_data', source_student_id: studentId, source_campus_id: campus,
    source_display_name: '架空・通知検証児童', active: true, verified_by: staffId }));
  ok(await lesson.from('lesson_support_scopes').insert({ support_project_ref: supportRef, organization_id: org, data_table: 'user_data', campus_id: campus, enabled: true }));
  ok(await lesson.from('lesson_support_students').insert({ support_project_ref: supportRef, organization_id: org, data_table: 'user_data', campus_id: campus, student_id: studentId, enabled: true, support_link_id: linkId, support_child_id: childId }));
  ok(await lesson.from('user_data').insert({ id: studentId, data: { campusId: campus, displayName: '架空・通知検証児童' } }));
  ok(await lesson.from('lesson_word_requests').insert({ id: requestId, data_table: 'user_data', student_id: studentId, stage_id: 'w_b1_1', support_project_ref: supportRef,
    organization_id: org, link_id: linkId, child_id: childId, page: '1', file_path: `fictional-notice/${requestId}.pdf`, file_type: 'application/pdf', file_size: 1, status: 'pending', submitted_at: new Date().toISOString() }));
  const started = Date.now(), result = await call('word-inbox');
  assert.deepEqual(result.requests.map(r => r.id), [requestId]);
  assert.equal(result.canReviewWord, true);
  const adminDurationMs = Date.now() - started;
  ok(await setup.from('profiles').update({ role: 'manager' }).eq('id', staffId).eq('organization_id', org));
  const managerStarted = Date.now(), managerResult = await call('word-inbox');
  assert.deepEqual(managerResult.requests.map(r => r.id), [requestId]);
  console.log(JSON.stringify({ passed: true, liveWordInbox: true, managerWordInbox: true, fictionalOrganizationOnly: true,
    existingRecordsChanged: false, adminDurationMs, managerDurationMs: Date.now() - managerStarted }));
} finally {
  // Every deletion is bound to generated fixture IDs/the generated organization.
  await support.auth.signOut({ scope: 'local' });
  const { support: cleanup } = clients();
  const failed = [];
  const clean = async (label, task) => { try { ok(await task()); } catch { failed.push(label); } };
  await clean('request', () => lesson.from('lesson_word_requests').delete().eq('id', requestId).eq('organization_id', org));
  await clean('permission', () => lesson.from('lesson_support_students').delete().eq('student_id', studentId).eq('organization_id', org));
  await clean('scope', () => lesson.from('lesson_support_scopes').delete().eq('organization_id', org).eq('campus_id', campus));
  await clean('learner', () => lesson.from('user_data').delete().eq('id', studentId));
  await clean('link-audit', () => cleanup.from('lesson_link_audit').delete().eq('organization_id', org));
  await clean('link', () => cleanup.from('lesson_child_links').delete().eq('id', linkId).eq('organization_id', org));
  await clean('child', () => cleanup.from('children').delete().eq('id', childId).eq('organization_id', org));
  if (staffId) await clean('auth', () => cleanup.auth.admin.deleteUser(staffId));
  if (recorderId) await clean('recorder', () => cleanup.from('recorder_profiles').delete().eq('id', recorderId).eq('organization_id', org));
  await clean('invitation', () => cleanup.from('member_invitations').delete().eq('organization_id', org).eq('email', email));
  await clean('audit', () => cleanup.from('audit_logs').delete().eq('organization_id', org));
  await clean('organization', () => cleanup.from('organizations').delete().eq('id', org));
  if (failed.length) throw Error(`Fictional fixture cleanup needs attention: ${failed.join(', ')}; organization ${org}`);
  console.log(JSON.stringify({ fictionalFixturesRemoved: true }));
}
