import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {checkLinkedProjects,cli,sql,lessonRoot} from './lesson-operation-client.mjs';
if(process.argv.length!==3||process.argv[2]!=='--apply-and-deploy')throw Error('Explicit production release required');
checkLinkedProjects();
const schema=['support_learning_day_history.sql','lesson_staff_roster.sql','lesson_student_delta.sql']
 .map(name=>readFileSync(resolve(lessonRoot,'supabase/sql',name),'utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,'')).join('\n');
sql('begin;\n'+schema+'\nrollback;',lessonRoot);
sql('begin;\n'+schema+"\nnotify pgrst, 'reload schema';\ncommit;",lessonRoot);
const check=sql(`select
 has_function_privilege('authenticated','public.read_lesson_staff_roster(text)','execute') as roster,
 has_function_privilege('authenticated','public.patch_own_lesson_snapshot(text,text,text,jsonb,text[])','execute') as delta,
 not has_function_privilege('anon','public.read_own_lesson_snapshot(text,text)','execute') as anon_denied,
 not has_function_privilege('authenticated','public.read_support_learning_day(text,uuid,text,text,date)','execute') as bridge_denied;`,lessonRoot).rows?.[0];
if(!check||!Object.values(check).every(value=>value===true))throw Error('RPC privilege verification failed');
for(const name of ['support-learning-read','support-word-review'])cli(['functions','deploy',name,'--no-verify-jwt'],lessonRoot);
cli(['functions','deploy','lesson-learning','--no-verify-jwt']);
console.log(JSON.stringify({schema:true,privileges:true,functions:true,realRowsChanged:false}));
