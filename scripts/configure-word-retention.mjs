import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {sql,cli,lessonRoot,lessonRef,checkLinkedProjects} from './lesson-operation-client.mjs';
if(!process.argv.includes('--apply'))throw Error('Explicit --apply required');
checkLinkedProjects();
const conflict=readFileSync('supabase/migrations/202609300004_lesson_link_business_conflicts.sql','utf8');
sql(`begin;${conflict}insert into supabase_migrations.schema_migrations(version,name,statements) values('202609300004','lesson_link_business_conflicts',array['Applied via configure-word-retention.mjs']) on conflict(version) do nothing;commit;`);
sql(readFileSync(resolve(lessonRoot,'supabase/sql/support_word_retention.sql'),'utf8'),lessonRoot);
cli(['functions','deploy','word-review-cleanup','--no-verify-jwt'],lessonRoot);
cli(['functions','deploy','admin-delete-auth-user','--no-verify-jwt'],lessonRoot);
const secret=randomBytes(32).toString('hex'),env=resolve(`output/cleanup-${randomUUID()}.env`);
try{
  writeFileSync(env,`WORD_REVIEW_CLEANUP_SECRET=${secret}\n`);
  cli(['secrets','set','--env-file',env],lessonRoot);
  // Vault encrypts the scheduler credential; it never appears in browser config or logs.
  sql(`create extension if not exists pg_cron;create extension if not exists pg_net with schema extensions;
    select vault.update_secret(id,'${secret}','word_review_cleanup_secret','Word artifact retention scheduler') from vault.secrets where name='word_review_cleanup_secret';
    select vault.create_secret('${secret}','word_review_cleanup_secret','Word artifact retention scheduler') where not exists(select 1 from vault.secrets where name='word_review_cleanup_secret');
    select cron.unschedule(jobid) from cron.job where jobname='lesson-word-review-cleanup';
    select cron.schedule('lesson-word-review-cleanup','20 18 * * *',$job$
      select net.http_post(url:='https://${lessonRef}.supabase.co/functions/v1/word-review-cleanup',headers:=jsonb_build_object('Content-Type','application/json','x-cleanup-secret',(select decrypted_secret from vault.decrypted_secrets where name='word_review_cleanup_secret')),body:='{}'::jsonb,timeout_milliseconds:=30000);
    $job$);`,lessonRoot);
  const denied=await fetch(`https://${lessonRef}.supabase.co/functions/v1/word-review-cleanup`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  if(denied.status!==403)throw Error('Unauthorized cleanup was not denied');
  const response=await fetch(`https://${lessonRef}.supabase.co/functions/v1/word-review-cleanup`,{method:'POST',headers:{'content-type':'application/json','x-cleanup-secret':secret},body:'{}'});
  if(!response.ok)throw Error(`Authorized cleanup failed (${response.status})`);
  const schedule=sql("select count(*)::int as jobs from cron.job where jobname='lesson-word-review-cleanup' and active",lessonRoot).rows[0].jobs;
  if(schedule!==1)throw Error('Cleanup schedule not active');
  console.log('PASS: daily Word retention scheduled, unauthorized cleanup rejected, authorized cleanup succeeded; migration 004 recorded');
}finally{unlinkSync(env);}
