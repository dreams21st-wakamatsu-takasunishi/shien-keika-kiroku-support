// Synthetic PostgreSQL and session identities only. Never queries Supabase.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const runtime=process.argv[2];if(!runtime)throw Error('Local PGlite entry point required');
const {PGlite}=await import(pathToFileURL(runtime).href),db=new PGlite();
const migration=readFileSync('supabase/migrations/202610260001_record_read_access_initplan.sql','utf8');
const org='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
let checks=0;
try{
 await db.exec(`create role authenticated;create role anon;
 create function public.current_organization_id() returns uuid language sql stable security definer set search_path=public as $$select case when current_setting('fixture.allowed',true)='yes' then nullif(current_setting('fixture.org',true),'')::uuid else null end$$;
 create table public.support_records(id int primary key,organization_id uuid not null,record_date date not null,version int not null,deleted_at timestamptz,content jsonb not null);
 insert into public.support_records select i,'${org}','2026-10-26',3,null,jsonb_build_object('synthetic',i) from generate_series(1,1200) i;
 insert into public.support_records values(1201,'${other}','2026-10-25',7,null,'{"synthetic":"other"}');
 create index support_records_date_idx on public.support_records(organization_id,record_date desc) where deleted_at is null;
 alter table public.support_records enable row level security;grant select on public.support_records to authenticated;
 create policy records_select on public.support_records for select using(organization_id=public.current_organization_id());
 create policy records_insert on public.support_records for insert with check(organization_id=public.current_organization_id());
 create policy records_update on public.support_records for update using(false) with check(false);`);
 const tableState=async()=>JSON.stringify((await db.query('select count(*) as n,sum(id) as ids,sum(version) as versions from public.support_records')).rows);
 const otherPolicies=async()=>JSON.stringify((await db.query("select policyname,qual,with_check from pg_policies where tablename='support_records' and cmd<>'SELECT' order by policyname")).rows);
 const before=await tableState(),beforePolicies=await otherPolicies();
 const visible=async(orgValue,allowed)=>{
  await db.query("select set_config('fixture.org',$1,false),set_config('fixture.allowed',$2,false)",[orgValue,allowed]);await db.exec('set role authenticated');
  try{return (await db.query('select id,version,content from public.support_records order by id')).rows;}finally{await db.exec('reset role');}
 };
 const cases=[[org,'yes'],[other,'yes'],[org,'no'],['','yes']];
 const baseline=[];for(const args of cases)baseline.push(await visible(...args));
 await db.exec(migration);checks++;
 for(let i=0;i<cases.length;i++){assert.deepEqual(await visible(...cases[i]),baseline[i]);checks++;}
 await db.query("select set_config('fixture.org',$1,false),set_config('fixture.allowed','yes',false)",[org]);await db.exec('set role authenticated');
 const plan=(await db.query(`explain (format json) select * from public.support_records where organization_id='${org}' and deleted_at is null order by record_date desc`)).rows;
 assert.match(JSON.stringify(plan),/InitPlan/);checks++;
 await assert.rejects(()=>db.query("update public.support_records set version=99 where id=1"));checks++;
 await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from public.support_records'));checks++;
 await db.exec('reset role');assert.equal(await tableState(),before);assert.equal(await otherPolicies(),beforePolicies);checks+=2;
 await db.exec(migration);checks++;
 await db.exec('alter policy records_select on public.support_records using(false)');await assert.rejects(()=>db.exec(migration),/differs from expected/);checks++;
 console.log(JSON.stringify({passed:true,checks,postgresqlExecuted:true,rowsPreserved:1201,organizationAndSessionRulesUnchanged:true,initPlanVerified:true,productionAccess:false}));
}finally{await db.close();}
