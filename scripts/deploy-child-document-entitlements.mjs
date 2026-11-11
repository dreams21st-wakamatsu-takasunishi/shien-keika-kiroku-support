// Explicit production apply. Only schema, access rules and migration history.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sql,supportRef} from './lesson-operation-client.mjs';

const mode=process.argv[2];
if(process.argv.length!==3||!['--preflight','--apply'].includes(mode))throw Error('Use --preflight or --apply after tests and approval');
assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),supportRef,'Unexpected linked project');
const target=[['202611110001','child_document_monitoring_months'],['202611110002','visiting_documents_entitlements']];
const existing=sql("select version,name from supabase_migrations.schema_migrations where version in ('202610150006','202611110001','202611110002');").rows;
assert.ok(existing.some(row=>row.version==='202610150006'),'Base document schema migration not recorded');
for(const [version,name] of target)if(existing.some(row=>row.version===version))assert.ok(existing.some(row=>row.version===version&&row.name===name),'Migration version collision');
const pending=target.filter(([version])=>!existing.some(row=>row.version===version));
assert.ok(pending.length!==1||pending[0][0]===target[1][0],'Migration order mismatch');
const ddl=pending.map(([version,name])=>readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8')).join('\n');
if(ddl)sql("begin; set local lock_timeout='5s';\n"+ddl+"\nrollback;");
if(mode==='--preflight'){
 console.log(JSON.stringify({passed:true,project:supportRef,rollbackVerified:true,pending:pending.map(row=>row[0]),realRowsWritten:0}));process.exit(0);
}
if(ddl)sql("begin; set local lock_timeout='5s';\n"+ddl+'\n'+pending.map(([version,name])=>
 `insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[]::text[]);`).join('\n')+'\ncommit;');
const verified=sql(`select
 (select count(*)::int from supabase_migrations.schema_migrations where version in ('202611110001','202611110002')) applied,
 (select relrowsecurity from pg_class where oid='public.child_visiting_plans'::regclass) visit_rls,
 has_table_privilege('authenticated','public.child_visiting_plans','select') direct_visit_read,
 has_function_privilege('anon','public.get_child_service_entitlements(date,text[],text)','execute') anonymous_read,
 has_function_privilege('authenticated','public.get_child_service_entitlements(date,text[],text)','execute') authenticated_rpc,
 has_function_privilege('anon','public.save_child_document_entry_v3(text,jsonb)','execute') anonymous_save;`).rows[0];
assert.deepEqual(verified,{applied:2,visit_rls:true,direct_visit_read:false,anonymous_read:false,authenticated_rpc:true,anonymous_save:false});
console.log(JSON.stringify({passed:true,...verified,migrations:target.map(row=>row[0]),realRowsWritten:0}));
