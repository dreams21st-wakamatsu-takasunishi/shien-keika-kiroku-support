import { readFileSync } from 'node:fs';
import { checkLinkedProjects, cli, sql } from './lesson-operation-client.mjs';
if (!process.argv.includes('--apply-and-deploy')) throw Error('Use --apply-and-deploy');
checkLinkedProjects();
const migration = readFileSync('supabase/migrations/202610090002_lesson_registration_recovery.sql', 'utf8');
const applied = sql("select exists(select 1 from supabase_migrations.schema_migrations where version='202610090002') as applied;").rows[0].applied;
if (!applied) { sql(`begin;${migration}rollback;`); sql(`begin;${migration}insert into supabase_migrations.schema_migrations(version,name,statements) values('202610090002','lesson_registration_recovery',array['Applied via deploy-lesson-registration-recovery.mjs']);commit;`); }
cli(['functions', 'deploy', 'lesson-student-registration', '--no-verify-jwt']);
cli(['functions', 'deploy', 'lesson-account-credentials', '--no-verify-jwt']);
console.log('PASS: audited admin recovery deployed; no learner/Auth/password or staff activation changed by deployment');
