// Isolated PostgreSQL only. No production accounts, records or credentials.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const args=process.argv.slice(2);if(!args.includes('--pglite'))throw Error('--pglite required');
const entry=resolve(args[args.indexOf('--pglite')+1]);
const {PGlite}=await import(pathToFileURL(entry).href),{pgcrypto}=await import(pathToFileURL(resolve(dirname(entry),'contrib/pgcrypto.js')).href);
const db=new PGlite({extensions:{pgcrypto}}),org='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',token='a'.repeat(64);let checks=0;
const value=async sql=>(await db.query(sql)).rows[0].v;
const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
const denied=async(sql,code)=>{await assert.rejects(()=>db.exec(sql),e=>e.code===code);checks++;};
const route=(code='TEST123456',id='staff001',device=token)=>value(`select resolve_unified_login(${code===null?'null':`'${code}'`},'${device}','${id}') as v`);
try{
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema extensions;create extension pgcrypto with schema extensions;
 create table organizations(id uuid primary key,staff_login_code text unique);
 create table organization_devices(organization_id uuid,token_hash text,status text,device_kind text);
 create table recorder_profiles(id int primary key,organization_id uuid,employee_code text,active boolean default true);
 create table facility_login_credentials(organization_id uuid primary key,login_id text,enabled boolean,password_hash text);
 insert into organizations values('${org}','TEST123456'),('${other}','OTHER12345');
 insert into recorder_profiles values(1,'${org}','staff001',true),(2,'${org}','legacy',false),(3,'${other}','staff001',true);
 insert into facility_login_credentials values('${org}','legacy',true,'KEEP-HASH'),('${other}','facility',false,'OTHER-HASH');
 insert into organization_devices values('${org}',encode(extensions.digest('${token}','sha256'),'hex'),'approved','personal');
 grant usage on schema public to service_role,authenticated,anon;`);
 const before=(await db.query('select * from facility_login_credentials order by organization_id')).rows;
 await db.exec(readFileSync('supabase/migrations/202610300001_unified_login.sql','utf8'));
 eq((await db.query('select * from facility_login_credentials order by organization_id')).rows,before);
 await db.exec('set role anon');await denied(`select resolve_unified_login('TEST123456','${token}','staff001')`,'42501');
 await db.exec('set role authenticated');await denied(`select resolve_unified_login('TEST123456','${token}','staff001')`,'42501');
 await db.exec('set role service_role');eq(await route(),{method:'staff',organizationCode:'TEST123456'});
 eq(await route(null),{method:'staff',organizationCode:'TEST123456'});
 eq(await route('TEST123456','legacy'),{error:'ambiguous'});
 eq(await route('TEST123456','missing'),{error:'invalid'});
 eq(await route('BAD123456'),{error:'invalid'});
 eq(await route('TEST123456','staff001','bad'),{error:'invalid'});
 eq(await route('TEST123456','bad id'),{error:'invalid'});
 eq(await route('OTHER12345','facility'),{method:'facility',organizationCode:'OTHER12345'});
 await db.exec('reset role');
 await db.exec("update facility_login_credentials set login_id='facility' where organization_id='"+org+"'");
 await db.exec('set role service_role');eq(await route('TEST123456','FACILITY'),{method:'facility',organizationCode:'TEST123456'});await db.exec('reset role');
 await denied(`insert into recorder_profiles values(4,'${org}','FACILITY',true)`,'23505');
 await denied(`update recorder_profiles set employee_code='facility' where id=1`,'23505');
 await denied(`update facility_login_credentials set login_id='STAFF001' where organization_id='${org}'`,'23505');
 await denied(`insert into recorder_profiles values(5,'${other}','facility',true)`,'23505');
 eq(await value('select employee_code as v from recorder_profiles where id=1'),'staff001');
 // Approval changes, absent devices and ambiguous multi-organization devices cannot auto-select an organization.
 for(const status of ['pending','revoked']){
  await db.exec(`update organization_devices set status='${status}'`);await db.exec('set role service_role');eq(await route(null),{error:'organization_required'});await db.exec('reset role');
 }
 await db.exec("update organization_devices set status='approved'");
 await db.exec(`insert into organization_devices values('${other}',encode(extensions.digest('${token}','sha256'),'hex'),'approved','facility_shared')`);
 await db.exec('set role service_role');eq(await route(null),{error:'organization_required'});eq(await route('TEST123456'),{method:'staff',organizationCode:'TEST123456'});eq(await route(null,'staff001','b'.repeat(64)),{error:'organization_required'});
 console.log(JSON.stringify({passed:true,checks,legacyDataUnchanged:true,serviceOnlyRouting:true,approvalAndNamespaceChecked:true,productionWrites:0}));
}finally{await db.close();}
