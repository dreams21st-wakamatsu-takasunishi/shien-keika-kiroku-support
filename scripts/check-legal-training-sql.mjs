// Isolated PostgreSQL only; no credentials, actual training metadata or production writes.
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const args=process.argv.slice(2);if(!args.includes('--pglite'))throw Error('--pglite required');
const {PGlite}=await import(pathToFileURL(resolve(args[args.indexOf('--pglite')+1])).href);const db=new PGlite();
const org='22222222-2222-4222-8222-222222222222',foreign='33333333-3333-4333-8333-333333333333',one='11111111-1111-4111-8111-111111111111',two='44444444-4444-4444-8444-444444444444';
const deny=async(sql,code)=>assert.rejects(()=>db.exec(sql),e=>e.code===code);
try{
 await db.exec(`create role authenticated;create role anon;create schema auth;
 create table public.organizations(id uuid primary key);create table public.profiles(id uuid primary key);
 create table public.recorder_profiles(id uuid primary key,organization_id uuid,active boolean,menu_preferences jsonb);
 create table public.audit_logs(organization_id uuid,actor_id uuid,table_name text,row_id text,action text,old_data jsonb,new_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function public.current_organization_id() returns uuid language sql stable as $$select nullif(current_setting('test.org',true),'')::uuid$$;
 create function public.current_user_role() returns text language sql stable as $$select current_setting('test.role',true)$$;
 grant usage on schema public,auth to authenticated,anon;
 insert into public.organizations values('${org}'),('${foreign}');insert into public.profiles values('${one}'),('${two}');
 insert into public.recorder_profiles values('${one}','${org}',true,'{}');`);
 await db.exec(readFileSync('supabase/migrations/202610060002_legal_training.sql','utf8'));
 await db.exec(`set test.uid='${one}';set test.org='${org}';set test.role='manager';set role authenticated;`);
 const cat=(await db.query(`select public.add_legal_training_category('${org}','架空研修') as id`)).rows[0].id;
 const video=(await db.query(`select public.add_legal_training_video('${org}','${cat}','架空動画','https://example.invalid/video','https://example.invalid/material') as id`)).rows[0].id;
 for(const url of ['javascript:alert(1)','http://example.invalid','https://user:pass@example.invalid','https://example.invalid/ bad'])await deny(`select public.add_legal_training_video('${org}','${cat}','無効','${url}',null)`,'23514');
 await deny(`select public.add_legal_training_category('${org}','  ')`,'23514');await deny(`select public.add_legal_training_category('${org}','架空研修')`,'23505');
 await deny(`select public.add_legal_training_category('${foreign}','侵入')`,'42501');
 await db.exec(`set test.role='staff'`);await deny(`select public.add_legal_training_category('${org}','侵入')`,'42501');
 await deny(`update public.legal_training_videos set title='直接変更'`,'42501');
 const complete=async(expected,completed)=> (await db.query(`select public.set_legal_training_completion('${org}','${video}',${completed},${expected}) as value`)).rows[0].value;
 let row=await complete(0,true);assert.equal(row.user_id,one);assert.equal(row.revision,1);assert.ok(row.completed_at);
 assert.equal((await complete(1,true)).completed_at,row.completed_at); // idempotent action preserves server time
 await deny(`select public.set_legal_training_completion('${org}','${video}',false,0)`,'40001');
 await db.exec(`set test.uid='${two}'`);assert.equal((await db.query('select * from public.legal_training_progress')).rows.length,0);
 let other=await complete(0,true);assert.equal(other.user_id,two);
 await db.exec(`set test.uid='${one}'`);row=await complete(1,false);assert.equal(row.completed_at,null);assert.equal(row.revision,2);
 assert.equal((await db.query('select * from public.legal_training_progress')).rows.length,1);
 await deny(`select public.set_legal_training_completion('${org}','${video}',true,2,'${two}')`,'42883');
 await db.exec(`set test.org='${foreign}'`);assert.equal((await db.query('select * from public.legal_training_videos')).rows.length,0);
 await deny(`select public.set_legal_training_completion('${org}','${video}',true,2)`,'42501');
 await db.exec(`set test.org='${org}';set test.role='classroom_manager'`);await deny(`select public.archive_legal_training_item('${org}','video','${video}',1)`,'42501');
 await db.exec(`set test.role='admin'`);await db.exec(`select public.archive_legal_training_item('${org}','video','${video}',1)`);
 await deny(`select public.set_legal_training_completion('${org}','${video}',true,2)`,'22023');assert.equal((await db.query('select * from public.legal_training_progress')).rows.length,1);
 await db.exec(`select public.set_recorder_menu_preferences('${org}','${one}','{"order":["legalTraining","home"],"hidden":[]}'::jsonb)`);
 await db.exec(`reset role;`);assert.equal((await db.query(`select count(*) as count from public.legal_training_progress`)).rows[0].count,2);
 const logs=(await db.query('select new_data,old_data,actor_id from public.audit_logs')).rows;assert.ok(logs.length>=5);assert.ok(!JSON.stringify(logs).includes('https://'));assert.ok(!JSON.stringify(logs).includes('架空'));
 await db.exec(`set role anon`);await deny('select * from public.legal_training_videos','42501');await deny(`select public.set_legal_training_completion('${org}','${video}',true,0)`,'42501');
 console.log(JSON.stringify({passed:true,cases:16,coverage:['migration','manager/admin catalog','staff/leader denial','URL validation','duplicates','self completion and undo','independent users','server timestamp','revision conflicts','foreign tenant denial','no user spoofing','direct mutations denied','archive retains history','redacted audit','anonymous denial','menu compatibility']}));
}finally{await db.close();}
