// Explicit, one-campus content import. Never reads or writes learner/Auth rows.
// No staff identity is invented: this is a CLI-authorized batch, not a staff UI save.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {sql,lessonRoot,checkLinkedProjects,orgId,campusId,supportRef} from './lesson-operation-client.mjs';
import './check-speed-input-practice.mjs';
const apply=process.argv.includes('--apply'),rollback=process.argv.includes('--rollback-test');
if(apply===rollback)throw Error('Choose --rollback-test or --apply');
checkLinkedProjects();
const tasks=JSON.parse(readFileSync(new URL('../docs/lesson-content/speed-input-mock-20261019.json',import.meta.url),'utf8'));
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
function snapshot(){return sql(`select revision,md5(content::text) fingerprint,content from public.lesson_campus_content where data_table='user_data' and campus_id='main' and organization_id='${orgId}' and support_project_ref='${supportRef}'`,lessonRoot).rows?.[0];}
const before=snapshot();if(!before)throw Error('Expected existing campus catalog missing');
const originals=['tt_1778440709284','tt_1778441069178','tt_1773309748141','tt_37027fa5-a822-4337-bade-a94f23cf1d81'];
assert.ok(originals.every(id=>before.content.textTasks.some(task=>task.id===id)),'Existing past-question scope changed');
assert.equal(new Set(before.content.textTasks.map(t=>t.id)).size,before.content.textTasks.length,'Existing IDs must be unique');
const existing=tasks.filter(t=>before.content.textTasks.some(old=>old.id===t.id));
if(existing.length){assert.equal(existing.length,10,'Partial earlier batch; inspect before proceeding');for(const t of tasks)assert.deepEqual(before.content.textTasks.find(old=>old.id===t.id),t);console.log(JSON.stringify({passed:true,alreadyPresent:true,added:0,revision:before.revision}));process.exit(0);}
assert.ok(before.content.textTasks.length+10<=300);
// Reject copied passages; original past-question text is not written into source control.
const strip=text=>text.replace(/\{([^{}|]+)\|[^{}]+\}/g,'$1');
for(const task of tasks){const plain=strip(task.content);for(const old of before.content.textTasks.filter(t=>originals.includes(t.id))){const reference=strip(old.content);for(let i=0;i+50<=plain.length;i++)assert.ok(!reference.includes(plain.slice(i,i+50)),'50-character passage matches a reference');}}
const run=randomUUID();mkdirSync('output',{recursive:true});
if(apply)writeFileSync(`output/speed-input-before-${run}.json`,JSON.stringify(before,null,2));
const query=`begin;
do $import$
declare v_old public.lesson_campus_content%rowtype; v_new jsonb:=${quote(JSON.stringify(tasks))}::jsonb; v_after jsonb; v_count integer;
 v_globals text; v_others text;
begin
 perform pg_advisory_xact_lock(hashtextextended('lesson-content:user_data:main',0));
 select * into v_old from public.lesson_campus_content where data_table='user_data' and campus_id='main' for update;
 if not found or v_old.organization_id<>'${orgId}'::uuid or v_old.support_project_ref<>'${supportRef}' then raise exception 'Import scope mismatch';end if;
 if v_old.revision<>${Number(before.revision)} or md5(v_old.content::text)<>${quote(before.fingerprint)} then raise exception 'Catalog changed; inspect again before retrying';end if;
 if not exists(select 1 from public.lesson_support_scopes where data_table='user_data' and campus_id='main' and organization_id='${orgId}' and support_project_ref='${supportRef}' and enabled)
 or exists(select 1 from public.lesson_support_scopes where data_table='user_data' and campus_id='main' and enabled and (organization_id<>'${orgId}' or support_project_ref<>'${supportRef}')) then raise exception 'Campus scope is disabled or ambiguous';end if;
 if jsonb_array_length(v_new)<>10 or jsonb_array_length(v_old.content->'textTasks')+10>300 then raise exception 'Import count mismatch';end if;
 if exists(select 1 from jsonb_array_elements(v_new) n join jsonb_array_elements(v_old.content->'textTasks') o on n->>'id'=o->>'id') then raise exception 'Duplicate task ID';end if;
 select md5(coalesce(jsonb_agg(to_jsonb(s) order by key)::text,'')) into v_globals from public.lesson_settings s;
 select md5(coalesce(jsonb_agg(to_jsonb(c) order by data_table,campus_id)::text,'')) into v_others from public.lesson_campus_content c where (data_table,campus_id)<>('user_data','main');
 update public.lesson_campus_content set content=jsonb_set(content,'{textTasks}',(content->'textTasks')||v_new),revision=revision+1,updated_at=now()
 where data_table='user_data' and campus_id='main' returning content into v_after;
 get diagnostics v_count=row_count;if v_count<>1 then raise exception 'Expected exactly one updated catalog';end if;
 if (v_after-'textTasks')<>(v_old.content-'textTasks') then raise exception 'Other content changed';end if;
 if (select jsonb_agg(e order by n) from jsonb_array_elements(v_after->'textTasks') with ordinality a(e,n) where n<=jsonb_array_length(v_old.content->'textTasks'))<>(v_old.content->'textTasks') then raise exception 'Existing tasks changed';end if;
 if v_globals<>(select md5(coalesce(jsonb_agg(to_jsonb(s) order by key)::text,'')) from public.lesson_settings s) then raise exception 'Global settings changed';end if;
 if v_others<>(select md5(coalesce(jsonb_agg(to_jsonb(c) order by data_table,campus_id)::text,'')) from public.lesson_campus_content c where (data_table,campus_id)<>('user_data','main')) then raise exception 'Other catalogs changed';end if;
end;$import$;
${apply?'commit':'rollback'};select true as passed;`;
assert.equal(sql(query,lessonRoot).rows?.[0]?.passed,true);
const after=snapshot();
if(!apply)assert.deepEqual(after,before,'Rollback must leave the catalog unchanged');
else{
 assert.equal(after.revision,before.revision+1);assert.equal(after.content.textTasks.length,before.content.textTasks.length+10);
 assert.deepEqual(after.content.textTasks.slice(0,before.content.textTasks.length),before.content.textTasks);
 assert.deepEqual(after.content.textTasks.slice(-10),tasks);
 assert.deepEqual({...after.content,textTasks:[]},{...before.content,textTasks:[]});
}
const report={passed:true,mode:apply?'applied':'rollback-only',run,campusId,dataTable:'user_data',beforeRevision:before.revision,afterRevision:after.revision,added:apply?10:0,beforeCount:before.content.textTasks.length,afterCount:after.content.textTasks.length,existingTasksPreserved:true,otherCatalogsPreserved:true,globalSettingsPreserved:true,learnerOrAuthAccess:false,contentSha256:createHash('sha256').update(JSON.stringify(tasks)).digest('hex')};
writeFileSync(`output/speed-input-${apply?'import':'rollback'}-${run}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
