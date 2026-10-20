// Read-only aggregates only: no learner names, IDs, content, artifacts or Auth changes.
import { sql, cli, lessonRoot, checkLinkedProjects } from './lesson-operation-client.mjs';
checkLinkedProjects();
const support = sql(`select jsonb_build_object(
  'activeLinks', (select count(*) from public.lesson_child_links where active),
  'learningContext', to_regprocedure('public.get_lesson_learning_context()') is not null,
  'deviceGate', to_regprocedure('public.current_request_device_kind()') is not null,
  'devicePolicy', (select pg_get_functiondef(oid) from pg_proc where oid='public.can_read_lesson_learning(uuid)'::regprocedure)
) as health;`);
const lesson = sql(`select jsonb_build_object(
  'wordRequests', to_regclass('public.lesson_word_requests') is not null,
  'bindings', to_regclass('public.lesson_support_students') is not null,
  'scopes', to_regclass('public.lesson_support_scopes') is not null,
  'requestCount', (select count(*) from public.lesson_word_requests),
  'inboxInvalid', (select count(*) from public.lesson_word_requests where
    (status='pending' or (status in ('approved','returned','expired') and submitted_at is not null))
    and (submitted_at is null or stage_id not in ('w_b1_1','w_b1_2','w_b1_3','w_b1_4','w_b1_5','w_m4_1','w_m4_2','w_m4_3')
      or file_type not in ('application/pdf','image/png','image/jpeg') or file_size < 1 or file_size > 8388608
      or revision < 1 or length(reason)>600 or length(reviewer_name)>100 or reward not in (0,500))),
  'requestStatuses', (select jsonb_object_agg(status,n) from (select status,count(*) n from public.lesson_word_requests group by status) s)
) as health;`, lessonRoot);
const functions = (root, name) => JSON.parse(cli(['functions','list','-o','json'], root)).filter(row => row.slug === name).map(({slug,version,status,verify_jwt}) => ({slug,version,status,verify_jwt}));
console.log(JSON.stringify({ support: support.rows, lesson: lesson.rows,
  supportFunction: functions(process.cwd(), 'lesson-learning'), lessonFunction: functions(lessonRoot, 'support-word-review'), readOnly: true }));
