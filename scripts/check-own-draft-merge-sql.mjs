// Real PostgreSQL/PLpgSQL in memory, with synthetic auth/device scope. No Supabase access.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const runtime=process.argv[2];if(!runtime)throw Error('PGlite dist/index.js path required');
const {PGlite}=await import(pathToFileURL(runtime).href),db=new PGlite();
const org='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',recorder='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444';
await db.exec(`create schema auth; create role anon; create role authenticated;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.current_organization_id() returns uuid language sql as $$select '${org}'::uuid$$;
create function public.current_recorder_profile_id() returns uuid language sql as $$select '${recorder}'::uuid$$;
create function public.current_user_role() returns text language sql as $$select 'staff'::text$$;
create function public.current_request_device_kind() returns text language sql as $$select case when current_setting('app.support_device_token',true)='approved-device' then 'facility_shared' else 'personal' end$$;
create table public.profiles(id uuid primary key,organization_id uuid,active boolean);
insert into public.profiles values('${user}','${org}',true);
create table public.record_drafts(organization_id uuid,user_id uuid,draft_key text,recorder_profile_id uuid,payload jsonb,revision bigint,updated_at timestamptz default now(),primary key(organization_id,draft_key));
create table public.support_records(id text primary key,payload jsonb); insert into public.support_records values('saved','{"unchanged":true}');
select set_config('test.uid','${user}',false);`);
const deviceSource=readFileSync('supabase/migrations/202608240003_fix_shared_device_takeover.sql','utf8');
await db.exec(deviceSource.match(/create or replace function public.prevent_personal_device_record_mutation\(\)[\s\S]*?\$\$;/)[0]);
await db.exec('create trigger preserve_device_scope before insert or update or delete on public.record_drafts for each row execute function public.prevent_personal_device_record_mutation();');
const migration=readFileSync('supabase/migrations/202610150001_merge_own_record_drafts.sql','utf8');
await db.exec(migration);
const payload=id=>({version:12,date:'2026-10-15',selectedTemplateId:'template-unified',selectedChildIds:[id],activeChildId:id,currentStepIndex:7,recorderId:recorder,childDrafts:{[id]:{attendance:'出席',note:'untouched '+id}},childTemplateIds:{[id]:'template-unified'},childStepIds:{[id]:'module-'+id},takenOverFromDraftKeys:[]});
const keys=[{draftKey:'record-a',revision:1},{draftKey:'record-b',revision:1}];
async function seed(change={}){await db.exec(`select set_config('app.support_device_token','approved-device',false);delete from public.record_drafts;`);for(const [i,key] of keys.entries()){const row={org,user,recorder,key:key.draftKey,payload:payload(i?'b':'a'),revision:1,...(i?change:{})};await db.query('insert into public.record_drafts values($1,$2,$3,$4,$5,$6,now())',[row.org,row.user,row.key,row.recorder,row.payload,row.revision]);}}
const snapshot=async()=>JSON.stringify((await db.query('select * from public.record_drafts order by draft_key')).rows);
const merge=(items=keys,target='record-b',token='approved-device',who=recorder)=>db.query('select * from public.merge_own_record_drafts($1,$2,$3,$4,$5)',[org,target,items,who,token]);
let checks=0;
await seed();await merge();let rows=(await db.query('select * from public.record_drafts')).rows;assert.equal(rows.length,1);assert.equal(rows[0].revision,2);assert.deepEqual(rows[0].payload.selectedChildIds,['b','a']);for(const id of ['a','b']){assert.deepEqual(rows[0].payload.childDrafts[id],payload(id).childDrafts[id]);assert.equal(rows[0].payload.childTemplateIds[id],'template-unified');assert.equal(rows[0].payload.childStepIds[id],'module-'+id);}assert.equal(rows[0].payload.activeChildId,'b');assert.equal(rows[0].payload.currentStepIndex,7);checks++;
for(const [label,change,items,target,token,who] of [
 ['foreign account',{user:other}],['foreign organization',{org:other}],['foreign recorder',{recorder:other}],['stale revision',{revision:2}],['different day',{payload:{...payload('b'),date:'2026-10-14'}}],['different format',{payload:{...payload('b'),selectedTemplateId:'other'}}],['overlap',{payload:payload('a')}],['overlap in hidden answers',{payload:{...payload('b'),childDrafts:{...payload('b').childDrafts,a:{note:'conflict'}}}}],['saved record edit',{key:'record-edit-b'},[keys[0],{draftKey:'record-edit-b',revision:1}],'record-a'],['personal device',{},keys,'record-a','unapproved'],['spoofed recorder',{},keys,'record-a','approved-device',other],['duplicate requests',{},[keys[0],keys[0]],'record-a'],['missing target',{},keys,'record-c'],['missing revision',{},[{draftKey:'record-a'},keys[1]],'record-b']
]){await seed(change);const before=await snapshot();await assert.rejects(()=>merge(items||keys,target||'record-b',token||'approved-device',who||recorder),undefined,label);assert.equal(await snapshot(),before,'atomic rollback '+label);checks++;}
await seed();await db.exec(`update public.profiles set active=false;`);const before=await snapshot();await assert.rejects(()=>merge());assert.equal(await snapshot(),before);checks++;
assert.deepEqual((await db.query('select payload from public.support_records')).rows,[{payload:{unchanged:true}}]);
console.log(JSON.stringify({passed:true,checks,sqlExecutedIn:'in-memory PostgreSQL',productionAccess:false,savedRecordsUnchanged:true,functionBodyMd5:createHash('md5').update(migration.split('as $$')[1].split('$$;')[0].replaceAll('\r','')).digest('hex')}));await db.close();
