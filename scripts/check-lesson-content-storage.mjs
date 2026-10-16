import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {checkLinkedProjects,lessonRoot} from './lesson-operation-client.mjs';
import {contentSql as sql} from './content-storage-client.mjs';
if(!process.argv.includes('--rollback-test'))throw Error('Use --rollback-test; all fixture writes roll back');
checkLinkedProjects();
const schema=readFileSync(resolve(lessonRoot,'supabase/sql/support_managed_content.sql'),'utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,'');
const run=randomUUID().replaceAll('-',''),org=randomUUID(),actor=randomUUID(),other=randomUUID();
const result=sql(`begin;${schema}
do $test$
declare p jsonb; snapshot jsonb; saved jsonb; replay jsonb; before_data jsonb;
 student text:='student_content_${run}'; other_student text:='student_content_other_${run}';
 campus text:='content-${run}'; other_campus text:='other-${run}';
begin
 insert into public.lesson_support_scopes values('aaaaaaaaaaaaaaaaaaaa','${org}','test_user_data',campus,true,now()),('aaaaaaaaaaaaaaaaaaaa','${org}','test_user_data',other_campus,true,now());
 insert into public.test_user_data(id,data) values(student,jsonb_build_object('campusId',campus,'items',jsonb_build_array('keep'),'coins',17,'textRecords',jsonb_build_object('tt_old',2))),
 (other_student,jsonb_build_object('campusId',other_campus,'items','[]'::jsonb));
 insert into public.lesson_support_students(support_project_ref,organization_id,data_table,campus_id,student_id,enabled,support_child_id,support_link_id)
 values('aaaaaaaaaaaaaaaaaaaa','${org}','test_user_data',campus,student,true,'fictional-child','${randomUUID()}');
 select data into before_data from public.test_user_data where id=student;
 p:=jsonb_build_object('supportProjectRef','aaaaaaaaaaaaaaaaaaaa','organizationId','${org}','actorId','${actor}','dataTable','test_user_data','campusId',campus,'action','get');
 snapshot:=public.manage_support_content(p);
 p:=p||jsonb_build_object('action','save','kind','textTasks','revision',snapshot->'revision','fingerprint',snapshot->'fingerprint','operationId','${randomUUID()}',
  'item',jsonb_build_object('id','tt_fictional','title','架空文章課題','content','あいうえお','time',3,'star',1,'hidden',false,'targetGroup','A'));
 saved:=public.manage_support_content(p); replay:=public.manage_support_content(p);
 if saved<>replay or saved->>'revision'<>'1' then raise exception 'retry/revision failure'; end if;
 begin perform public.manage_support_content(p||jsonb_build_object('operationId','${randomUUID()}'));raise exception 'stale accepted';exception when sqlstate 'PT409' then null;end;
 begin perform public.manage_support_content(p||jsonb_build_object('campusId','public'));raise exception 'public accepted';exception when insufficient_privilege then null;end;
 begin perform public.manage_support_content(p||jsonb_build_object('organizationId','${other}'));raise exception 'foreign accepted';exception when insufficient_privilege then null;end;
 p:=p||jsonb_build_object('action','save','kind','customThemes','revision',saved->'revision','fingerprint',saved->'fingerprint','operationId','${randomUUID()}',
  'item',jsonb_build_object('id','ct_fictional','name','架空ごほうび','hidden',false,'distribution','present','bg','#ffffff','text','#123456','btnBg','#006655','btnText','#ffffff'));
 saved:=public.manage_support_content(p); replay:=public.manage_support_content(p);
 if saved<>replay or saved->>'giftedCount'<>'1' then raise exception 'gift retry/count failure';end if;
 if (select count(*) from public.lesson_reward_grants where reward_id='ct_fictional' and campus_id=campus)<>1 then raise exception 'grant scope failure';end if;
 if (select data from public.test_user_data where id=student)<>before_data then raise exception 'progress was overwritten';end if;
 p:=p||jsonb_build_object('revision',saved->'revision','fingerprint',saved->'fingerprint','operationId','${randomUUID()}','item',(p->'item')||jsonb_build_object('hidden',true));
 saved:=public.manage_support_content(p);
 if saved->>'giftedCount'<>'0' then raise exception 'edit regifted';end if;
 insert into public.lesson_support_scopes values('bbbbbbbbbbbbbbbbbbbb','${other}','test_user_data',campus,true,now());
 begin perform public.manage_support_content(p||jsonb_build_object('action','get'));raise exception 'shared campus accepted';exception when insufficient_privilege then null;end;
 if (public.manage_support_content(p||jsonb_build_object('action','list'))->'campuses') @> jsonb_build_array(jsonb_build_object('id',campus)) then raise exception 'shared campus listed';end if;
end;$test$;
rollback;select true as passed;`,lessonRoot);
if(!result.rows?.[0]?.passed)throw Error('Storage verification result missing');
const supportSchema=readFileSync('supabase/migrations/202610160001_lesson_managed_content.sql','utf8');
sql(`begin;${supportSchema}rollback;select true as passed;`);
console.log('PASS: SQL rollback-only fixture test; save/retry/revision, public/foreign/shared campus denial, scoped gifts, unchanged progress JSON; both schemas compile; no persistent writes');
