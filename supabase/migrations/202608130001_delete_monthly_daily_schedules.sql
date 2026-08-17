create or replace function public.delete_monthly_daily_schedules(
  p_organization_id uuid,
  p_month date,
  p_child_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  month_start date := date_trunc('month', p_month)::date;
  month_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  affected_dates date[];
  daily_plan_count integer := 0;
  requirement_count integer := 0;
begin
  if auth.uid() is null
     or p_organization_id is distinct from public.current_organization_id()
     or public.current_user_role() not in ('manager', 'admin') then
    raise exception using errcode = '42501', message = '月間利用予定を削除する権限がありません。';
  end if;

  select coalesce(array_agg(distinct source.service_date), array[]::date[])
  into affected_dates
  from (
    select service_date
    from public.daily_child_plans
    where organization_id = p_organization_id
      and service_date >= month_start
      and service_date < month_end
      and (p_child_id is null or child_id = p_child_id)
    union
    select service_date
    from public.daily_transport_requirements
    where organization_id = p_organization_id
      and service_date >= month_start
      and service_date < month_end
      and (p_child_id is null or child_id = p_child_id)
  ) as source;

  delete from public.daily_child_plans
  where organization_id = p_organization_id
    and service_date >= month_start
    and service_date < month_end
    and (p_child_id is null or child_id = p_child_id);
  get diagnostics daily_plan_count = row_count;

  delete from public.daily_transport_requirements
  where organization_id = p_organization_id
    and service_date >= month_start
    and service_date < month_end
    and (p_child_id is null or child_id = p_child_id);
  get diagnostics requirement_count = row_count;

  update public.transport_plan_days
  set status = 'draft',
      confirmed_at = null,
      revision = revision + 1,
      updated_at = now()
  where organization_id = p_organization_id
    and service_date = any(affected_dates);

  return jsonb_build_object(
    'daily_plan_count', daily_plan_count,
    'requirement_count', requirement_count,
    'affected_date_count', coalesce(array_length(affected_dates, 1), 0)
  );
end;
$$;

revoke all on function public.delete_monthly_daily_schedules(uuid, date, uuid) from public;
grant execute on function public.delete_monthly_daily_schedules(uuid, date, uuid) to authenticated;
grant execute on function public.delete_monthly_daily_schedules(uuid, date, uuid) to service_role;

