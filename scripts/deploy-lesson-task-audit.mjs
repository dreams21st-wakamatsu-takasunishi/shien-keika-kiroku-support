import {readFileSync} from 'node:fs';
import {checkLinkedProjects,cli,sql} from './lesson-operation-client.mjs';
if(!process.argv.includes('--apply-and-deploy'))throw Error('Use --apply-and-deploy');
checkLinkedProjects();
const version='202610150002',name='lesson_task_audit';
const existing=sql(`select name from supabase_migrations.schema_migrations where version='${version}';`).rows;
if(existing.length&&existing[0].name!==name)throw Error('Migration version belongs to another feature; do not skip or overwrite it');
if(!existing.length){
 const migration=readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
 sql('begin;'+migration+'rollback;');
 sql('begin;'+migration+`insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[]::text[]);commit;`);
}
const functions=sql("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('can_view_lesson_task_audit','read_lesson_task_audit');").rows;
if(functions.length!==2)throw Error('Task audit SQL functions are missing; refusing endpoint deployment');
sql("notify pgrst, 'reload schema';");
cli(['functions','deploy','lesson-task-audit','--no-verify-jwt']);
cli(['functions','deploy','lesson-learning','--no-verify-jwt']);
console.log('PASS: admin-only read projection and history endpoint deployed; no learner/Auth/source writes or creator-policy expansion');
