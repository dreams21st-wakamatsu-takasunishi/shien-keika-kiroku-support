// Isolated PostgreSQL/WASM. No production connection or operational records.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const runtime=process.argv[2];if(!runtime)throw Error('PGlite entry point required');
const { PGlite }=await import(pathToFileURL(runtime).href),db=new PGlite();
const org='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql as $$select current_setting('test.uid')::uuid$$;
    create function public.current_organization_id() returns uuid language sql as $$select current_setting('test.org')::uuid$$;
    create function public.current_user_role() returns text language sql as $$select 'admin'::text$$;
    create table public.record_drafts(organization_id uuid,user_id uuid,draft_key text,payload jsonb,device_id text,recorder_profile_id uuid,revision bigint,updated_at timestamptz default now(),primary key(organization_id,draft_key));
    select set_config('test.uid','${user}',false),set_config('test.org','${org}',false);`);
  await db.exec(readFileSync('supabase/migrations/202610200001_record_draft_revision_sync.sql','utf8'));
  const save=(key,revision,device='tablet',organization=org)=>db.query('select * from save_record_draft_guarded($1,$2,$3,$4,$5,null)',[organization,key,{date:'2026-10-20',selectedChildIds:[],note:'架空入力'},device,revision]);
  assert.equal((await save('record-check',null)).rows[0].new_revision,1);
  assert.equal((await save('record-check',1,'pc')).rows[0].new_revision,2);
  await assert.rejects(()=>save('record-check',1),/DRAFT_CONFLICT/);
  await assert.rejects(()=>save('record-check',1,'pc'),/DRAFT_CONFLICT/);
  await assert.rejects(()=>save('record-check',null,'pc'),/DRAFT_CONFLICT/);
  assert.equal((await save('record-check',2)).rows[0].new_revision,3);
  await assert.rejects(()=>save('record-check',3,'tablet','33333333-3333-4333-8333-333333333333'),/Draft access denied/);
  await db.exec(`select set_config('test.uid','44444444-4444-4444-8444-444444444444',false);`);
  await assert.rejects(()=>save('record-check',3),/DRAFT_TAKEN_OVER/);
  await db.exec(`select set_config('test.uid','${user}',false);delete from record_drafts where draft_key='record-check';`);
  await assert.rejects(()=>save('record-check',3),/DRAFT_CONFLICT/);
  assert.equal((await db.query('select count(*)::int n from record_drafts')).rows[0].n,0);
  assert.equal((await save('quick-memo-test',null)).rows[0].new_revision,1);
  assert.equal((await save('quick-memo-test',null)).rows[0].new_revision,2);
  console.log(JSON.stringify({passed:true,checks:12,isolatedDatabase:true,productionAccess:false}));
} finally { await db.close(); }
