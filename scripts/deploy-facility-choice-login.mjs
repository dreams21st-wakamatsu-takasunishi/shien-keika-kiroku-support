import {readFileSync} from 'node:fs';
import {checkLinkedProjects,cli,sql} from './lesson-operation-client.mjs';
if(!process.argv.includes('--apply-and-deploy'))throw Error('Use --apply-and-deploy');
checkLinkedProjects();const version='202610150003',name='facility_choice_login';
const existing=sql(`select name from supabase_migrations.schema_migrations where version='${version}';`).rows;
if(existing.length&&existing[0].name!==name)throw Error('Migration version conflict');
const migration=readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
if(!existing.length){
 sql('begin;'+migration+'rollback;');
 sql('begin;'+migration+`insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[]::text[]);commit;`);
}
for(const [guardVersion,guardName] of [['202610150004','facility_choice_session_guards'],['202610150005','facility_choice_audit_references']]){
const guardExisting=sql(`select name from supabase_migrations.schema_migrations where version='${guardVersion}';`).rows;
if(guardExisting.length&&guardExisting[0].name!==guardName)throw Error('Session guard migration version conflict');
if(!guardExisting.length){const guard=readFileSync(`supabase/migrations/${guardVersion}_${guardName}.sql`,'utf8');sql('begin;'+guard+'rollback;');sql('begin;'+guard+`insert into supabase_migrations.schema_migrations(version,name,statements) values('${guardVersion}','${guardName}',array[]::text[]);commit;`);}
}
if(sql("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('begin_facility_choice_login','consume_facility_choice_login','finish_facility_choice_login','facility_session_allowed');").rows.length!==4)throw Error('Facility login functions missing');
sql("notify pgrst, 'reload schema';");
if(process.argv.includes('--sql-only')){console.log('PASS: facility choice SQL guards applied; Functions not redeployed');process.exit(0);}
for(const fn of ['facility-login','staff-login','attendance-qr-login','invite-member','manage-member','manage-recorder-login','home-assistant','polish-record','optimize-transport-route','geocode-transport-locations','calculate-transport-matrix','send-transport-notification','send-announcement-notification'])cli(['functions','deploy',fn,'--no-verify-jwt']);
console.log('PASS: facility choice login and session/device/role gates deployed; disabled until administrator configures it; no operational credentials or Auth changed');
