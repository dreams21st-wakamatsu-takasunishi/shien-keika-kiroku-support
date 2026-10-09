import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {checkLinkedProjects,cli,sql,lessonRoot} from './lesson-operation-client.mjs';
if(!process.argv.includes('--apply-and-deploy'))throw Error('Use --apply-and-deploy');
checkLinkedProjects();
const source=['support_learning_task_stages.sql','support_task_targets.sql'].map(file=>readFileSync(resolve(lessonRoot,'supabase/sql',file),'utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,'')).join('\n');
sql('begin;'+source+'rollback;',lessonRoot);sql('begin;'+source+'commit;',lessonRoot);
const version='202610090003',name='lesson_task_batches';
const present=sql(`select version from supabase_migrations.schema_migrations where version='${version}';`).rows;
const migration=readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
if(!present.length){
 sql('begin;'+migration+'rollback;');
 sql('begin;'+migration+`insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[]::text[]);commit;`);
}else{
 const definition=migration.slice(migration.indexOf('create or replace function public.mutate_lesson_task_batch('));
 sql('begin;'+definition+'rollback;');sql('begin;'+definition+'commit;');
}
cli(['functions','deploy','support-learning-tasks','--no-verify-jwt'],lessonRoot);
cli(['functions','deploy','lesson-task-batches','--no-verify-jwt']);
console.log('PASS: batch storage, scoped target metadata, atomic campus/group checks and batch bridge deployed; no operational accounts or permissions changed');
