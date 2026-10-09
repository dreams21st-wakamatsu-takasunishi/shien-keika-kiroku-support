// Isolated PostgreSQL, synthetic records only. No production connection.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const args=process.argv.slice(2), entry=args[args.indexOf('--pglite')+1];
if (!args.includes('--pglite') || !entry) throw Error('--pglite entry point required');
const { PGlite }=await import(pathToFileURL(resolve(entry)).href);
const db=new PGlite();
const org='22222222-2222-4222-8222-222222222222';
const source=name=>readFileSync('supabase/migrations/'+name,'utf8');
const call=async(records,organization=org)=>(await db.query('select * from save_support_records_guarded($1,$2::jsonb)',[organization,JSON.stringify(records)])).rows;
const payload=(id,version=0,child='synthetic-child')=>({id,expected_version:version,child_id:child,record_date:'2026-10-09',template_id:'test',template_name:'synthetic',template_type:'平日',child_name:'架空児童',recorder_name:'架空職員',attendance:'出席',section_answers:{test:{detailText:'架空観察'}}});
const deny=(records,message,organization)=>assert.rejects(()=>call(records,organization),error=>error.message.includes(message));
try {
  const textFields=['id','template_id','template_name','template_type','child_id','child_name','support_plan_id','attendance','attendance_note','expression','expression_note','snack','snack_note','recorder_name','transportation','synthesized_summary','approval_status','review_comment','reviewer_name'];
  await db.exec(`create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function current_organization_id() returns uuid language sql stable as $$select '${org}'::uuid$$;
    create table support_records(organization_id uuid,${textFields.map(f=>f+' text').join(',')},
      record_date date,recorder_profile_id uuid,service_start_time time,service_end_time time,
      template_snapshot jsonb,goal_progress jsonb,section_answers jsonb,review_issues jsonb,
      five_domains text[],skipped_question_ids text[],reviewed_at timestamptz,deleted_at timestamptz,version integer default 1,
      primary key(organization_id,id));
    create function bump_version() returns trigger language plpgsql as $$begin new.version=old.version+1;return new;end$$;
    create trigger bump_version before update on support_records for each row execute function bump_version();
    set test.uid='11111111-1111-4111-8111-111111111111';`);
  const original=source('202608050001_record_save_concurrency.sql');
  const start=original.indexOf('create or replace function public.save_support_records_guarded');
  await db.exec(original.slice(start,original.indexOf('$$;',start)+3));
  await db.exec(`insert into support_records(organization_id,id,child_id,record_date,deleted_at) values('${org}','deleted','synthetic-child','2026-10-09',now());`);
  assert.equal((await call([payload('deleted')]))[0].outcome,'already_saved');
  const migration=source('202610090005_record_save_deleted_guard.sql');
  assert.match(migration,/for update;/i);assert.match(migration,/and deleted_at is null\s+returning/i);
  await db.exec(migration);
  await deny([payload('deleted')],'RECORD_DELETED');
  await deny([payload('deleted',1)],'RECORD_DELETED');
  const tombstone=(await db.query("select deleted_at,version,section_answers from support_records where id='deleted'")).rows[0];
  assert.ok(tombstone.deleted_at);assert.equal(tombstone.version,1);assert.equal(tombstone.section_answers,null);
  assert.equal((await call([payload('fresh')]))[0].outcome,'inserted');
  assert.equal((await call([payload('fresh')]))[0].outcome,'already_saved');
  await deny([payload('fresh',99)],'RECORD_CONFLICT');
  const update=await call([payload('fresh',1)]);assert.equal(update[0].outcome,'updated');assert.equal(update[0].new_version,2);
  await deny([payload('different')],'RECORD_DUPLICATE_DAY');
  await deny([payload('batch-new',0,'a'),payload('fresh',99)],'RECORD_CONFLICT');
  assert.equal((await db.query("select count(*)::int as n from support_records where id='batch-new'")).rows[0].n,0);
  await deny([payload('foreign')],'Unauthorized','33333333-3333-4333-8333-333333333333');
  await db.exec("set test.uid='';");await deny([payload('anonymous')],'Unauthorized');
  await db.exec("set test.uid='11111111-1111-4111-8111-111111111111';");
  await assert.rejects(()=>call({not:'array'}),/JSON array/);
  const permissions=(await db.query("select has_function_privilege('authenticated','save_support_records_guarded(uuid,jsonb)','EXECUTE') as allowed")).rows[0];
  assert.equal(permissions.allowed,true);
  console.log(JSON.stringify({passed:true,checks:14,originalBugReproduced:true,deletedRecordsPreserved:true,rowLockAndConditionalUpdate:true,batchRollback:true,tenantAndRevisionGuards:true,syntheticOnly:true}));
} finally {await db.close();}
