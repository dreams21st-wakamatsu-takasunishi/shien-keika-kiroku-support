// Explicitly approved scope: canonical registry + management schema + this school's 10 mock tasks.
// Never changes existing learner JSON, Auth, D Support child links or legacy campus content.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sql,lessonRoot,checkLinkedProjects,orgId,supportRef} from './lesson-operation-client.mjs';
const apply=process.argv.includes('--apply'), rollback=process.argv.includes('--rollback-test');
if(apply===rollback)throw Error('Choose exactly one of --apply / --rollback-test');
checkLinkedProjects();
const q=value=>`'${String(value).replaceAll("'","''")}'`;
const target='wakamatsu-takasunishi', run=randomUUID();
const tasks=JSON.parse(readFileSync('docs/lesson-content/speed-input-mock-20261019.json','utf8'));
if(tasks.length!==10||new Set(tasks.map(t=>t.id)).size!==10||tasks.some(t=>!/^tt_mock_speed_20261019_\d{2}$/.test(t.id)))throw Error('Unexpected mock tasks');
const migration=readFileSync(resolve(lessonRoot,'supabase/sql/student_management.sql'),'utf8').replace(/^begin;\s*/m,'').replace(/commit;\s*$/,'');
const contentFunction=readFileSync(resolve(lessonRoot,'supabase/sql/support_managed_content.sql'),'utf8').match(/create or replace function public\.manage_support_content\(p jsonb\)[\s\S]*?\$\$;/)?.[0];
if(!contentFunction)throw Error('Managed content function not found');
const assertUnchanged=`do $$begin
 if (select fingerprint from preserved) is distinct from (select md5(coalesce(string_agg(id||data::text,'' order by id),'')) from public.user_data) then raise exception 'LEARNER_DATA_CHANGED'; end if;
 if (select fingerprint from auth_preserved) is distinct from (select md5(coalesce(string_agg(id::text||to_jsonb(a)::text,'' order by id),'')) from auth.users a) then raise exception 'AUTH_CHANGED'; end if;
 if (select content from main_preserved) is distinct from (select content from public.lesson_campus_content where data_table='user_data' and campus_id='main') then raise exception 'LEGACY_CONTENT_CHANGED'; end if;
 if (select fingerprint from links_preserved) is distinct from (select md5(coalesce(string_agg(to_jsonb(s)::text,'' order by student_id),'')) from public.lesson_support_students s) then raise exception 'SHARING_LINKS_CHANGED'; end if;
end $$;`;
const fixtures=rollback?readFileSync('scripts/student-management-rollback-checks.sql','utf8'):'';
const statement=`begin isolation level repeatable read;
 set local lock_timeout='3s'; set local statement_timeout='45s';
 create temp table preserved as select md5(coalesce(string_agg(id||data::text,'' order by id),'')) fingerprint from public.user_data;
 create temp table auth_preserved as select md5(coalesce(string_agg(id::text||to_jsonb(a)::text,'' order by id),'')) fingerprint from auth.users a;
 create temp table main_preserved as select content from public.lesson_campus_content where data_table='user_data' and campus_id='main';
 create temp table links_preserved as select md5(coalesce(string_agg(to_jsonb(s)::text,'' order by student_id),'')) fingerprint from public.lesson_support_students s;
 ${migration}
 ${contentFunction}
 do $$begin
  if not exists(select 1 from public.lesson_campuses where id=${q(target)} and name='若松高須西校' and code=${q(target)} and active) then raise exception 'TARGET_CAMPUS_MISMATCH'; end if;
  if exists(select 1 from public.lesson_support_scopes where data_table='user_data' and campus_id=${q(target)} and enabled
    and (organization_id<>${q(orgId)}::uuid or support_project_ref<>${q(supportRef)})) then raise exception 'CAMPUS_OWNER_CONFLICT'; end if;
  if exists(select 1 from public.lesson_campus_content where data_table='user_data' and campus_id=${q(target)}
    and (organization_id<>${q(orgId)}::uuid or support_project_ref<>${q(supportRef)})) then raise exception 'CONTENT_OWNER_CONFLICT'; end if;
 end $$;
 insert into public.lesson_support_scopes(support_project_ref,organization_id,data_table,campus_id,enabled)
 values(${q(supportRef)},${q(orgId)}::uuid,'user_data',${q(target)},true)
 on conflict(support_project_ref,organization_id,data_table,campus_id) do update set enabled=true;
 do $$declare base jsonb; existing jsonb; incoming jsonb:=${q(JSON.stringify(tasks))}::jsonb; t jsonb;
 begin
  perform pg_advisory_xact_lock(hashtextextended('lesson-content:user_data:${target}',0));
  select content into base from public.lesson_campus_content where data_table='user_data' and campus_id=${q(target)} for update;
  if base is null then
   select jsonb_build_object('textTasks',coalesce(data->'textTasks','[]'::jsonb),
    'customThemes',coalesce(data->'globalMistakes'->'customThemes','[]'::jsonb),
    'customEffects',coalesce(data->'globalMistakes'->'customEffects','[]'::jsonb)) into base
    from public.lesson_settings where key='user_data:global';
  end if;
  if base is null then raise exception 'GLOBAL_SETTINGS_MISSING'; end if;
  for t in select value from jsonb_array_elements(incoming) loop
    select value into existing from jsonb_array_elements(base->'textTasks') where value->>'id'=t->>'id';
    if existing is not null and existing<>t then raise exception 'TASK_CONTENT_CONFLICT'; end if;
    if existing is null then base:=jsonb_set(base,'{textTasks}',(base->'textTasks')||jsonb_build_array(t)); end if;
  end loop;
  insert into public.lesson_campus_content(data_table,campus_id,support_project_ref,organization_id,content,revision)
   values('user_data',${q(target)},${q(supportRef)},${q(orgId)}::uuid,base,1)
   on conflict(data_table,campus_id) do update set content=excluded.content,revision=lesson_campus_content.revision+1,updated_at=now()
    where lesson_campus_content.content<>excluded.content;
 end $$;
 ${assertUnchanged}
 ${fixtures}
 ${apply?'commit;':'rollback;'}
 select true as passed,${q(apply?'applied':'rollback-tested')} as mode,${q(run)} as run;`;
mkdirSync('output',{recursive:true});
const result=sql(statement,lessonRoot);
writeFileSync(`output/student-management-${run}.json`,JSON.stringify(result.rows,null,2));
console.log(JSON.stringify(result.rows));
