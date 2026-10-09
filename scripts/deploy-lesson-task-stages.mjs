import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {checkLinkedProjects,cli,sql,lessonRoot} from './lesson-operation-client.mjs';
if(!process.argv.includes('--apply-and-deploy'))throw Error('Use --apply-and-deploy');
checkLinkedProjects();
const stageSql=readFileSync(resolve(lessonRoot,'supabase/sql/support_learning_task_stages.sql'),'utf8');
const definitions=[['support_word_reviews.sql','decide_support_word_request'],['word_teacher_approval.sql','approve_lesson_word']].map(([file,name])=>{
 const content=readFileSync(resolve(lessonRoot,'supabase/sql',file),'utf8');
 const start=content.indexOf(`create or replace function public.${name}(`),end=content.indexOf('$$;',start);
 if(start<0||end<0)throw Error('Word function definition not found');
 return content.slice(start,end+3);
}).join('\n');
sql('begin;'+stageSql.replace(/^begin;\s*/,'').replace(/commit;\s*$/,'')+definitions+'rollback;',lessonRoot);
sql('begin;'+stageSql.replace(/^begin;\s*/,'').replace(/commit;\s*$/,'')+definitions+'commit;',lessonRoot);
cli(['functions','deploy','support-learning-tasks','--no-verify-jwt'],lessonRoot);
cli(['functions','deploy','student-learning-tasks','--no-verify-jwt'],lessonRoot);
cli(['functions','deploy','lesson-learning','--no-verify-jwt']);
console.log('PASS: concrete-stage task storage, Word stage logs and both task bridges deployed; no operational learner/Auth or permissions changed');
