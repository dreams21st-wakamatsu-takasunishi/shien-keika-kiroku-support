import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { clients, cli, sql, lessonRoot, lessonRef, supportRef, orgId } from './lesson-operation-client.mjs';
import { parseRegistrationConfig, parseRegistrationResult } from '../src/learning/studentRegistration.ts';
if (!process.argv.includes('--run-fictional-test')) throw Error('Use --run-fictional-test');
const { support, lesson } = clients(), run = randomUUID();
const check = result => { if (result.error) throw Error('Registration live check failed; sensitive output withheld'); return result.data; };
const keys = ref => JSON.parse(cli(['projects', 'api-keys', '--project-ref', ref, '--reveal', '-o', 'json'])).find(row => row.name === 'anon').api_key;
const staff = createClient(`https://${supportRef}.supabase.co`, keys(supportRef), { auth: { persistSession: false, autoRefreshToken: false } });
const fixtures = ['new', 'parallel', 'duplicate', 'cut'].map(kind => ({ child: `child-registration-${kind}-${run}`, name: `架空児童・登録${kind}-${run}`, op: randomUUID(), kind }));
const studentIds = new Set(fixtures.map(row => `student_support_${row.op.replaceAll('-', '')}`));
const duplicateStudent = `student_registration_duplicate_${run}`; studentIds.add(duplicateStudent);
let staffId, recorderId, invitationId;
const snapshot = () => sql("select id,(select jsonb_object_agg(key,md5(value::text)) from jsonb_each(data)) as fields from public.user_data;", lessonRoot).rows;
const before = snapshot();
const call = body => staff.functions.invoke('lesson-student-registration', { body });
const configuration = async fixture => parseRegistrationConfig(check(await call({ action: 'configuration', childId: fixture.child })));
const register = (fixture, config, extra = {}) => call({ action: 'register', childId: fixture.child, operationId: fixture.op, campusId: 'main', fingerprint: config.fingerprint, confirmed: true, ...extra });
try {
  const email = `registration-check-${run}@example.com`, password = randomBytes(24).toString('hex');
  invitationId = check(await support.from('member_invitations').insert({ id: randomUUID(), organization_id: orgId, email, role: 'admin' }).select('id').single()).id;
  staffId = check(await support.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: '新規登録・架空試験職員' } })).user.id;
  check(await support.from('profiles').upsert({ id: staffId, organization_id: orgId, display_name: '新規登録・架空試験職員', email, role: 'admin', active: true }));
  recorderId = check(await support.from('profiles').select('recorder_profile_id').eq('id', staffId).single()).recorder_profile_id;
  check(await staff.auth.signInWithPassword({ email, password }));
  check(await support.from('children').insert(fixtures.map(row => ({ id: row.child, organization_id: orgId, name: row.name, birth_date: '2018-01-01' }))));
  const config = await configuration(fixtures[0]); assert(config.allowNew && config.campuses.some(row => row.id === 'main')); assert(!config.campuses.some(row => row.id === 'public'));
  check(await support.from('profiles').update({ role: 'staff' }).eq('id', staffId));
  assert.equal((await configuration(fixtures[0]).then(() => ({ status: 200 }), () => ({ status: 403 }))).status, 403);
  assert.equal((await register(fixtures[0], config)).error?.context.status, 403);
  check(await support.from('profiles').update({ role: 'admin' }).eq('id', staffId));
  assert.equal((await register(fixtures[0], config, { confirmed: false })).error?.context.status, 400);
  assert.equal((await register(fixtures[0], config, { fingerprint: 'b'.repeat(64) })).error?.context.status, 409);
  assert.equal((await register(fixtures[0], config, { childId: `foreign-${run}` })).error?.context.status, 403);
  const deniedId = randomUUID();
  assert.equal((await register(fixtures[0], config, { operationId: deniedId, campusId: 'unapproved-fixture' })).error?.context.status, 403);
  // The unauthorized attempt cannot create a source learner; keep its receipt recoverable until staff review.
  check(await support.from('lesson_student_registrations').delete().eq('id', deniedId).eq('child_id', fixtures[0].child));
  const parallelConfig = await configuration(fixtures[1]);
  const results = await Promise.all([register(fixtures[0], config), register(fixtures[1], parallelConfig)]);
  const parsed = results.map((result, index) => parseRegistrationResult(check(result), fixtures[index].child, fixtures[index].op, { sourceProject: lessonRef, campusId: 'main', name: fixtures[index].name, birthDate: '2018-01-01' }));
  assert.notEqual(parsed[0].credentials.account.loginNumber, parsed[1].credentials.account.loginNumber, 'concurrent allocation must differ');
  const first = parsed[0], studentId = first.link.source_student_id;
  const learner = check(await lesson.from('user_data').select('data').eq('id', studentId).single()).data;
  assert.equal(learner.mouseLevel, 0); assert.equal(learner.keyboardSequence, 0); assert.equal(learner.coins, 0); assert.deepEqual(learner.practiceLogs, []);
  const binding = check(await lesson.from('lesson_support_students').select('support_child_id,support_link_id').eq('student_id', studentId).single());
  assert.equal(binding.support_child_id, fixtures[0].child); assert.equal(binding.support_link_id, fixtures[0].op);
  const student = createClient(`https://${lessonRef}.supabase.co`, keys(lessonRef), { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = check(await lesson.auth.admin.getUserById(learner.authUserId));
  check(await student.auth.signInWithPassword({ email: auth.user.email, password: first.credentials.passcode }));
  assert.equal(check(await student.from('user_data').select('id').eq('id', studentId).single()).id, studentId);
  assert(check(await student.from('user_data').select('id').neq('id', studentId)).every(row => row.id === '__GLOBAL_SETTINGS__'));
  check(await student.auth.signOut({ scope: 'local' }));
  const replay = parseRegistrationResult(check(await register(fixtures[0], config)), fixtures[0].child, fixtures[0].op, { sourceProject: lessonRef, campusId: 'main', name: fixtures[0].name, birthDate: '2018-01-01' });
  assert.equal(replay.credentials.passcode, first.credentials.passcode);
  assert.deepEqual(check(await lesson.from('user_data').select('data').eq('id', studentId).single()).data, learner);
  assert.equal((await register(fixtures[0], config, { operationId: randomUUID() })).error?.context.status, 409);
  assert.equal((await configuration(fixtures[0])).allowNew, false);
  const receipts = check(await support.from('lesson_student_registrations').select('*').eq('child_id', fixtures[0].child));
  assert(!JSON.stringify(receipts).includes(first.credentials.passcode));
  const sourceReceipts = check(await lesson.from('lesson_support_registrations').select('*').eq('student_id', studentId));
  assert(!JSON.stringify(sourceReceipts).includes(first.credentials.passcode));
  const duplicate = fixtures[2];
  check(await lesson.from('user_data').insert({ id: duplicateStudent, data: { displayName: duplicate.name, campusId: 'main', birthdate: '2018-01-01', mouseLevel: 0 } }));
  const duplicateResult = await register(duplicate, await configuration(duplicate));
  assert.equal(duplicateResult.error?.context.status, 409);
  assert.equal(check(await lesson.from('user_data').select('id').eq('id', `student_support_${duplicate.op.replaceAll('-', '')}`)).length, 0);
  assert.equal(check(await support.from('lesson_student_registrations').select('phase').eq('id', duplicate.op).single()).phase, 'denied');
  // Simulate a durable interruption after source creation, without Auth or a support link.
  const cut = fixtures[3], cutConfig = await configuration(cut), lease = randomUUID();
  check(await support.rpc('claim_lesson_student_registration', { p: { id: cut.op, lease, actor: staffId, org: orgId, child: cut.child, project: lessonRef, campus: 'main', name: cut.name, birth: '2018-01-01' } }));
  const sourceCut = check(await lesson.rpc('prepare_support_student_registration', { p: { id: cut.op, link: cut.op, actor: staffId, project: supportRef, org: orgId, table: 'user_data', child: cut.child, campus: 'main', code: 'main', name: cut.name, birth: '2018-01-01', domain: 'dlesson.example.com', prefix: 'dlesson-student-', pad: 3 } }));
  check(await support.from('lesson_student_registrations').update({ phase: 'source-created', lease_id: null, lease_until: null }).eq('id', cut.op));
  assert.equal((await register(cut, cutConfig, { operationId: randomUUID() })).error?.context.status, 409);
  const recovered = parseRegistrationResult(check(await register(cut, cutConfig)), cut.child, cut.op, { sourceProject: lessonRef, campusId: 'main', name: cut.name, birthDate: '2018-01-01' });
  assert.equal(recovered.link.source_student_id, sourceCut.studentId); assert.equal(recovered.credentials.account.loginNumber, sourceCut.loginNumber);
  check(await lesson.from('lesson_support_students').update({ enabled: false }).eq('student_id', studentId).eq('organization_id', orgId));
  assert.equal((await register(fixtures[0], config)).error?.context.status, 409);
  console.log('PASS: deployed fictional registration, concurrent campus allocation, zero initial progress, Word binding, own-only RLS, replay, duplicate prevention, source-created recovery, permission/confirmation/fingerprint/foreign-campus/foreign-child/revocation denial and no persisted passphrase');
} finally {
  const errors = [], clean = async (fn, label) => { try { await fn(); } catch { errors.push(label); } };
  for (const fixture of fixtures) {
    await clean(async () => check(await support.from('lesson_student_registrations').delete().eq('organization_id', orgId).eq('child_id', fixture.child)), 'registration-receipt');
    await clean(async () => check(await support.from('lesson_credential_operations').delete().eq('organization_id', orgId).eq('child_id', fixture.child)), 'credential-receipt');
    const links = await support.from('lesson_child_links').select('id').eq('organization_id', orgId).eq('child_id', fixture.child);
    if (links.error) errors.push('link-read');
    for (const link of links.data || []) await clean(async () => check(await support.from('lesson_link_audit').delete().eq('organization_id', orgId).eq('link_id', link.id)), 'link-audit');
    await clean(async () => check(await support.from('lesson_child_links').delete().eq('organization_id', orgId).eq('child_id', fixture.child)), 'link');
  }
  for (const id of studentIds) {
    await clean(async () => check(await lesson.from('lesson_support_account_operations').delete().eq('support_project_ref', supportRef).eq('organization_id', orgId).eq('student_id', id)), 'source-credential');
    await clean(async () => check(await lesson.from('lesson_support_registrations').delete().eq('support_project_ref', supportRef).eq('organization_id', orgId).eq('student_id', id)), 'source-registration');
    await clean(async () => check(await lesson.from('lesson_support_students').delete().eq('student_id', id).eq('organization_id', orgId).eq('support_project_ref', supportRef)), 'source-permission');
    await clean(async () => {
      const rows = sql(`select id from auth.users where raw_user_meta_data->>'user_data_id'='${id}';`, lessonRoot).rows;
      for (const row of rows) { const found = check(await lesson.auth.admin.getUserById(row.id)); if (found.user.user_metadata.user_data_id !== id) throw Error('Fixture identity mismatch'); check(await lesson.auth.admin.deleteUser(row.id)); }
    }, 'fixture-auth');
    await clean(async () => check(await lesson.from('user_data').delete().eq('id', id)), 'source-learner');
  }
  for (const fixture of fixtures) await clean(async () => check(await support.from('children').delete().eq('organization_id', orgId).eq('id', fixture.child)), 'child');
  if (staffId) await clean(async () => check(await support.auth.admin.deleteUser(staffId)), 'staff');
  if (recorderId) await clean(async () => check(await support.from('recorder_profiles').delete().eq('id', recorderId).eq('organization_id', orgId)), 'recorder');
  if (invitationId) await clean(async () => check(await support.from('member_invitations').delete().eq('id', invitationId).eq('organization_id', orgId)), 'invitation');
  if (errors.length) throw Error(`Fictional cleanup requires attention: ${errors.join(', ')}; run ${run}`);
  const after = snapshot();
  for (const row of before) { const current = after.find(item => item.id === row.id); assert(current, 'Operational learner disappeared; no automatic restoration'); for (const field of ['authUserId', 'loginNumber', 'campusId', 'campus', 'userDataId', 'displayName', 'birthdate', 'birth']) assert.equal(current.fields?.[field], row.fields?.[field], 'Operational mapping changed; no automatic restoration'); }
  console.log('PASS: fictional fixtures removed; operational learner identity/account mappings unchanged; no real learning records restored');
}
