import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { clients, cli, sql, lessonRoot, lessonRef, supportRef, orgId } from './lesson-operation-client.mjs';
import { parseTimedAccountCheck } from '../src/learning/accounts.ts';
if (!process.argv.includes('--run-fictional-test')) throw Error('Use --run-fictional-test to create/remove isolated account verification fixtures');
const { support, lesson } = clients(), run = randomUUID(), childId = `child-account-${run}`, studentId = `student_account_${run}`;
const check = result => { if (result.error) throw Error('Live account test operation failed; sensitive output withheld'); return result.data; };
const keys = ref => JSON.parse(cli(['projects', 'api-keys', '--project-ref', ref, '--reveal', '-o', 'json'])).find(row => row.name === 'anon').api_key;
const staff = createClient(`https://${supportRef}.supabase.co`, keys(supportRef), { auth: { persistSession: false, autoRefreshToken: false } });
let staffId, recorderId, invitationId, studentAuthId;
const snapshot = () => sql("select id,md5(data::text) as hash,(select jsonb_object_agg(key,md5(value::text)) from jsonb_each(data)) as fields from public.user_data;", lessonRoot).rows;
const before = snapshot(), call = body => staff.functions.invoke('lesson-accounts', { body });
try {
  const email = `account-check-${run}@example.com`, password = randomBytes(24).toString('hex');
  invitationId = check(await support.from('member_invitations').insert({ id: randomUUID(), organization_id: orgId, email, role: 'admin' }).select('id').single()).id;
  staffId = check(await support.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'アカウント・架空試験職員' } })).user.id;
  check(await support.from('profiles').upsert({ id: staffId, organization_id: orgId, display_name: 'アカウント・架空試験職員', email, role: 'admin', active: true }));
  recorderId = check(await support.from('profiles').select('recorder_profile_id').eq('id', staffId).single()).recorder_profile_id;
  check(await staff.auth.signInWithPassword({ email, password }));
  check(await support.from('children').insert({ id: childId, organization_id: orgId, name: `架空児童・アカウント試験-${run}`, birth_date: '2018-01-01' }));
  const existingEmails = sql("select email from auth.users where email like 'dlesson-student-%@dlesson.example.com';", lessonRoot).rows.map(row => row.email);
  const number = Array.from({ length: 11 }, (_, i) => 50 - i).find(n => !existingEmails.includes(`dlesson-student-main-${String(n).padStart(3, '0')}@dlesson.example.com`)
    && !existingEmails.includes(`dlesson-student-${String(n).padStart(3, '0')}@dlesson.example.com`));
  assert(number, 'No unused classroom number available for an isolated fixture');
  const studentEmail = `dlesson-student-main-${String(number).padStart(3, '0')}@dlesson.example.com`, passcode = '864291', wrong = '864292';
  studentAuthId = check(await lesson.auth.admin.createUser({ email: studentEmail, password: passcode, email_confirm: true,
    user_metadata: { user_data_id: studentId, campus_id: 'main', login_number: String(number) } })).user.id;
  const data = { displayName: `架空児童・アカウント試験-${run}`, campusId: 'main', birthdate: '2018-01-01', mouseLevel: 0, keyboardSequence: 0,
    authUserId: studentAuthId, loginNumber: String(number), coins: 19, practiceLogs: [] };
  check(await lesson.from('user_data').insert({ id: studentId, data }));
  check(await lesson.from('lesson_user_access').insert({ auth_user_id: studentAuthId, user_data_id: studentId, role: 'student', scope_type: 'all', scope_value: '' }));
  check(await lesson.from('lesson_support_students').insert({ support_project_ref: supportRef, organization_id: orgId, data_table: 'user_data', campus_id: 'main', student_id: studentId, enabled: true }));
  const inspected = check(await staff.functions.invoke('lesson-learning', { body: { action: 'inspect', childId, studentId } }));
  const { link } = check(await staff.functions.invoke('lesson-learning', { body: { action: 'link', childId, studentId, fingerprint: inspected.fingerprint, confirmed: true } }));
  const initial = parseTimedAccountCheck(check(await call({ action: 'inspect', childId })), link); assert.equal(initial.account.status, 'ready'); assert.equal(initial.card, null);
  const verified = check(await call({ action: 'verify-card', childId, passcode, confirmed: true }));
  const card = parseTimedAccountCheck(verified, link); assert(card.card?.verified); assert.equal(card.card.loginNumber, String(number)); assert.equal(new URL(card.card.loginUrl).searchParams.get('campus'), 'main');
  assert(!JSON.stringify(verified).includes(passcode)); assert.equal((await call({ action: 'verify-card', childId, passcode: wrong, confirmed: true })).error?.context.status, 400);
  check(await lesson.from('lesson_user_access').update({ role: 'admin' }).eq('auth_user_id', studentAuthId).eq('user_data_id', studentId));
  const unsafe = parseTimedAccountCheck(check(await call({ action: 'inspect', childId })), link); assert.equal(unsafe.account.status, 'review');
  check(await lesson.from('lesson_user_access').update({ role: 'student' }).eq('auth_user_id', studentAuthId).eq('user_data_id', studentId));
  check(await support.from('profiles').update({ role: 'staff' }).eq('id', staffId));
  assert.equal((await call({ action: 'inspect', childId })).error?.context.status, 403);
  check(await support.from('profiles').update({ role: 'admin', active: false }).eq('id', staffId));
  assert.equal((await call({ action: 'inspect', childId })).error?.context.status, 403);
  check(await support.from('profiles').update({ active: true }).eq('id', staffId));
  assert.equal((await call({ action: 'inspect', childId: `other-${run}` })).error?.context.status, 403);
  for (let i = 0; i < 3; i++) assert.equal((await call({ action: 'verify-card', childId, passcode: wrong, confirmed: true })).error?.context.status, 400);
  assert.equal((await call({ action: 'verify-card', childId, passcode, confirmed: true })).error?.context.status, 429);
  const audit = check(await call({ action: 'audit', childId })); assert(audit.audits.some(row => row.outcome === 'verified') && audit.audits.some(row => row.outcome === 'denied'));
  const sourceAudits = check(await lesson.from('lesson_support_account_checks').select('*').eq('student_id', studentId));
  assert(!JSON.stringify(sourceAudits).includes(passcode) && !JSON.stringify(audit).includes(passcode));
  const student = createClient(`https://${lessonRef}.supabase.co`, keys(lessonRef), { auth: { persistSession: false, autoRefreshToken: false } });
  check(await student.auth.signInWithPassword({ email: studentEmail, password: passcode }));
  assert.deepEqual(check(await student.from('user_data').select('data').eq('id', studentId).single()).data, data); await student.auth.signOut({ scope: 'local' });
  check(await lesson.from('lesson_support_students').update({ enabled: false }).eq('student_id', studentId).eq('organization_id', orgId).eq('support_project_ref', supportRef));
  assert.equal((await call({ action: 'inspect', childId })).error?.context.status, 403);
  console.log('PASS: deployed Auth diagnosis, verified card, wrong-passphrase denial, five-attempt cap, dedicated permission, inactive/foreign/revoked denial, no persisted secret and unchanged password/learning record');
} finally {
  const errors = [], clean = async (fn, label) => { try { await fn(); } catch { errors.push(label); } };
  await clean(async () => check(await support.from('lesson_account_audit').delete().eq('organization_id', orgId).eq('child_id', childId)), 'support-audit');
  await clean(async () => check(await lesson.from('lesson_support_account_checks').delete().eq('support_project_ref', supportRef).eq('organization_id', orgId).eq('student_id', studentId)), 'source-audit');
  const links = await support.from('lesson_child_links').select('id').eq('organization_id', orgId).eq('child_id', childId);
  if (links.error) errors.push('link-read');
  for (const link of links.data || []) await clean(async () => check(await support.from('lesson_link_audit').delete().eq('organization_id', orgId).eq('link_id', link.id)), 'link-audit');
  await clean(async () => check(await support.from('lesson_child_links').delete().eq('organization_id', orgId).eq('child_id', childId)), 'link');
  await clean(async () => check(await lesson.from('lesson_support_students').delete().eq('student_id', studentId).eq('organization_id', orgId).eq('support_project_ref', supportRef)), 'permission');
  if (studentAuthId) await clean(async () => check(await lesson.auth.admin.deleteUser(studentAuthId)), 'student-auth');
  await clean(async () => check(await lesson.from('user_data').delete().eq('id', studentId)), 'learning-data');
  await clean(async () => check(await support.from('children').delete().eq('id', childId).eq('organization_id', orgId)), 'child');
  if (staffId) await clean(async () => check(await support.auth.admin.deleteUser(staffId)), 'staff-auth');
  if (recorderId) await clean(async () => check(await support.from('recorder_profiles').delete().eq('id', recorderId).eq('organization_id', orgId)), 'recorder');
  if (invitationId) await clean(async () => check(await support.from('member_invitations').delete().eq('id', invitationId).eq('organization_id', orgId)), 'invitation');
  if (errors.length) throw Error(`Fictional cleanup requires attention: ${errors.join(', ')}; test ${run}`);
  const after = snapshot(), protectedFields = ['authUserId', 'loginNumber', 'campusId', 'campus', 'userDataId', 'displayName', 'birthdate', 'birth'];
  const mutableFields = new Set(['coins', 'practiceLogs', 'loginStamps', 'mouseLevel', 'keyboardSequence', 'examRecords', 'wordProgress', 'visionCleared', 'textRecords', 'globalMistakes', 'items', 'tickets', 'activeEffect']);
  const changedFields = new Set(); let changedRecords = 0;
  for (const row of before) {
    const current = after.find(item => item.id === row.id); assert(current, 'An operational learning record disappeared; no automatic restoration');
    for (const field of protectedFields) assert.equal(current.fields?.[field], row.fields?.[field], 'Operational account mapping/profile changed during the test; no automatic restoration');
    if (row.hash !== current.hash) {
      changedRecords++;
      for (const field of new Set([...Object.keys(row.fields || {}), ...Object.keys(current.fields || {})])) {
        if (row.fields?.[field] !== current.fields?.[field]) changedFields.add(mutableFields.has(field) ? field : 'other-learning-field');
      }
    }
  }
  console.log(JSON.stringify({ fictionalFixturesRemoved: true, operationalAccountMappingUnchanged: true, concurrentLearningUpdates: changedRecords, changedLearningFields: [...changedFields], privateIdentitiesPrinted: false }));
  if (!changedRecords) console.log('PASS: all operational learning records unchanged');
}
