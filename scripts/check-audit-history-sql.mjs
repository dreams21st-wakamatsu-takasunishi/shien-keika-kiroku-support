// Isolated PostgreSQL, synthetic metadata only; no Supabase access.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const runtime=process.argv[2];if(!runtime)throw Error('PGlite runtime required');
const {PGlite}=await import(pathToFileURL(runtime).href),db=new PGlite();
const org='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
await db.exec(`create role authenticated;create role anon;
create function public.current_organization_id() returns uuid language sql stable as $$select nullif(current_setting('fixture.org',true),'')::uuid$$;
create function public.current_user_role() returns text language sql stable as $$select case when current_setting('fixture.session',true)='allowed' then current_setting('fixture.role',true) else null end$$;
create table public.audit_logs(id bigint primary key,organization_id uuid not null,actor_id uuid,table_name text,row_id text,action text,occurred_at timestamptz,old_data jsonb,new_data jsonb);
insert into public.audit_logs select i,'${org}',null,'synthetic',i::text,'UPDATE','2026-10-16T00:00:00Z'::timestamptz,'{}','{}' from generate_series(1,16000) i;
insert into public.audit_logs values(16001,'${other}',null,'foreign','private','INSERT',now(),'{}','{}');
alter table public.audit_logs enable row level security;grant select on public.audit_logs to authenticated;
create policy audit_logs_select on public.audit_logs for select using(organization_id=public.current_organization_id() and public.current_user_role() in ('manager','admin'));
select set_config('fixture.org','${org}',false),set_config('fixture.role','admin',false),set_config('fixture.session','allowed',false);`);
const before=JSON.stringify((await db.query('select count(*)::int as n,sum(id)::text as ids from public.audit_logs')).rows);
await db.exec(readFileSync('supabase/migrations/202610160002_audit_history_lookup.sql','utf8'));
assert.equal(JSON.stringify((await db.query('select count(*)::int as n,sum(id)::text as ids from public.audit_logs')).rows),before);let checks=1;
await db.exec('set role authenticated');
for(const role of ['admin','manager']){await db.query("select set_config('fixture.role',$1,false)",[role]);const rows=(await db.query('select id from public.audit_logs order by occurred_at desc,id desc limit 30')).rows;assert.equal(rows.length,30);assert.equal(rows[0].id,16000);assert.ok(!rows.some(r=>r.id===16001));checks++;}
const plan=(await db.query("explain (format json) select id,actor_id,table_name,row_id,action,occurred_at from public.audit_logs where organization_id='"+org+"' order by occurred_at desc,id desc limit 30")).rows;
assert.ok(JSON.stringify(plan).includes('audit_logs_organization_recent_idx'));assert.ok(JSON.stringify(plan).includes('InitPlan'));checks++;
for(const role of ['staff','classroom_manager']){await db.query("select set_config('fixture.role',$1,false)",[role]);assert.equal((await db.query('select id from public.audit_logs')).rows.length,0);checks++;}
await db.query("select set_config('fixture.role','admin',false),set_config('fixture.session','denied',false)");assert.equal((await db.query('select id from public.audit_logs')).rows.length,0);checks++;
await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select id from public.audit_logs'));checks++;
await db.exec('reset role');assert.equal(JSON.stringify((await db.query('select count(*)::int as n,sum(id)::text as ids from public.audit_logs')).rows),before);checks++;
console.log(JSON.stringify({passed:true,checks,postgresqlExecuted:true,productionAccess:false,auditRowsPreserved:16001}));await db.close();
