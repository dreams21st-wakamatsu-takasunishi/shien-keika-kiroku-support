// Execute the production migration in a fresh, synthetic PostgreSQL (PGlite) database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const runtime = process.argv[2];
if (!runtime) throw new Error('Pass a PGlite runtime path.');
const { PGlite } = await import(pathToFileURL(runtime).href);
const db = new PGlite();
const org = randomUUID(), otherOrg = randomUUID(), user = randomUUID(), sameOfficeStaff = randomUUID(), otherUser = randomUUID(), id = randomUUID();
try {
  await db.exec(`
    create schema auth;
    create role authenticated;
    create role anon;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function public.current_organization_id() returns uuid language sql as $$select nullif(current_setting('test.org',true),'')::uuid$$;
    create function public.current_user_role() returns text language sql as $$select current_setting('test.role',true)$$;
    create function public.current_request_device_kind() returns text language sql as $$select current_setting('test.device',true)$$;
    create table public.profiles(id uuid primary key, organization_id uuid, active boolean, display_name text);
    create table public.children(organization_id uuid,id text,deleted_at timestamptz,care_type text,visiting_support_enabled boolean,primary key(organization_id,id));
    insert into public.profiles values ('${user}','${org}',true,'架空職員'), ('${sameOfficeStaff}','${org}',true,'架空指導員'), ('${otherUser}','${otherOrg}',true,'架空職員');
    insert into public.children values
      ('${org}','dual',null,'放課後等デイサービス',true),
      ('${org}','day',null,'放課後等デイサービス',false),
      ('${org}','archived',now(),'保育所等訪問支援',false),
      ('${otherOrg}','dual',null,'保育所等訪問支援',true),
      ('${otherOrg}','visiting',null,'保育所等訪問支援',false);
  `);
  const documents = readFileSync('supabase/migrations/202610150006_child_document_register.sql', 'utf8');
  await db.exec(documents.slice(0, documents.indexOf('create or replace function public.valid_child_document_months')));
  await db.exec(readFileSync('supabase/migrations/202611160001_visiting_support_reports.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/202611190001_visiting_report_staff_access.sql','utf8'));
  const configure = (key, value) => db.query("select set_config('test.' || $1, $2, false)",[key,value]);
  const setActor = async (office, actor, role, device) => {
    await configure('org',office);
    await configure('uid',actor);
    await configure('role',role);
    await configure('device',device);
  };
  await db.query("update public.children set sex='男性', school_class='3年1組' where organization_id=$1 and id='dual'",[org]);
  await assert.rejects(() => db.query("update public.children set sex=repeat('a',41) where organization_id=$1 and id='dual'",[org]), {code:'23514'});
  const content = { childName:'架空児童',sex:'男性',affiliation:'3年1組',summary:'架空まとめ',nextSupport:'',
    timeline:[{startTime:'10:00',endTime:'',activity:'架空活動',observation:'',notes:''}] };
  const save = (revision = 0, destination = '架空訪問先', overrides = {}) => db.query(
    'select (public.save_visiting_support_report($1,$2,$3,$4,$5,$6,$7,$8)).*',
    [overrides.id ?? id, overrides.child ?? 'dual', revision, '2026-11-16', overrides.reportDate ?? '2026-11-17', '架空職員', destination, overrides.content ?? content]
  );
  const count = async () => (await db.query('select count(*)::int as n from public.visiting_support_reports')).rows[0].n;
  await setActor(org,user,'admin','facility_shared');
  await db.exec('set role authenticated');
  assert.equal((await save()).rows[0].revision,1);
  assert.equal((await save()).rows[0].revision,1);
  assert.equal(await count(),1);
  await assert.rejects(() => save(0,'別の架空訪問先'), {code:'40001'});
  await assert.rejects(() => save(0,'架空訪問先',{child:'day'}), {code:'22023'});
  await assert.rejects(() => save(0,'架空訪問先',{child:'archived'}), {code:'22023'});
  await assert.rejects(() => save(0,'架空訪問先',{child:'visiting'}), {code:'22023'});
  await assert.rejects(() => save(1,'架空訪問先',{reportDate:'2026-11-15'}), {code:'22023'});
  await assert.rejects(() => save(1,'架空訪問先',{content:{...content,timeline:[]}}), {code:'22023'});
  await assert.rejects(() => save(1,'架空訪問先',{content:{...content,timeline:[{...content.timeline[0],endTime:'09:40'}]}}), {code:'22023'});
  assert.equal(Object.hasOwn((await save(0,'架空訪問先',{content:{...content,birthDate:'2017-08-06'}})).rows[0].content,'birthDate'),false);
  assert.equal((await save(1,'訂正した架空訪問先')).rows[0].revision,2);
  await assert.rejects(() => save(1,'競合する架空訪問先'), {code:'40001'});
  await assert.rejects(() => db.exec("update public.visiting_support_reports set destination='不正更新'"), {code:'42501'});
  await assert.rejects(() => db.exec('delete from public.visiting_support_reports'), {code:'42501'});
  const ownIds=[];
  for (const role of ['staff','classroom_manager']) {
    await setActor(org,sameOfficeStaff,role,'facility_shared');
    assert.equal(await count(),ownIds.length);
    await assert.rejects(() => save(2), {code:'40001'});
    const ownId=randomUUID();
    assert.equal((await save(0,'架空訪問先',{id:ownId})).rows[0].created_by,sameOfficeStaff);
    assert.equal((await save(1,'自身の訂正',{id:ownId})).rows[0].revision,2);
    ownIds.push(ownId);
    assert.equal(await count(),ownIds.length);
  }
  await configure('role','manager');
  assert.equal(await count(),3);
  await configure('device','personal');
  assert.equal(await count(),0);
  await assert.rejects(() => save(2), {code:'42501'});
  await setActor(org,sameOfficeStaff,'staff','unverified');
  assert.equal(await count(),0);
  await assert.rejects(() => save(0,'架空訪問先',{id:randomUUID()}), {code:'42501'});
  await setActor(org,randomUUID(),'staff','facility_shared');
  assert.equal(await count(),0);
  await assert.rejects(() => save(0,'架空訪問先',{id:randomUUID()}), {code:'42501'});
  await setActor(otherOrg,otherUser,'admin','facility_shared');
  assert.equal(await count(),0);
  await assert.rejects(() => save(2), {code:'40001'});
  assert.equal((await save(0,'架空訪問先',{id:randomUUID(),child:'visiting'})).rows[0].revision,1);
  await db.exec('set role anon');
  await assert.rejects(count, {code:'42501'});
  await assert.rejects(() => save(), {code:'42501'});
  console.log('Visit reports: valid writes, safe retry, conflict protection, service eligibility, office/role/device RLS verified.');
} finally {
  await db.close();
}
