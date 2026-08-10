-- Make audit logging work with composite-key tables and replace a month of transport requirements atomically.

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  affected_id text;
  old_json jsonb;
  new_json jsonb;
begin
  old_json := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_json := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  org_id := coalesce(
    nullif(new_json ->> 'organization_id', '')::uuid,
    nullif(old_json ->> 'organization_id', '')::uuid
  );
  affected_id := coalesce(
    new_json ->> 'id',
    old_json ->> 'id',
    new_json ->> 'service_date',
    old_json ->> 'service_date',
    new_json ->> 'endpoint',
    old_json ->> 'endpoint',
    new_json ->> 'organization_id',
    old_json ->> 'organization_id',
    'unknown'
  );

  insert into public.audit_logs(
    organization_id, actor_id, table_name, row_id, action, old_data, new_data
  ) values (
    org_id,
    auth.uid(),
    tg_table_name,
    affected_id,
    tg_op,
    old_json,
    new_json
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.replace_monthly_transport_requirements(
  p_organization_id uuid,
  p_month date,
  p_requirements jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  month_start date := date_trunc('month', p_month)::date;
  month_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  inserted_count integer := 0;
begin
  if auth.uid() is null
     or p_organization_id is distinct from public.current_organization_id()
     or public.current_user_role() not in ('manager', 'admin') then
    raise exception using errcode = '42501', message = '月間送迎予定を再反映する権限がありません。';
  end if;
  if jsonb_typeof(coalesce(p_requirements, '[]'::jsonb)) is distinct from 'array' then
    raise exception using errcode = '22023', message = '月間送迎予定の形式が不正です。';
  end if;

  delete from public.daily_transport_requirements
  where organization_id = p_organization_id
    and service_date >= month_start
    and service_date < month_end;

  insert into public.daily_transport_requirements (
    organization_id,
    id,
    child_id,
    service_date,
    pickup_enabled,
    dropoff_enabled,
    pickup_pattern,
    pickup_location_profile_id,
    pickup_location_name,
    pickup_address,
    pickup_area,
    pickup_target_time,
    dropoff_location_profile_id,
    dropoff_location_name,
    dropoff_address,
    dropoff_area,
    dropoff_target_time,
    stop_duration_minutes,
    keep_siblings_together,
    source,
    status,
    revision,
    note
  )
  select
    p_organization_id,
    coalesce(entry.id, gen_random_uuid()),
    entry.child_id,
    entry.service_date,
    coalesce(entry.pickup_enabled, true),
    coalesce(entry.dropoff_enabled, true),
    coalesce(entry.pickup_pattern, 'school'),
    entry.pickup_location_profile_id,
    nullif(trim(entry.pickup_location_name), ''),
    nullif(trim(entry.pickup_address), ''),
    nullif(trim(entry.pickup_area), ''),
    entry.pickup_target_time,
    entry.dropoff_location_profile_id,
    nullif(trim(entry.dropoff_location_name), ''),
    nullif(trim(entry.dropoff_address), ''),
    nullif(trim(entry.dropoff_area), ''),
    entry.dropoff_target_time,
    greatest(0, least(60, coalesce(entry.stop_duration_minutes, 5))),
    coalesce(entry.keep_siblings_together, true),
    'baseline',
    'draft',
    greatest(1, coalesce(entry.revision, 1)),
    nullif(trim(entry.note), '')
  from jsonb_to_recordset(coalesce(p_requirements, '[]'::jsonb)) as entry(
    id uuid,
    child_id text,
    service_date date,
    pickup_enabled boolean,
    dropoff_enabled boolean,
    pickup_pattern text,
    pickup_location_profile_id text,
    pickup_location_name text,
    pickup_address text,
    pickup_area text,
    pickup_target_time time,
    dropoff_location_profile_id text,
    dropoff_location_name text,
    dropoff_address text,
    dropoff_area text,
    dropoff_target_time time,
    stop_duration_minutes integer,
    keep_siblings_together boolean,
    revision integer,
    note text
  )
  join public.children child
    on child.organization_id = p_organization_id
   and child.id = entry.child_id
   and child.deleted_at is null
   and child.service_suspended = false
  where entry.service_date >= month_start
    and entry.service_date < month_end;

  get diagnostics inserted_count = row_count;

  update public.transport_plan_days
  set status = 'draft',
      confirmed_at = null,
      revision = revision + 1
  where organization_id = p_organization_id
    and service_date >= month_start
    and service_date < month_end;

  return inserted_count;
end;
$$;

revoke all on function public.replace_monthly_transport_requirements(uuid, date, jsonb) from public;
grant execute on function public.replace_monthly_transport_requirements(uuid, date, jsonb) to authenticated;

comment on function public.replace_monthly_transport_requirements(uuid, date, jsonb) is
  'Atomically rebuilds one month of child transport requirements from current roster defaults.';
