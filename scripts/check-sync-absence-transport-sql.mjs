// Run against synthetic PostgreSQL, never against a linked Supabase project.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const runtime = process.argv[2];
if (!runtime) throw new Error('Pass a PGlite runtime path.');
const { PGlite } = await import(pathToFileURL(runtime).href);
const db = new PGlite();
const org = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const day = '2026-11-23';
const sync = "select public.sync_absence_transport('2026-11-23','fixture-child') as result";
const stop = (childId, order) => ({ childId, order, address: 'fixture' });
const a = stop('fixture-child', 1), b = stop('fixture-a', 2), c = stop('fixture-b', 3);
try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create function public.current_organization_id() returns uuid language sql stable as
      $$select nullif(current_setting('test.org',true),'')::uuid$$;
    create function public.current_user_has_permission(p text) returns boolean language sql stable as
      $$select p='manage_transport' and current_setting('test.allowed',true)='yes'$$;
    create table daily_child_plans(organization_id uuid, service_date date, child_id text, attendance_plan text);
    create table transport_runs(id integer primary key, organization_id uuid, service_date date, status text, stops jsonb, updated_at timestamptz);
    alter table daily_child_plans enable row level security;
    alter table transport_runs enable row level security;
    grant select,update on daily_child_plans to authenticated;
    grant select,update,delete on transport_runs to authenticated;
    create policy mock_plans on daily_child_plans to authenticated using (organization_id=current_organization_id());
    create policy mock_runs on transport_runs to authenticated using (organization_id=current_organization_id());
    insert into daily_child_plans values ('${org}','${day}','fixture-child','欠席');
  `);
  for (const [id, office, date, status, stops] of [
    [1, org, day, '未出発', [a, b, c]],
    [2, org, day, '未出発', [a]],
    [3, org, day, '出発済み', [a, b]],
    [4, other, day, '未出発', [a]],
    [5, org, '2026-11-24', '未出発', [a]],
  ]) {
    await db.query('insert into transport_runs values($1,$2,$3,$4,$5,null)', [id, office, date, status, JSON.stringify(stops)]);
  }
  await db.exec(readFileSync(new URL('../supabase/migrations/202611190002_sync_absence_transport.sql', import.meta.url), 'utf8'));
  await db.exec(`set "test.org"='${org}'; set "test.allowed"='no'; set role authenticated`);
  await assert.rejects(db.query(sync), { code: '42501' });
  await db.exec(`set "test.allowed"='yes'`);
  await assert.rejects(db.query("select public.sync_absence_transport('2026-11-24','fixture-child')"), { code: '40001' });
  assert.deepEqual((await db.query(sync)).rows, [{ result: { noneditable: 1 } }]);
  assert.deepEqual((await db.query(sync)).rows, [{ result: { noneditable: 1 } }]);
  await db.exec('set role anon');
  await assert.rejects(db.query(sync), { code: '42501' });
  await db.exec('reset role');
  assert.deepEqual((await db.query('select id,status,stops from transport_runs order by id')).rows, [
    { id:1, status:'未出発', stops:[{ ...b, order:1 },{ ...c, order:2 }] },
    { id:3, status:'出発済み', stops:[a,b] },
    { id:4, status:'未出発', stops:[a] },
    { id:5, status:'未出発', stops:[a] },
  ]);
  console.log('Absence transport SQL: unstarted stops only, original order, empty run removal, isolation, permission, idempotency');
} finally {
  await db.close();
}
