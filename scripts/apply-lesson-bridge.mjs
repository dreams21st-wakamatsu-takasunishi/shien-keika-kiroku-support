import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {jsPDF} from 'jspdf';

if (!process.argv.includes('--apply-and-test')) throw new Error('Explicit --apply-and-test is required. This creates backend objects and temporary test accounts.');
const supportProject = 'cyqrxhknpboidvetdfgn';
const lessonProject = 'lmonjfdxtefsvgtdixid';
const organizationId = '44d7f8d4-3ee1-476c-b3a2-d4a8aae7ef4d';
const campus = 'main';
const lessonRoot = resolve('../Dレッスン5.0/d-lesson-v4');
if (readFileSync('supabase/.temp/project-ref', 'utf8').trim() !== supportProject
  || readFileSync(resolve(lessonRoot, 'supabase/.temp/project-ref'), 'utf8').trim() !== lessonProject) throw new Error('Linked project mismatch');
mkdirSync('output', { recursive: true });
const runId = randomBytes(8).toString('hex');
const temporaryFiles = [];
const psQuote = value => `'${String(value).replaceAll("'", "''")}'`;
function cli(args, root = process.cwd()) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', `& npx.cmd supabase ${args.map(psQuote).join(' ')}`], {
    cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
  });
  // Never print CLI output here: api-keys may contain credentials.
  if (result.status !== 0) throw new Error(`Supabase ${args[0]} ${args[1] || ''} failed (output withheld)`);
  return result.stdout;
}
function sql(statement, root = process.cwd()) {
  const file = resolve(`output/lesson-query-${runId}-${temporaryFiles.length}.sql`);
  writeFileSync(file, statement); temporaryFiles.push(file);
  return JSON.parse(cli(['db', 'query', '--linked', '--file', file], root));
}
function keys(project) {
  const result = JSON.parse(cli(['projects', 'api-keys', '--project-ref', project, '--reveal', '-o', 'json']));
  const rows = Array.isArray(result) ? result : result.rows;
  const service = rows?.find(row => row.name === 'service_role')?.api_key;
  const anon = rows?.find(row => row.name === 'anon')?.api_key;
  if (!service || !anon) throw new Error('Legacy API keys unavailable; no credentials printed');
  return { service, anon };
}
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sourceStudent = `student_bridge_check_${runId}`;
const childId = `lesson-bridge-check-${runId}`;
const childId2 = `${childId}-2`;
let staffId, invitationId, support, lesson, supportKeys, bridgeSecret;
let seeded = false;
let originalScopeEnabled = false;
let recorderId;
const deviceIds = [];
let studentAuthId;
const wordRequestIds=[],wordPaths=[];
try {
  const migration = readFileSync('supabase/migrations/202609300001_lesson_learning_links.sql', 'utf8');
  const sourceSQL = readFileSync(resolve(lessonRoot, 'supabase/sql/support_learning_bridge.sql'), 'utf8');
  const ready = sql("select to_regclass('public.lesson_child_links') is not null as ready").rows[0].ready;
  if (!ready) {
    sql(`begin; ${migration} rollback;`);
    console.log('PASS: support migration compiles against current remote schema (rolled back)');
    sql(`begin; ${migration} insert into supabase_migrations.schema_migrations(version,name,statements)
      values('202609300001','lesson_learning_links',array['Applied via apply-lesson-bridge.mjs']) on conflict(version) do nothing; commit;`);
  }
  sql(sourceSQL, lessonRoot);
  const reviewMigration=readFileSync('supabase/migrations/202609300002_lesson_word_review_permissions.sql','utf8');
  sql(`begin;${reviewMigration}insert into supabase_migrations.schema_migrations(version,name,statements) values('202609300002','lesson_word_review_permissions',array['Applied via apply-lesson-bridge.mjs']) on conflict(version) do nothing;commit;`);
  const conflictMigration=readFileSync('supabase/migrations/202609300004_lesson_link_business_conflicts.sql','utf8');
  sql(`begin;${conflictMigration}insert into supabase_migrations.schema_migrations(version,name,statements) values('202609300004','lesson_link_business_conflicts',array['Applied via apply-lesson-bridge.mjs']) on conflict(version) do nothing;commit;`);
  sql(readFileSync(resolve(lessonRoot,'supabase/sql/support_word_reviews.sql'),'utf8'),lessonRoot);
  console.log('Backend tables ready; no real child link created');
  const secretList = root => {
    const output = cli(['secrets', 'list', '-o', 'json'], root).trim();
    return output ? JSON.parse(output) : [];
  };
  const supportSecrets = secretList(process.cwd());
  const sourceSecrets = secretList(lessonRoot);
  const names = result => (Array.isArray(result) ? result : result.rows || []).map(item => item.name);
  const hasSupportSecret = names(supportSecrets).includes('D_LESSON_BRIDGE_SECRET');
  const hasSourceSecret = names(sourceSecrets).includes('D_SUPPORT_BRIDGE_SECRET');
  if (hasSupportSecret !== hasSourceSecret) throw new Error('Only one bridge secret exists; refusing automatic rotation');
  if (!hasSupportSecret) {
  bridgeSecret = randomBytes(32).toString('hex');
  const supportEnv = resolve(`output/lesson-secrets-${runId}.env`);
  const sourceEnv = resolve(`output/source-secrets-${runId}.env`);
  writeFileSync(supportEnv, `D_LESSON_PROJECT_REF=${lessonProject}\nD_LESSON_BRIDGE_SECRET=${bridgeSecret}\n`);
  writeFileSync(sourceEnv, `D_SUPPORT_BRIDGE_SECRET=${bridgeSecret}\n`);
  temporaryFiles.push(supportEnv, sourceEnv);
  cli(['secrets', 'set', '--env-file', supportEnv]);
  cli(['secrets', 'set', '--env-file', sourceEnv], lessonRoot);
  }
  cli(['functions', 'deploy', 'support-learning-read', '--no-verify-jwt'], lessonRoot);
  cli(['functions','deploy','student-word-review','--no-verify-jwt'],lessonRoot);
  cli(['functions','deploy','support-word-review','--no-verify-jwt'],lessonRoot);
  cli(['functions', 'deploy', 'lesson-learning', '--no-verify-jwt']);
  console.log('Functions deployed; server-only bridge secrets configured without exposing values');
  supportKeys = keys(supportProject); const lessonKeys = keys(lessonProject);
  support = createClient(`https://${supportProject}.supabase.co`, supportKeys.service, { auth: { persistSession: false, autoRefreshToken: false } });
  lesson = createClient(`https://${lessonProject}.supabase.co`, lessonKeys.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const org = await support.from('organizations').select('id').eq('id', organizationId).single();
  assert(!org.error, 'Existing organization could not be verified');
  const email = `lesson-bridge-check-${runId}@example.com`, password = randomBytes(24).toString('hex');
  const invitation = await support.from('member_invitations').insert({ id: randomUUID(), organization_id: organizationId, email, role: 'admin' }).select('id').single();
  assert(!invitation.error && invitation.data, 'Temporary invitation creation failed');
  invitationId = invitation.data.id;
  const created = await support.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: '学習連携・一時検証職員' } });
  assert(!created.error && created.data.user, `Temporary staff auth creation failed (${created.error?.status || 'unknown'}, ${created.error?.code || 'unknown'})`);
  staffId = created.data.user.id;
  const profile = await support.from('profiles').upsert({ id: staffId, organization_id: organizationId, display_name: `学習連携・一時検証-${runId}`, email, role: 'admin', active: true });
  assert(!profile.error, 'Temporary staff profile creation failed');
  const linkedRecorder = await support.from('profiles').select('recorder_profile_id').eq('id', staffId).single();
  assert(!linkedRecorder.error && linkedRecorder.data?.recorder_profile_id, 'Temporary recorder identity was not created');
  recorderId = linkedRecorder.data.recorder_profile_id;
  const anon = createClient(`https://${supportProject}.supabase.co`, supportKeys.anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await anon.auth.signInWithPassword({ email, password });
  assert(!login.error && login.data.session, 'Temporary staff login failed');
  const token = login.data.session.access_token;
  const date = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const sourceData = { displayName: `架空児童・連携検証-${runId}`, birthdate: '2018-01-01', campusId: campus, group: '連携検証',coins:20,examRecords:{romaji_daku_exam:true},wordProgress:{},
    practiceLogs: [{ id: `event-${runId}`, at: new Date().toISOString(), category: 'mouse', title: 'マウス練習 M-1', detail: 'クリア', amount: 'ステージをクリア', coins: 30 }] };
  const scopeState = sql(`select enabled from public.lesson_support_scopes where support_project_ref='${supportProject}' and organization_id='${organizationId}' and data_table='user_data' and campus_id='${campus}';`, lessonRoot).rows;
  originalScopeEnabled = scopeState[0]?.enabled === true;
  const existingPermissions = sql(`select count(*)::int as total from public.lesson_support_students where support_project_ref='${supportProject}' and organization_id='${organizationId}' and data_table='user_data' and campus_id='${campus}' and enabled;`, lessonRoot).rows[0].total;
  assert(existingPermissions === 0, 'Operational child permissions already exist; refusing to modify their scope during a fictional test');
  seeded = true;
  sql(`insert into public.children(organization_id,id,name,birth_date) values
    ('${organizationId}','${childId}','架空児童・連携検証-${runId}','2018-01-01'),
    ('${organizationId}','${childId2}','架空児童・重複確認-${runId}','2018-01-01');`);
  const writeSource = await lesson.from('user_data').insert({ id: sourceStudent, data: sourceData });
  assert(!writeSource.error, 'Temporary learning data creation failed');
  sql(`insert into public.lesson_support_scopes(support_project_ref,organization_id,data_table,campus_id,enabled)
    values('${supportProject}','${organizationId}','user_data','${campus}',true)
    on conflict(support_project_ref,organization_id,data_table,campus_id) do update set enabled=true;
    insert into public.lesson_support_students(support_project_ref,organization_id,data_table,campus_id,student_id,enabled)
    values('${supportProject}','${organizationId}','user_data','${campus}','${sourceStudent}',true);`, lessonRoot);
  let deviceToken = '';
  const call = async (body, credentials = token) => {
    const response = await fetch(`https://${supportProject}.supabase.co/functions/v1/lesson-learning`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials}`, apikey: supportKeys.anon, 'x-support-device-token': deviceToken }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
    });
    return { status: response.status, data: await response.json() };
  };
  let result = await call({ action: 'inspect', childId, studentId: sourceStudent });
  assert(result.status === 200 && result.data.identity.studentId === sourceStudent, `Live inspection failed (HTTP ${result.status}, ${result.data.error || 'unexpected response'})`);
  const confirmation = result.data;
  result = await call({ action: 'link', childId, studentId: sourceStudent, fingerprint: confirmation.fingerprint, confirmed: true });
  assert(result.status === 200 && result.data.link.active, 'Live link failed');
  result = await call({ action: 'history', childId, date });
  assert(result.status === 200 && result.data.events.length === 1 && result.data.events[0].id === `event-${runId}`, 'Live history read failed');
  assert(!('coins' in result.data.events[0]) && !('email' in result.data.identity), 'Unnecessary private data was exported');
  assert((await call({ action: 'list' }, supportKeys.anon)).status === 401, 'Anonymous caller was accepted');
  assert((await call({ action: 'inspect', childId, studentId: `student_unapproved_${runId}` })).status === 403, 'Unapproved source student was accepted');
  const recorderLogin = await support.from('recorder_profiles').update({ auth_user_id: staffId, individual_login_enabled: true }).eq('id', recorderId).eq('organization_id', organizationId);
  assert(!recorderLogin.error, 'Temporary recorder login configuration failed');
  const facilityToken = randomBytes(32).toString('hex'), personalToken = randomBytes(32).toString('hex');
  for (const [kind, value] of [['facility_shared', facilityToken], ['personal', personalToken]]) {
    const device = await support.from('organization_devices').insert({ organization_id: organizationId,
      token_hash: createHash('sha256').update(value).digest('hex'), label: `学習連携・一時端末-${kind}-${runId}`,
      device_kind: kind, status: 'approved', owner_recorder_profile_id: kind === 'personal' ? recorderId : null,
      transport_mode_only: kind === 'personal' }).select('id').single();
    assert(!device.error && device.data, 'Temporary device creation failed');
    deviceIds.push(device.data.id);
  }
  const staffRole = await support.from('profiles').update({ role: 'staff' }).eq('id', staffId);
  assert(!staffRole.error, 'Temporary staff role change failed');
  assert((await call({ action: 'list' })).status === 403, 'Unverified staff device was accepted');
  deviceToken = personalToken;
  assert((await call({ action: 'history', childId, date })).status === 403, 'Personal staff device returned learning history');
  deviceToken = facilityToken;
  const staffList = await call({ action: 'list' });
  assert(staffList.status === 200 && staffList.data.canManageLinks === false, `Staff link permission check failed (HTTP ${staffList.status})`);
  assert((await call({ action: 'inspect', childId, studentId: sourceStudent })).status === 403, 'Staff could manage links');
  assert((await call({ action: 'history', childId, date })).status === 200, 'Authorized staff could not read linked history');
  assert((await call({action:'word-inbox'})).data.canReviewWord===false,'Staff incorrectly received Word approval permission');
  const inactive = await support.from('profiles').update({ active: false }).eq('id', staffId);
  assert(!inactive.error, 'Temporary staff deactivation failed');
  assert((await call({ action: 'history', childId, date })).status === 403, 'Inactive staff returned learning history');
  const restored = await support.from('profiles').update({ role: 'admin', active: true }).eq('id', staffId);
  assert(!restored.error, 'Temporary staff restoration failed');
  result = await call({ action: 'link', childId: childId2, studentId: sourceStudent, fingerprint: confirmation.fingerprint, confirmed: true });
  assert(result.status === 409, 'Duplicate learning account was accepted');
  const studentEmail=`lesson-word-check-${runId}@example.com`,studentPassword=randomBytes(24).toString('hex');
  const studentAuth=await lesson.auth.admin.createUser({email:studentEmail,password:studentPassword,email_confirm:true});
  assert(!studentAuth.error&&studentAuth.data.user,'Temporary learning Auth creation failed');studentAuthId=studentAuth.data.user.id;
  const studentAccess=await lesson.from('lesson_user_access').insert({auth_user_id:studentAuthId,user_data_id:sourceStudent,role:'student',scope_type:'all',scope_value:''});
  assert(!studentAccess.error,'Temporary learning access creation failed');
  const studentClient=createClient(`https://${lessonProject}.supabase.co`,lessonKeys.anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const studentLogin=await studentClient.auth.signInWithPassword({email:studentEmail,password:studentPassword});assert(!studentLogin.error,'Temporary student login failed');
  const studentCall=async body=>{
    const response=await fetch(`https://${lessonProject}.supabase.co/functions/v1/student-word-review`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${studentLogin.data.session.access_token}`,apikey:lessonKeys.anon},body:JSON.stringify({studentId:sourceStudent,...body}),signal:AbortSignal.timeout(30000)});
    return {status:response.status,data:await response.json()};
  };
  assert((await studentCall({action:'status'})).data.linked===true,'Student did not see verified support link');
  const pdf=new jsPDF();pdf.text('Fictional Word submission',20,20);const file=new Uint8Array(pdf.output('arraybuffer'));
  const submitWork=async()=>{
    const id=randomUUID();wordRequestIds.push(id);
    const prepared=await studentCall({action:'prepare',requestId:id,stageId:'w_b1_1',page:'3',fileType:'application/pdf',fileSize:file.length});
    assert(prepared.status===200,`Live Word preparation failed (HTTP ${prepared.status}, ${prepared.data.error||'unknown'})`);
    wordPaths.push(prepared.data.upload.path);
    const uploaded=await studentClient.storage.from('lesson-word-work').uploadToSignedUrl(prepared.data.upload.path,prepared.data.upload.token,file,{contentType:'application/pdf',upsert:false});
    assert(!uploaded.error,'Private artifact upload failed');
    const submitted=await studentCall({action:'submit',requestId:id});assert(submitted.status===200&&submitted.data.request.status==='pending','Live Word submission failed');
    return submitted.data.request;
  };
  const requestOne=await submitWork();
  let inbox=await call({action:'word-inbox'});assert(inbox.status===200&&inbox.data.requests.some(row=>row.id===requestOne.id)&&inbox.data.canReviewWord===true,'Support did not receive Word request notification');
  const artifactOne=await call({action:'word-artifact',childId,requestId:requestOne.id});assert(artifactOne.status===200,'Support artifact access failed');
  const privateURL=lesson.storage.from('lesson-word-work').getPublicUrl(wordPaths[0]).data.publicUrl;
  assert(!(await fetch(privateURL)).ok,'Artifact was publicly accessible');
  const returned=await call({action:'word-decide',childId,requestId:requestOne.id,revision:requestOne.revision,decision:'returned',reason:'見出しをなおしてね',reviewed:true,fileHash:artifactOne.data.fileHash});
  assert(returned.status===200&&returned.data.request.status==='returned','Live return failed');
  assert((await studentCall({action:'status'})).data.requests[0].reason==='見出しをなおしてね','Student did not receive return reason');
  const requestTwo=await submitWork(),artifactTwo=await call({action:'word-artifact',childId,requestId:requestTwo.id});
  assert(artifactTwo.status===200,`Resubmitted artifact access failed (HTTP ${artifactTwo.status}, ${artifactTwo.data.error||'unknown'})`);
  const decision={action:'word-decide',childId,requestId:requestTwo.id,revision:requestTwo.revision,decision:'approved',reason:'よくできました',reviewed:true,fileHash:artifactTwo.data.fileHash};
  const staleDecision=await call({...decision,revision:99});
  assert(staleDecision.status===409,`Stale Word approval check failed (HTTP ${staleDecision.status}, ${staleDecision.data.error||'unknown'})`);
  const approved=await call(decision);assert(approved.status===200&&approved.data.request.reward===500,`Live Word approval failed (HTTP ${approved.status}, ${approved.data.error||'unknown'})`);
  assert((await call(decision)).status===200,'Approval retry was not idempotent');
  const approvedData=await lesson.from('user_data').select('data').eq('id',sourceStudent).single();
  assert(approvedData.data.data.coins===520&&approvedData.data.data.wordProgress.w_b1_1.status==='cleared','Word reward or clear was not reflected');
  const stale=await studentClient.from('user_data').update({data:sourceData}).eq('id',sourceStudent);
  assert(stale.error?.code==='PT409','Stale child snapshot overwrote remote approval');
  assert((await studentCall({action:'status'})).data.requests[0].status==='approved','Student did not receive approval');
  console.log('PASS: live child submission, private artifact, support inbox, return reason, resubmission, scoped approval, reward idempotency and stale child save guard');
  await lesson.from('user_data').update({ data: { ...sourceData, publicRegistration: true } }).eq('id', sourceStudent);
  assert((await call({ action: 'history', childId, date })).status === 403, 'Public registration was accepted');
  await lesson.from('user_data').update({ data: { ...sourceData, campusId: 'unapproved-campus' } }).eq('id', sourceStudent);
  assert((await call({ action: 'history', childId, date })).status === 403, 'Changed campus was accepted');
  await lesson.from('user_data').update({ data: sourceData }).eq('id', sourceStudent);
  const list = await call({ action: 'list' }); const link = list.data.links.find(item => item.child_id === childId);
  assert((await call({ action: 'disable', childId, revision: link.revision + 1 })).status === 409, 'Stale disable accepted');
  assert((await call({ action: 'disable', childId, revision: link.revision })).status === 200, 'Disable failed');
  assert((await call({ action: 'history', childId, date })).status === 409, 'Disabled link still returned history');
  console.log('PASS: live staff Auth, inspection, confirmed link, history, shared-device read-only staff, personal/unverified/inactive/anonymous denial, source allow-list, duplicate rejection, public/campus denial, stale revision, unlink');
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  try {
    if (seeded) {
      if(lesson&&wordRequestIds.length){
        if(wordPaths.length){const removed=await lesson.storage.from('lesson-word-work').remove(wordPaths);assert(!removed.error,'Temporary artifacts cleanup failed');}
        const removed=await lesson.from('lesson_word_requests').delete().in('id',wordRequestIds);assert(!removed.error,'Temporary Word requests cleanup failed');
      }
      sql(`delete from public.lesson_link_audit where link_id in (select id from public.lesson_child_links where organization_id='${organizationId}' and child_id in ('${childId}','${childId2}'));
        delete from public.lesson_child_links where organization_id='${organizationId}' and child_id in ('${childId}','${childId2}');
        delete from public.children where organization_id='${organizationId}' and id in ('${childId}','${childId2}');`);
      sql(`delete from public.lesson_support_students where support_project_ref='${supportProject}' and organization_id='${organizationId}' and student_id='${sourceStudent}';
        update public.lesson_support_scopes set enabled=${originalScopeEnabled} where support_project_ref='${supportProject}' and organization_id='${organizationId}' and data_table='user_data' and campus_id='${campus}'
          and not exists(select 1 from public.lesson_support_students where support_project_ref='${supportProject}' and organization_id='${organizationId}' and campus_id='${campus}' and enabled);`, lessonRoot);
      if (lesson) { const result = await lesson.from('user_data').delete().eq('id', sourceStudent); assert(!result.error, 'Temporary learning data cleanup failed'); }
    }
    if(studentAuthId&&lesson){const removed=await lesson.auth.admin.deleteUser(studentAuthId);assert(!removed.error,'Temporary student Auth cleanup failed');}
    if (staffId && support) {
      if (deviceIds.length) {
        const removed = await support.from('organization_devices').delete().in('id', deviceIds).eq('organization_id', organizationId);
        assert(!removed.error, 'Temporary device cleanup failed');
      }
      const { data: profile } = await support.from('profiles').select('recorder_profile_id').eq('id', staffId).maybeSingle();
      const result = await support.auth.admin.deleteUser(staffId); assert(!result.error, 'Temporary staff Auth cleanup failed');
      if (profile?.recorder_profile_id) {
        const removed = await support.from('recorder_profiles').delete().eq('id', profile.recorder_profile_id).eq('organization_id', organizationId);
        assert(!removed.error, 'Temporary recorder profile cleanup failed');
      }
    }
    if (invitationId && support) {
      const removed = await support.from('member_invitations').delete().eq('id', invitationId).eq('organization_id', organizationId);
      assert(!removed.error, 'Temporary invitation cleanup failed');
    }
    console.log('Temporary operational data removed; no real child link enabled');
  } catch { console.error('Cleanup incomplete: inspect test IDs with suffix ' + runId); process.exitCode = 1; }
  for (const file of temporaryFiles) { try { unlinkSync(file); } catch { console.error('Temporary file cleanup failed'); process.exitCode = 1; } }
  bridgeSecret = undefined; supportKeys = undefined;
}
