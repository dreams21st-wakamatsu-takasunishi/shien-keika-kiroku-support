import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const [runtime, lessonRoot] = process.argv.slice(2);
if (!runtime || !lessonRoot) throw new Error('Pass a PGlite runtime path and D Lesson source directory.');
const { PGlite } = await import(pathToFileURL(runtime).href);
const db = new PGlite();
try {
  await db.exec(`create schema auth;
    create table auth.users(id uuid, email text, raw_app_meta_data jsonb);
    create role anon; create role authenticated; create role service_role;
    create table public.user_data(id text primary key, data jsonb not null);`);
  await db.exec(readFileSync(`${lessonRoot}/supabase/sql/support_learning_bridge.sql`, 'utf8'));
  await db.exec('alter table public.lesson_support_students add column support_link_id uuid, add column support_child_id text');
  const sql = readFileSync(`${lessonRoot}/supabase/sql/support_account_credentials.sql`, 'utf8');
  await db.exec(sql);
  await db.exec(sql); // Verify that the deployed SQL can be reapplied.
  const org = randomUUID(), actor = randomUUID(), link = randomUUID(), op = randomUUID();
  const project = 'abcdefghijklmnopqrst', table = 'user_data', campus = 'fixture-campus', child = 'child-fixture';
  const student = 'student_fixture', proof = 'a'.repeat(64);
  await db.query('insert into public.lesson_support_scopes(support_project_ref,organization_id,data_table,campus_id,enabled) values($1,$2,$3,$4,true)', [project,org,table,campus]);
  await db.query('insert into public.lesson_support_students(support_project_ref,organization_id,data_table,campus_id,student_id,enabled,support_link_id,support_child_id) values($1,$2,$3,$4,$5,true,$6,$7)', [project,org,table,campus,student,link,child]);
  await db.query('insert into public.user_data values($1,$2)',[student,{campusId:campus,loginNumber:'19'}]);
  const claim = (patch = {}) => db.query('select public.claim_support_account_operation($1) as result', [{
    id:op, lease:randomUUID(), action:'reset', actor, org, project, student, child, link, table, passcodeProof:proof, expectedCampus:campus, ...patch,
  }]);
  await assert.rejects(() => claim({expectedCampus:'another-campus'}), {code:'PT412'});
  assert.equal((await db.query('select count(*)::int as n from public.lesson_support_account_operations')).rows[0].n, 0);
  assert.equal((await claim()).rows[0].result.custom_passcode_proof, proof);
  await assert.rejects(() => claim({passcodeProof:null}), {code:'PT422'});
  await assert.rejects(() => claim({passcodeProof:'b'.repeat(64)}), {code:'PT422'});
  await assert.rejects(claim, {code:'PT423'});
  await db.query('update public.lesson_support_account_operations set lease_id=null,lease_until=null where id=$1',[op]);
  assert.equal((await claim()).rows[0].result.id, op);
  await assert.rejects(() => claim({id:randomUUID()}), {code:'PT409'});
  await assert.rejects(() => claim({link:randomUUID()}), {code:'42501'});
  await db.exec('set role authenticated');
  await assert.rejects(claim, {code:'42501'});
  await assert.rejects(() => db.query('select * from public.lesson_support_account_operations'), {code:'42501'});
  console.log('Chosen passcode reservation: wrong/missing proof, concurrent operation and unauthorized link/role rejected; exact retry accepted.');
} finally {
  await db.close();
}
