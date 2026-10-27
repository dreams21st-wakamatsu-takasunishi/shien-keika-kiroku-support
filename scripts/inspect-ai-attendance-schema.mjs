// Read-only schema inspection; never reads attendance bodies, people or support records.
import {sql} from './lesson-operation-client.mjs';
const result=sql(`begin read only;
select jsonb_build_object(
 'latestMigrations',(select jsonb_agg(version) from (select version from supabase_migrations.schema_migrations order by version desc limit 4) m),
 'attendanceTriggers',(select jsonb_agg(jsonb_build_object('name',t.tgname,'function',p.proname,'definition',pg_get_functiondef(p.oid))) from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='public.attendance_records'::regclass and not t.tgisinternal),
 'newColumns',(select jsonb_agg(column_name) from information_schema.columns where table_schema='public' and table_name='attendance_records' and column_name in ('confirmed_break_minutes','break_confirmed_at','break_confirmed_by')),
 'aiPolicyTable',to_regclass('public.external_ai_policies') is not null
) as schema;
rollback;`);
console.log(JSON.stringify(result));
