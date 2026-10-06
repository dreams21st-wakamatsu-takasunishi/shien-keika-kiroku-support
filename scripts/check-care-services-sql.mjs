// Run only against an isolated, in-memory PostgreSQL. No production credentials.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),modulePath=args[args.indexOf('--pglite')+1];
if(!args.includes('--pglite'))throw Error('--pglite must name the installed PGlite entry point');
const {PGlite}=await import(pathToFileURL(resolve(modulePath)).href),db=new PGlite();
const org='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',user='11111111-1111-4111-8111-111111111111';
const expectError=async(sql,code)=>{await assert.rejects(()=>db.exec(sql),error=>error.code===code,sql);};
try{
 await db.exec(`create role authenticated;create role anon;create schema auth;
 create table public.organizations(id uuid primary key);
 create table public.children(organization_id uuid,id text,care_type text constraint children_care_type_check check(care_type is null or care_type in ('児童発達支援','放課後等デイサービス')),primary key(organization_id,id));
 create table public.audit_logs(organization_id uuid,actor_id uuid,table_name text,row_id text,action text,old_data jsonb,new_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function public.current_organization_id() returns uuid language sql stable as $$select nullif(current_setting('test.org',true),'')::uuid$$;
 create function public.current_user_role() returns text language sql stable as $$select current_setting('test.role',true)$$;
 grant usage on schema public,auth to authenticated,anon;
 insert into public.organizations values('${org}'),('${other}');
 insert into public.children values('${org}','existing','放課後等デイサービス');`);
 const audit=readFileSync('supabase/migrations/202608100006_transport_plan_audit_and_monthly_refresh.sql','utf8');
 await db.exec(audit.slice(audit.indexOf('create or replace function public.write_audit_log()'),audit.indexOf('create or replace function public.replace_monthly_transport_requirements')));
 await db.exec(readFileSync('supabase/migrations/202610060001_visiting_service_selection.sql','utf8'));
 assert.equal((await db.query('select visiting_support_enabled from public.children')).rows[0].visiting_support_enabled,false);
 await db.exec(`insert into public.children values('${org}','visit','保育所等訪問支援',true)`);
 await expectError(`insert into public.children values('${org}','bad','未知',false)`,'23514');
 await db.exec(`set test.uid='${user}';set test.org='${org}';set test.role='admin';set role authenticated;`);
 await db.exec(`insert into public.organization_service_settings(organization_id,service_types,updated_by) values('${org}',array['放課後等デイサービス','保育所等訪問支援'],'${other}')`);
 let own=(await db.query('select * from public.organization_service_settings')).rows;
 assert.equal(own.length,1);assert.equal(own[0].updated_by,user);assert.equal(own[0].revision,1);
 await expectError(`insert into public.organization_service_settings(organization_id,service_types) values('${other}',array['保育所等訪問支援'])`,'42501');
 await expectError(`update public.organization_service_settings set service_types=array['児童発達支援'],revision=1`,'40001');
 for(const types of ["array[]::text[]","array['未知']","array['保育所等訪問支援','保育所等訪問支援']","array['保育所等訪問支援',null]"]){await expectError(`update public.organization_service_settings set service_types=${types},revision=2`,'23514');}
 await db.exec(`update public.organization_service_settings set service_types=array['児童発達支援','保育所等訪問支援'],revision=2`);
 await db.exec(`set test.role='manager';`);
 assert.equal((await db.query(`update public.organization_service_settings set revision=3 returning *`)).rows.length,0);
 await db.exec(`set test.org='${other}';set test.role='staff';`);
 assert.equal((await db.query('select * from public.organization_service_settings')).rows.length,0);
 await expectError(`insert into public.organization_service_settings(organization_id,service_types) values('${other}',array['保育所等訪問支援'])`,'42501');
 await db.exec('reset role;set role anon');
 await expectError('select * from public.organization_service_settings','42501');
 await db.exec('reset role;');
 const logs=(await db.query('select * from public.audit_logs')).rows;
 assert.equal(logs.length,2);assert.equal(logs[0].organization_id,org);assert.equal(logs[1].action,'UPDATE');
 console.log(JSON.stringify({passed:true,cases:['migration executes','existing child preservation','visiting child selection','unsupported service rejection','own admin insert/update','server actor attribution','foreign tenant rejection','optimistic conflict','empty/duplicate/null/unknown rejection','manager/staff mutation denial','tenant isolation','anonymous denial','audit records']}));
}finally{await db.close();}
