import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkLinkedProjects, cli, sql, lessonRoot } from './lesson-operation-client.mjs';
if (!process.argv.includes('--apply-and-deploy')) throw Error('Use --apply-and-deploy to add credential receipts and deploy Functions');
checkLinkedProjects();
const migration = readFileSync('supabase/migrations/202610080002_lesson_account_credentials.sql', 'utf8');
const applied = sql("select exists(select 1 from supabase_migrations.schema_migrations where version='202610080002') as applied;").rows[0].applied;
if (!applied) {
  sql(`begin;${migration}rollback;`);
  sql(`begin;${migration}insert into supabase_migrations.schema_migrations(version,name,statements) values('202610080002','lesson_account_credentials',array['Applied via deploy-lesson-account-credentials.mjs']);commit;`);
}
sql(readFileSync(resolve(lessonRoot, 'supabase/sql/support_account_credentials.sql'), 'utf8'), lessonRoot);
cli(['functions', 'deploy', 'support-account-credentials', '--no-verify-jwt'], lessonRoot);
cli(['functions', 'deploy', 'lesson-account-credentials', '--no-verify-jwt']);
cli(['functions', 'deploy', 'lesson-learning', '--no-verify-jwt']);
console.log('PASS: credential operation tables and dedicated mutation permission deployed; no child Auth/password/learning records changed by deployment');
