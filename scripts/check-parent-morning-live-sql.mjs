// Real server, isolated fictional rows, one transaction always rolled back.
// No existing children, staff, records, or morning bodies are queried.
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
if(!process.argv.includes('--rollback-test'))throw Error('--rollback-test required');
if(readFileSync('supabase/.temp/project-ref','utf8').trim()!=='cyqrxhknpboidvetdfgn')throw Error('Linked project mismatch');
const org=randomUUID(),a=randomUUID(),b=randomUUID(),run=randomUUID(),token='a'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
const ddl=process.argv.includes('--include-migrations')?['202611020001_parent_share_drafts.sql','202611020002_morning_sections.sql'].map(f=>readFileSync('supabase/migrations/'+f,'utf8')).join('\n'):'';
const body=`begin;set local statement_timeout='30s';${ddl}
insert into organizations(id,name,device_approval_enabled,shared_staff_login_allowed) values('${org}','共有文・朝礼の架空試験',true,false);
insert into member_invitations(organization_id,email,role) values('${org}','parent-morning-${run}-a@example.invalid','admin'),('${org}','parent-morning-${run}-b@example.invalid','staff');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('${a}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','parent-morning-${run}-a@example.invalid','','{}','{"display_name":"架空朝礼職員A"}',now(),now()),
 ('${b}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','parent-morning-${run}-b@example.invalid','','{}','{"display_name":"架空朝礼職員B","login_method":"staff_id"}',now(),now());
insert into recorder_profiles(id,organization_id,display_name,auth_user_id,individual_login_enabled)
 select gen_random_uuid(),'${org}',display_name,id,true from profiles p where id in ('${a}','${b}') and not exists(select 1 from recorder_profiles r where r.organization_id=p.organization_id and r.display_name=p.display_name and r.active);
update recorder_profiles r set auth_user_id=p.id,individual_login_enabled=true from profiles p where p.organization_id='${org}' and r.organization_id=p.organization_id and r.display_name=p.display_name;
update profiles p set recorder_profile_id=r.id from recorder_profiles r where p.organization_id='${org}' and r.organization_id=p.organization_id and r.auth_user_id=p.id;
insert into organization_devices(organization_id,token_hash,label,device_kind,status,transport_mode_only) values('${org}','${hash}','架空施設共用端末','facility_shared','approved',false);
insert into children(organization_id,id,name) values('${org}','fixture-child','架空児童');
insert into record_templates(organization_id,id,name,template_type) values('${org}','fixture-template','架空テンプレート','平日');
insert into support_records(organization_id,id,template_id,template_name,template_type,child_id,child_name,record_date,retention_until,attendance,expression,snack,recorder_name)
 values('${org}','fixture-record','fixture-template','架空テンプレート','平日','fixture-child','架空児童','2026-11-02','2032-03-31','出席','笑顔','食べた','架空職員');
insert into morning_meeting_records(organization_id,meeting_date,content) values('${org}','2026-11-02',E'旧本文\nそのまま残す。');
create temporary table parent_morning_probe(id int);
create function pg_temp.check(v boolean,label text) returns void language plpgsql as $$begin if v is not true then raise exception 'FIXTURE_CHECK_FAILED: %',label;end if;end$$;
do $$begin execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);end$$;
select set_config('request.jwt.claim.sub','${a}',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.headers','{"x-support-device-token":"${token}"}',true);
set local role authenticated;
select pg_temp.check(load_parent_share_draft('fixture-record') is null,'empty draft');
select save_parent_share_draft('fixture-record','Aの下書き',1,(select updated_at from support_records where organization_id='${org}' and id='fixture-record'),0);
select save_morning_meeting_section('2026-11-02','plan','Aの予定',0);
select set_config('request.jwt.claim.sub','${b}',true);
select pg_temp.check(load_parent_share_draft('fixture-record') is null,'draft private per user');
select save_morning_meeting_section('2026-11-02','staff','Bの連絡',0);
select pg_temp.check(load_morning_meeting_sections('2026-11-02')->'section_document'->>'plan'='Aの予定','other field retained');
select pg_temp.check(load_morning_meeting_sections('2026-11-02')->'section_document'->>'legacy'=E'旧本文\nそのまま残す。','legacy exact');
select pg_temp.check(load_morning_meeting_sections('2026-11-02')->>'updated_by_name'='架空朝礼職員B','server actor');
select pg_temp.check((save_morning_meeting_section('2026-11-02','plan','古い変更',0)->>'conflict')::boolean,'same field conflict');
do $$begin
 begin update morning_meeting_records set content='旧クライアントの上書き' where organization_id='${org}';raise exception 'OLD_WRITE_ALLOWED';exception when serialization_failure then null;end;
 begin perform load_parent_share_draft('missing-record');raise exception 'MISSING_RECORD_ALLOWED';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','${a}',true);
select pg_temp.check(load_parent_share_draft('fixture-record')->>'body'='Aの下書き','other user did not change draft');
do $$begin
 begin perform save_parent_share_draft('fixture-record','競合',1,(select updated_at from support_records where organization_id='${org}' and id='fixture-record'),0);raise exception 'STALE_DRAFT_ALLOWED';exception when serialization_failure then null;end;
 begin perform save_parent_share_draft('fixture-record','古い元記録',0,(select updated_at from support_records where organization_id='${org}' and id='fixture-record'),1);raise exception 'STALE_SOURCE_ALLOWED';exception when serialization_failure then null;end;
end$$;
select delete_parent_share_draft('fixture-record',1);
select pg_temp.check(load_parent_share_draft('fixture-record') is null,'draft soft deletion');
reset role;
select pg_temp.check((select count(*)=1 from support_records where organization_id='${org}' and id='fixture-record'),'source retained');
select pg_temp.check((select count(*)>=2 from morning_meeting_record_revisions where organization_id='${org}'),'history retained');
update organization_devices set device_kind='personal',owner_recorder_profile_id=(select recorder_profile_id from profiles where id='${b}'),transport_mode_only=true where organization_id='${org}';
select set_config('request.jwt.claim.sub','${b}',true);set local role authenticated;
do $$begin
 begin perform load_morning_meeting_sections('2026-11-02');raise exception 'PERSONAL_MORNING_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform load_parent_share_draft('fixture-record');raise exception 'PERSONAL_DRAFT_ALLOWED';exception when insufficient_privilege then null;end;
end$$;
reset role;set local role anon;
do $$begin
 begin perform load_morning_meeting_sections('2026-11-02');raise exception 'ANON_ALLOWED';exception when insufficient_privilege then null;end;
end$$;
reset role;rollback;
select true as passed,not exists(select 1 from organizations where id='${org}') as fictional_rows_rolled_back;`;
mkdirSync('output',{recursive:true});const file=resolve('output/parent-morning-rollback-'+run+'.sql');
try{writeFileSync(file,body);const r=spawnSync('powershell.exe',['-NoProfile','-Command',`npx.cmd supabase --dns-resolver https db query --linked --file '${file.replaceAll("'","''")}' -o json`],{encoding:'utf8',timeout:120000,maxBuffer:4194304});if(r.status!==0)throw Error('Rollback-only server check failed: '+r.stderr.slice(-3000));const result=JSON.parse(r.stdout),last=result.rows?.at(-1);if(!last?.passed||!last.fictional_rows_rolled_back)throw Error('Rollback not verified');console.log(JSON.stringify({passed:true,liveDatabase:true,transactionRolledBack:true,existingDataRead:false,persistentFixtureWrites:0,checks:['source validation','private staff drafts','revision conflicts','legacy preservation','independent sections','server actor','history retention','personal-device denial','anonymous denial']}));}finally{unlinkSync(file);}
