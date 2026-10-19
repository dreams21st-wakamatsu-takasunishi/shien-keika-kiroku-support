// Isolated PostgreSQL/WASM. No Supabase or real account access.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2),runtime=args[args.indexOf('--pglite')+1];if(!runtime||!args.includes('--pglite'))throw Error('--pglite required');
const {PGlite}=await import(pathToFileURL(runtime).href),db=new PGlite();
const org='22222222-2222-4222-8222-222222222222',user='11111111-1111-4111-8111-111111111111',other='33333333-3333-4333-8333-333333333333',recorder='44444444-4444-4444-8444-444444444444',id='55555555-5555-4555-8555-555555555555';
let checks=0;const assert=(ok,label)=>{checks++;if(!ok)throw Error(label);};
const scalar=async sql=>(await db.query(sql)).rows[0];
async function denied(sql,pattern){let error;try{await db.exec(sql);}catch(e){error=e;}assert(error&&pattern.test(error.message),'Expected denial '+pattern+' got '+error?.message);}
const context=async(role='admin',who=user,kind='facility_shared',organization=org)=>{await db.exec(`reset role;select set_config('test.role','${role}',false),set_config('test.uid','${who}',false),set_config('test.kind','${kind}',false),set_config('test.org','${organization}',false);set role authenticated;`);};
try{
await db.exec(`create role authenticated;create role anon;create schema auth;create function auth.uid() returns uuid language sql stable as $$select current_setting('test.uid')::uuid$$;create function public.current_organization_id() returns uuid language sql stable as $$select current_setting('test.org')::uuid$$;create function public.current_user_role() returns text language sql stable as $$select current_setting('test.role')$$;create function public.current_request_device_kind() returns text language sql stable as $$select current_setting('test.kind')$$;create function public.facility_session_allowed() returns boolean language sql stable as $$select true$$;create function public.current_recorder_profile_id() returns uuid language sql stable as $$select '${recorder}'::uuid$$;grant usage on schema auth to authenticated;
create table organizations(id uuid primary key);insert into organizations values('${org}'),('${other}');create table profiles(id uuid primary key,display_name text);insert into profiles values('${user}','Synthetic User'),('${other}','Other User');
create table morning_meeting_records(organization_id uuid,meeting_date date,content text,revision bigint default 1,primary key(organization_id,meeting_date));
create table handover_items(organization_id uuid,id uuid,content text,primary key(organization_id,id));
create function public.current_user_has_permission(p text) returns boolean language sql stable as $$select public.current_user_role() in ('admin','manager')$$;
create table meeting_cases(organization_id uuid,id uuid,title text,revision bigint default 1,created_by uuid default '${user}',editor_user_ids uuid[] default '{}',child_id uuid,meeting_date date default current_date,created_at timestamptz default now(),updated_at timestamptz default now(),updated_by uuid,primary key(organization_id,id));
create table meeting_progress_records(organization_id uuid,meeting_id uuid,approval_status text);
create table activity_plans(organization_id uuid,id uuid,title text,revision bigint default 1,primary key(organization_id,id));
create table facility_documents(organization_id uuid,id uuid,title text,revision bigint default 1,primary key(organization_id,id));
create table supply_items(organization_id uuid,id uuid,name text,revision bigint default 1,quantity integer default 7,primary key(organization_id,id));
create table staff_shift_requests(organization_id uuid,id uuid primary key,recorder_profile_id uuid,created_by uuid,status text,requested_date date,updated_at timestamptz,created_at timestamptz default now());
create table attendance_correction_requests(organization_id uuid,id uuid primary key,recorder_profile_id uuid,created_by uuid,status text,updated_at timestamptz,created_at timestamptz default now());`);
const tables=['meeting_cases','morning_meeting_records','handover_items','activity_plans','facility_documents','supply_items'];
for(const table of tables)await db.exec(`alter table ${table} enable row level security;create policy base_read on ${table} for select to authenticated using(organization_id=public.current_organization_id());create policy base_update on ${table} for update to authenticated using(organization_id=public.current_organization_id()) with check(organization_id=public.current_organization_id());grant select,insert,update on ${table} to authenticated;`);
// Exercise Supabase-style broad default grants: private snapshots must revoke them.
await db.exec('alter default privileges in schema public grant all on tables to authenticated,anon');
await db.exec(readFileSync(new URL('../supabase/migrations/202610190001_workspace_trash_and_withdrawals.sql',import.meta.url),'utf8'));
await db.exec('create trigger meeting_case_prepare before insert or update on meeting_cases for each row execute function prepare_meeting_case()');
await context();await db.exec('reset role');
for(const table of tables){const key=table==='morning_meeting_records'?'meeting_date':'id',value=key==='id'?id:'2026-10-19',label=table==='morning_meeting_records'||table==='handover_items'?'content':table==='supply_items'?'name':'title';await db.exec(`insert into ${table}(organization_id,${key},${label}) values('${org}','${value}','Synthetic retained content');`);}
// Existing production validators must also accept metadata-only lifecycle changes.
for(const table of ['activity_plans','facility_documents','supply_items'])await db.exec(`alter table ${table} add column created_by uuid default '${user}',add column created_at timestamptz default now(),add column updated_by uuid,add column updated_at timestamptz`);
await db.exec(`alter table activity_plans add column status text default '下書き',add column content jsonb default '{"goal":"","target":"","location":"","leader":"","startTime":"","considerations":"","safety":"","roles":"","reflection":"","nextTime":"","steps":[],"preparations":[]}';alter table facility_documents add column kind text default 'inspection',add column status text default '下書き',add column content jsonb default '{"author":"","notes":"","greeting":"","body":"","upcoming":"","belongings":"","contact":"","items":[]}'`);
for(const [file,name,table] of [['202610040001_activity_plans.sql','prepare_activity_plan','activity_plans'],['202610040002_facility_work.sql','prepare_facility_document','facility_documents'],['202610040002_facility_work.sql','prepare_supply_item','supply_items']]){
 const source=readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'),fn=source.match(new RegExp('create or replace function public\\.'+name+'\\(\\)[\\s\\S]*?\\$\\$;'))?.[0];if(!fn)throw Error('Validator missing '+name);await db.exec(fn);await db.exec(`create trigger original_prepare before update on ${table} for each row execute function ${name}()`);
}
await context();
for(const table of tables){const value=table==='morning_meeting_records'?'2026-10-19':id;
 await db.exec(`select change_workspace_item_lifecycle('${table}','${value}',1,false);`);
 assert((await scalar(`select count(*)::int n from ${table}`)).n===1,'soft deletion retains '+table);
 await denied(`select change_workspace_item_lifecycle('${table}','${value}',1,true)`,/WORKSPACE_CONFLICT/);
 await denied(`update ${table} set revision=revision+1 where organization_id='${org}'`,/WORKSPACE_ITEM_DELETED/);
 await context('staff');assert((await scalar(`select count(*)::int n from ${table}`)).n===0,'staff cannot read deleted '+table);
 if(table==='meeting_cases')assert((await scalar(`select can_read_meeting('${org}','${id}') allowed`)).allowed===false,'retired child meeting endpoints also hidden');
 await denied(`select change_workspace_item_lifecycle('${table}','${value}',2,true)`,/FORBIDDEN/);
 await context('manager',''+user,'personal');await denied(`select list_workspace_trash()`,/FORBIDDEN/);
 await context('manager');const trash=(await scalar('select list_workspace_trash() items')).items;
 assert(trash.some(row=>row.resource===table&&row.deleted_by_name==='Synthetic User'),'trash metadata identifies actor '+table);
 await db.exec(`select change_workspace_item_lifecycle('${table}','${value}',2,true)`);
 assert((await scalar(`select revision from ${table}`)).revision===3,'restore advances version '+table);
 await denied(`update ${table} set deleted_at=now()`,/RPC_REQUIRED/);
}
assert((await scalar('select count(*)::int n from workspace_lifecycle_events')).n===12,'append deletion and restore events');
await db.exec(`reset role;insert into meeting_progress_records values('${org}','${id}','確認済み')`);await context();
await denied(`update meeting_cases set title='changed',revision=revision+1`,/Approved meetings are locked/);
await db.exec(`select change_workspace_item_lifecycle('meeting_cases','${id}',3,false);select change_workspace_item_lifecycle('meeting_cases','${id}',4,true)`);
assert((await scalar('select title,revision from meeting_cases')).title==='Synthetic retained content','approved meeting deletion/restore retains original body');
await denied(`update meeting_cases set title='changed',revision=revision+1`,/Approved meetings are locked/);
await denied('select request_snapshot from workspace_lifecycle_events',/permission denied/);
await denied(`select change_workspace_item_lifecycle('profiles','${user}',1,false)`,/INVALID_RESOURCE/);
await context('admin',user,'facility_shared',other);await denied(`select change_workspace_item_lifecycle('activity_plans','${id}',3,false)`,/NOT_FOUND/);
await context();
for(const table of ['staff_shift_requests','attendance_correction_requests']){
 await db.exec(`reset role;insert into ${table}(organization_id,id,recorder_profile_id,created_by,status,updated_at${table==='staff_shift_requests'?',requested_date':''}) values('${org}','${id}','${recorder}','${user}','申請中','2026-10-19T01:00Z'${table==='staff_shift_requests'?',current_date':''});`);await context('staff',other);
 await denied(`select withdraw_own_workspace_request('${table}','${id}','2026-10-19T01:00Z')`,/FORBIDDEN/);
 await context('staff');await denied(`select withdraw_own_workspace_request('${table}','${id}','2026-10-19T00:00Z')`,/CHANGED/);
 await db.exec(`select withdraw_own_workspace_request('${table}','${id}','2026-10-19T01:00Z')`);
 await db.exec('reset role');assert((await scalar(`select count(*)::int n from ${table}`)).n===0,'pending request removed '+table);
 await denied(`insert into ${table}(organization_id,id,recorder_profile_id,created_by,status,updated_at) values('${org}','${id}','${recorder}','${user}','承認','2026-10-19T01:00Z')`,/ALREADY_WITHDRAWN/);
 const approvedId='66666666-6666-4666-8666-666666666666';
 await db.exec(`insert into ${table}(organization_id,id,recorder_profile_id,created_by,status,updated_at) values('${org}','${approvedId}','${recorder}','${user}','申請中','2026-10-19T01:00Z');update ${table} set status='承認' where id='${approvedId}'`);await context('staff');
 await denied(`select withdraw_own_workspace_request('${table}','${approvedId}','2026-10-19T01:00Z')`,/ALREADY_REVIEWED/);
}
await db.exec('reset role');assert((await scalar("select count(*)::int n from workspace_lifecycle_events where action='withdraw' and request_snapshot->>'status'='申請中'")).n===2,'withdrawal preserves snapshots and audit');
assert((await scalar('select quantity from supply_items')).quantity===7,'no stock movement or balance changes');
console.log(JSON.stringify({passed:true,checks,isolatedDatabase:true,productionAccess:false}));
}finally{await db.close();}
