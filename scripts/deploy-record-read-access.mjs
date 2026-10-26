// Explicit apply only. DDL + migration history; never exports record bodies.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sql,supportRef} from './lesson-operation-client.mjs';
if(process.argv.length!==3||process.argv[2]!=='--apply')throw Error('Use --apply only after isolated SQL tests and release approval');
assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),supportRef,'Unexpected linked project');
const version='202610260001',name='record_read_access_initplan';
const migration=readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
const existing=sql(`select name from supabase_migrations.schema_migrations where version='${version}';`).rows;
if(existing.length){assert.equal(existing[0].name,name,'Migration version belongs to another feature');}
else{
 sql('begin;'+migration+'rollback;');
 sql('begin;'+migration+`insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[]::text[]);commit;`);
}
const rows=sql("select policyname,qual,cmd,to_json(roles) as roles from pg_policies where schemaname='public' and tablename='support_records' and policyname='records_select';").rows;
assert.equal(rows.length,1);assert.equal(rows[0].cmd,'SELECT');assert.deepEqual(rows[0].roles,['public']);
assert.match(rows[0].qual,/SELECT current_organization_id\(\)/);
console.log(JSON.stringify({passed:true,migration:version,stableOrganizationCheckPerStatement:true,recordReadRolesUnchanged:true,recordRowsWritten:0,draftsWritten:0,realDataExported:false}));
