// Fictional, isolated PostgreSQL: never connects to production.
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const args=process.argv.slice(2);if(!args.includes('--pglite'))throw Error('--pglite required');
const {PGlite}=await import(pathToFileURL(resolve(args[args.indexOf('--pglite')+1])).href),db=new PGlite();
const org='22222222-2222-4222-8222-222222222222',foreign='33333333-3333-4333-8333-333333333333',actor='11111111-1111-4111-8111-111111111111',record='44444444-4444-4444-8444-444444444444';let checks=0;
async function denied(sql,code){await assert.rejects(()=>db.exec(sql),e=>e.code===code);checks++;}
const query=async sql=>(await db.query(sql)).rows;
try{
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;
 create table organizations(id uuid primary key);create table profiles(id uuid primary key,display_name text);
 create table audit_logs(organization_id uuid,actor_id uuid,table_name text,row_id text,action text check(action in ('INSERT','UPDATE','DELETE')),old_data jsonb,new_data jsonb);
 create table attendance_records(id uuid primary key,organization_id uuid,clock_in_at timestamptz,clock_out_at timestamptz,break_periods jsonb,updated_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function current_organization_id() returns uuid language sql stable as $$select nullif(current_setting('test.org',true),'')::uuid$$;
 create function current_user_role() returns text language sql stable as $$select nullif(current_setting('test.role',true),'')$$;
 create function facility_session_allowed() returns boolean language sql stable as $$select coalesce(current_setting('test.allowed',true),'false')::boolean$$;
 create function current_request_device_kind() returns text language sql stable as $$select current_setting('test.device',true)$$;
 grant usage on schema public,auth to authenticated,anon;
 insert into organizations values('${org}'),('${foreign}');insert into profiles values('${actor}','架空管理者');
 insert into attendance_records values('${record}','${org}','2026-10-01T09:00:00+09','2026-10-01T18:00:00+09','[]','2026-10-01T18:00:00+09');
 grant select,update on attendance_records to authenticated;`);
 const before=await query('select * from attendance_records');
 for(const file of ['202610270001_external_ai_privacy.sql','202610270002_attendance_actual_break.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 assert.deepEqual((await query('select id,organization_id,clock_in_at,clock_out_at,break_periods,updated_at from attendance_records')),before);checks++;
 assert.equal((await query('select count(*)::int as n from external_ai_policies'))[0].n,0);checks++;
 await db.exec(`set test.uid='${actor}';set test.org='${org}';set test.role='admin';set test.allowed='true';set test.device='facility';set role authenticated`);
 const policy=async()=> (await query('select get_external_ai_policy() as p'))[0].p;
 assert.equal((await policy()).enabled,false);checks++;
 await denied('select * from external_ai_policies','42501');
 const enable=(revision,checks='true,true,true')=>`select set_external_ai_policy(true,${revision},${checks})`;
 await denied(enable(0,'false,true,true'),'22023');
 for(const role of ['staff','manager','classroom_manager','']){await db.exec(`set test.role='${role}'`);await denied(enable(0),'42501');await denied(`select confirm_attendance_break('${record}','2026-10-01T18:00:00+09',60,'確認')`,'42501');}
 await db.exec("set test.role='admin'");await db.exec(enable(0));assert.equal((await policy()).revision,1);checks++;
 await denied(enable(0),'40001');
 await db.exec(`set test.org='${foreign}'`);assert.equal((await policy()).enabled,false);checks++;
 await denied(`select confirm_attendance_break('${record}','2026-10-01T18:00:00+09',60,'確認')`,'40001');
 await db.exec(`set test.org='${org}';set test.device='personal'`);await denied('select get_external_ai_policy()','42501');await denied(enable(1),'42501');await denied(`select confirm_attendance_break('${record}','2026-10-01T18:00:00+09',60,'確認')`,'42501');
 await db.exec("set test.device='facility';set test.allowed='false'");await denied('select get_external_ai_policy()','42501');await denied(enable(1),'42501');
 await db.exec("set test.allowed='true'");
 const confirm=(minutes,reason='実際の休憩を確認',stamp='2026-10-01T18:00:00+09')=>`select confirm_attendance_break('${record}','${stamp}',${minutes},'${reason}')`;
 for(const minutes of [-1,541,1441])await denied(confirm(minutes),'22023');
 await denied(confirm(60,''),'22023');await denied(confirm(60,'確認','2026-10-01T17:00:00+09'),'40001');
 await denied(`update attendance_records set confirmed_break_minutes=60`,'42501');
 await db.exec(confirm(60));let saved=(await query('select * from attendance_records'))[0];assert.equal(saved.confirmed_break_minutes,60);assert.equal(saved.break_confirmed_by,actor);assert.ok(saved.break_confirmed_at);checks++;
 await denied(confirm(0),'40001');
 await db.exec(confirm(0,'休憩なしを本人に確認',saved.updated_at.toISOString()));assert.equal((await query('select * from attendance_records'))[0].confirmed_break_minutes,0);checks++;
 await db.exec(`update attendance_records set clock_out_at='2026-10-01T17:00:00+09',updated_at=now()`);saved=(await query('select * from attendance_records'))[0];assert.equal(saved.confirmed_break_minutes,null);assert.equal(saved.break_confirmed_at,null);checks++;
 await db.exec('select set_external_ai_policy(false,1,false,false,false)');assert.equal((await policy()).enabled,false);assert.equal((await policy()).revision,2);checks++;
 await db.exec('reset role');const logs=await query('select * from audit_logs');assert.equal(logs.filter(l=>l.table_name==='attendance_break_confirmations').length,2);assert.equal(logs.filter(l=>l.table_name==='external_ai_policies').length,2);checks++;
 await db.exec('set role anon');await denied('select get_external_ai_policy()','42501');await denied(enable(2),'42501');await denied(confirm(60),'42501');
 await db.exec('reset role');
 await db.exec(`create table organization_ai_settings(id int,payload text);create table ai_generation_logs(id int,payload text);create table assistant_actions(id int,payload text);create table meeting_export_events(id int,payload text);
 insert into organization_ai_settings values(1,'historical-settings');insert into ai_generation_logs values(1,'historical-log');insert into assistant_actions values(1,'historical-action');insert into meeting_export_events values(1,'historical-event');
 grant all on organization_ai_settings,ai_generation_logs,assistant_actions,meeting_export_events to authenticated,service_role;`);
 await db.exec(enable(2));
 const oldAttendance=await query('select * from attendance_records');
 await db.exec(readFileSync('supabase/migrations/202610270003_retire_external_ai.sql','utf8'));
 assert.deepEqual(await query('select * from attendance_records'),oldAttendance);checks++;
 assert.equal((await query('select enabled from external_ai_policies'))[0].enabled,false);checks++;
 await denied('select get_external_ai_policy()','0A000');await denied(enable(3),'0A000');
 for(const role of ['authenticated','service_role']){await db.exec('set role '+role);await denied('select get_external_ai_policy()','42501');await denied(enable(3),'42501');await denied('update organization_ai_settings set payload=\'changed\'','42501');await denied('insert into ai_generation_logs values(2,\'new\')','42501');await db.exec('reset role');}
 for(const table of ['organization_ai_settings','ai_generation_logs','assistant_actions','meeting_export_events']){assert.equal((await query('select count(*)::int as n from '+table))[0].n,1);checks++;}
 await db.exec(readFileSync('supabase/migrations/202610270004_restore_manual_tiro_handoff.sql','utf8'));
 await db.exec('set role authenticated');await denied('select get_external_ai_policy()','42501');await denied(enable(3),'42501');await db.exec("insert into meeting_export_events values(2,'manual export')");checks++;
 await denied("update meeting_export_events set payload='changed'",'42501');await denied('delete from meeting_export_events','42501');await db.exec('reset role');
 assert.equal((await query('select enabled from external_ai_policies'))[0].enabled,false);checks++;
 console.log(JSON.stringify({passed:true,checks,productionWrites:0,externalAiRetired:true,manualTiroOnly:true,legacyRowsPreserved:true}));
}finally{await db.close();}
