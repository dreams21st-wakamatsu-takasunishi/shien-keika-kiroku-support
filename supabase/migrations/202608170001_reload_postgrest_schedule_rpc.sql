-- The function exists in PostgreSQL, but PostgREST can keep an older function
-- catalog until its schema cache is refreshed. Explicitly reload the cache so
-- delete_monthly_daily_schedules is exposed through /rest/v1/rpc/.
select pg_notify('pgrst', 'reload schema');

