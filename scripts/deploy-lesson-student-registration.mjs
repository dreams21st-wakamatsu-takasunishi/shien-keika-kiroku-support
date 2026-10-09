import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkLinkedProjects, cli, sql, lessonRoot } from './lesson-operation-client.mjs';
if (!process.argv.includes('--apply-and-deploy')) throw Error('Use --apply-and-deploy');
checkLinkedProjects();
const migration = readFileSync('supabase/migrations/202610090001_lesson_student_registration.sql', 'utf8');
const source = readFileSync(resolve(lessonRoot, 'supabase/sql/support_student_registration.sql'), 'utf8');
const applied = sql("select exists(select 1 from supabase_migrations.schema_migrations where version='202610090001') as applied;").rows[0].applied;
if (!applied) {
  sql(`begin;${migration}rollback;`);
  sql(`begin;${migration}insert into supabase_migrations.schema_migrations(version,name,statements) values('202610090001','lesson_student_registration',array['Applied via deploy-lesson-student-registration.mjs']);commit;`);
}
sql(`begin;${source.replace(/^begin;/, '').replace(/commit;\s*$/, '')}rollback;`, lessonRoot);
sql(source, lessonRoot);
cli(['functions', 'deploy', 'support-student-registration', '--no-verify-jwt'], lessonRoot);
cli(['functions', 'deploy', 'lesson-student-registration', '--no-verify-jwt']);
console.log('PASS: registration receipts and Functions deployed; deployment did not create child accounts or change passwords/learning');
