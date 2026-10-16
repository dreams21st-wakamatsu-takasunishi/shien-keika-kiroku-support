-- Read-only execution plan; no rows or personal fields are returned.
-- Emulates an existing admin's normal password-session access in this transaction only.
begin read only;
select set_config('request.jwt.claims', (
  select jsonb_build_object('sub',id,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','password')))::text
  from public.profiles where role='admin' and active order by created_at limit 1
),true);
set local role authenticated;
set local statement_timeout='8s';
explain (analyze,format json,costs false,timing false,summary true)
select id,actor_id,table_name,row_id,action,occurred_at
from public.audit_logs order by occurred_at desc limit 30;
rollback;
