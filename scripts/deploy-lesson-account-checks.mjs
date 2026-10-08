import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkLinkedProjects, cli, sql, lessonRoot } from './lesson-operation-client.mjs';
if (!process.argv.includes('--apply-and-deploy')) throw Error('Use --apply-and-deploy to add audit objects and deploy account-check Functions');
checkLinkedProjects();
const migration = readFileSync('supabase/migrations/202610080001_lesson_account_checks.sql', 'utf8');
const applied = sql("select exists(select 1 from supabase_migrations.schema_migrations where version='202610080001') as applied;").rows[0].applied;
if (!applied) {
  sql(`begin;${migration}rollback;`);
  sql(`begin;${migration}insert into supabase_migrations.schema_migrations(version,name,statements) values('202610080001','lesson_account_checks',array['Applied via deploy-lesson-account-checks.mjs']);commit;`);
}
sql(readFileSync(resolve(lessonRoot, 'supabase/sql/support_account_checks.sql'), 'utf8'), lessonRoot);
cli(['functions', 'deploy', 'support-learning-accounts', '--no-verify-jwt'], lessonRoot);
cli(['functions', 'deploy', 'lesson-accounts', '--no-verify-jwt']);
cli(['functions', 'deploy', 'lesson-learning', '--no-verify-jwt']);
console.log('PASS: dedicated permission and audit schema applied; account inspection/card verification Functions deployed; no operational account/password/learning data changed');
