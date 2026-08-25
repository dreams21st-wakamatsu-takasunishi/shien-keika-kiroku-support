-- Remove expired school holiday periods after their end date. The client also
-- ignores expired entries immediately, while this scheduled cleanup keeps the
-- stored JSON small and prevents old periods from being reused accidentally.

create or replace function public.purge_expired_school_holiday_periods()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  with cleaned as (
    select
      school.organization_id,
      school.id,
      coalesce(
        jsonb_agg(period.value order by period.ordinality)
          filter (
            where case
              when coalesce(period.value ->> 'endDate', period.value ->> 'end_date', '') ~ '^\d{4}-\d{2}-\d{2}$'
                then coalesce(period.value ->> 'endDate', period.value ->> 'end_date')::date
                  >= (current_timestamp at time zone 'Asia/Tokyo')::date
              else true
            end
          ),
        '[]'::jsonb
      ) as holiday_periods
    from public.schools school
    cross join lateral jsonb_array_elements(school.holiday_periods) with ordinality as period(value, ordinality)
    group by school.organization_id, school.id
  )
  update public.schools school
  set holiday_periods = cleaned.holiday_periods
  from cleaned
  where school.organization_id = cleaned.organization_id
    and school.id = cleaned.id
    and school.holiday_periods is distinct from cleaned.holiday_periods;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.purge_expired_school_holiday_periods() from public, anon, authenticated;
grant execute on function public.purge_expired_school_holiday_periods() to service_role;

select public.purge_expired_school_holiday_periods();

do $schedule$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron')
     and not exists (
       select 1 from cron.job
       where jobname = 'purge-expired-school-holidays-daily'
     ) then
    perform cron.schedule(
      'purge-expired-school-holidays-daily',
      '5 15 * * *',
      'select public.purge_expired_school_holiday_periods();'
    );
  end if;
end;
$schedule$;

comment on function public.purge_expired_school_holiday_periods() is
  'Removes school holiday period entries beginning the day after their registered end date.';
