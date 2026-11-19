import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {checkLinkedProjects,cli,sql,lessonRoot} from './lesson-operation-client.mjs';
if(process.argv.length!==3||process.argv[2]!=='--apply-and-deploy')throw Error('Explicit --apply-and-deploy requires tested code and release approval.');
checkLinkedProjects();
const ddl=['support_account_credentials.sql','support_student_admin.sql'].map(file=>readFileSync(resolve(lessonRoot,'supabase/sql',file),'utf8').replace(/^begin;\s*/m,'').replace(/commit;\s*$/,'')).join('\n');
const statement=`begin;
create temp table release_student_snapshot as select
 (select md5(coalesce(string_agg(id||data::text,'' order by id),'')) from public.user_data) as learners,
 (select md5(coalesce(string_agg(id::text||coalesce(encrypted_password,''),'' order by id),'')) from auth.users) as accounts;
${ddl}
do $$ begin
 if exists(select 1 from release_student_snapshot where
 learners is distinct from (select md5(coalesce(string_agg(id||data::text,'' order by id),'')) from public.user_data)
 or accounts is distinct from (select md5(coalesce(string_agg(id::text||coalesce(encrypted_password,''),'' order by id),'')) from auth.users))
 then raise exception 'Existing student/Auth data changed; release aborted';end if;
end $$;
commit;`;
sql(statement,lessonRoot);
for(const name of ['support-account-credentials','support-student-admin','support-learning-read']){
 cli(['functions','deploy',name,'--no-verify-jwt'],lessonRoot);console.log(`Deployed D Lesson: ${name}`);
}
for(const name of ['lesson-account-credentials','lesson-student-admin','lesson-student-registration','lesson-learning']){
 cli(['functions','deploy',name,'--no-verify-jwt']);console.log(`Deployed D Support: ${name}`);
}
console.log('PASS: schema/functions deployed; existing learner documents and Auth password hashes unchanged by DDL. No archive/reset operation executed.');
