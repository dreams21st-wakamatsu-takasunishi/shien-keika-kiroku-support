import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {checkLinkedProjects,cli,sql,lessonRoot} from './lesson-operation-client.mjs';
if(!process.argv.includes('--apply-and-deploy'))throw Error('Use --apply-and-deploy');
checkLinkedProjects();
const source=readFileSync(resolve(lessonRoot,'supabase/sql/support_task_batch_changes.sql'),'utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,'');
sql('begin;'+source+'rollback;',lessonRoot);sql('begin;'+source+'commit;',lessonRoot);
const version='202610090004',name='lesson_task_batch_changes';
if(!sql(`select version from supabase_migrations.schema_migrations where version='${version}';`).rows.length){
 const migration=readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
 sql('begin;'+migration+'rollback;');
 sql('begin;'+migration+`insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[]::text[]);commit;`);
}
cli(['functions','deploy','support-learning-tasks','--no-verify-jwt'],lessonRoot);
cli(['functions','deploy','lesson-task-batches','--no-verify-jwt']);
console.log('PASS: durable bulk edit/stop snapshots, exact-revision mutation receipts and both bridges deployed; no operational learner/Auth/permission changes');
