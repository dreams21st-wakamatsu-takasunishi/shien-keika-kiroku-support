-- Store whether each pickup/dropoff time is fixed or calculated from a route anchor.

alter table public.daily_transport_requirements
  add column if not exists pickup_time_mode text not null default 'fixed',
  add column if not exists dropoff_time_mode text not null default 'departure_forward';

alter table public.daily_transport_requirements
  drop constraint if exists daily_transport_requirements_pickup_time_mode_check,
  drop constraint if exists daily_transport_requirements_dropoff_time_mode_check;

alter table public.daily_transport_requirements
  add constraint daily_transport_requirements_pickup_time_mode_check
    check (pickup_time_mode in ('fixed', 'arrival_backward', 'departure_forward')),
  add constraint daily_transport_requirements_dropoff_time_mode_check
    check (dropoff_time_mode in ('fixed', 'arrival_backward', 'departure_forward'));

-- Preserve the operational meaning of existing data: holiday home pickup times
-- are facility-arrival anchors and dropoff times are facility-departure anchors.
update public.daily_transport_requirements
set pickup_time_mode = case when pickup_pattern = 'home' then 'arrival_backward' else 'fixed' end,
    dropoff_time_mode = 'departure_forward';

comment on column public.daily_transport_requirements.pickup_time_mode is
  'fixed: child stop time; arrival_backward: calculate backward from facility arrival; departure_forward: calculate forward from facility departure.';
comment on column public.daily_transport_requirements.dropoff_time_mode is
  'fixed: child stop time; arrival_backward: calculate backward from facility return; departure_forward: calculate forward from facility departure.';

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
    organization_id, id, child_id, service_date,
    pickup_enabled, dropoff_enabled, pickup_pattern,
    pickup_location_profile_id, pickup_location_name, pickup_address, pickup_area,
    pickup_time_mode, pickup_target_time,
    dropoff_location_profile_id, dropoff_location_name, dropoff_address, dropoff_area,
    dropoff_time_mode, dropoff_target_time,
    stop_duration_minutes, keep_siblings_together,
    source, status, revision, note
  )
  select
    p_organization_id, coalesce(entry.id, gen_random_uuid()), entry.child_id, entry.service_date,
    coalesce(entry.pickup_enabled, true), coalesce(entry.dropoff_enabled, true), coalesce(entry.pickup_pattern, 'school'),
    entry.pickup_location_profile_id, nullif(trim(entry.pickup_location_name), ''), nullif(trim(entry.pickup_address), ''), nullif(trim(entry.pickup_area), ''),
    coalesce(entry.pickup_time_mode, case when entry.pickup_pattern = 'home' then 'arrival_backward' else 'fixed' end), entry.pickup_target_time,
    entry.dropoff_location_profile_id, nullif(trim(entry.dropoff_location_name), ''), nullif(trim(entry.dropoff_address), ''), nullif(trim(entry.dropoff_area), ''),
    coalesce(entry.dropoff_time_mode, 'departure_forward'), entry.dropoff_target_time,
    greatest(0, least(60, coalesce(entry.stop_duration_minutes, 5))), coalesce(entry.keep_siblings_together, true),
    'baseline', 'draft', greatest(1, coalesce(entry.revision, 1)), nullif(trim(entry.note), '')
  from jsonb_to_recordset(coalesce(p_requirements, '[]'::jsonb)) as entry(
    id uuid, child_id text, service_date date,
    pickup_enabled boolean, dropoff_enabled boolean, pickup_pattern text,
    pickup_location_profile_id text, pickup_location_name text, pickup_address text, pickup_area text,
    pickup_time_mode text, pickup_target_time time,
    dropoff_location_profile_id text, dropoff_location_name text, dropoff_address text, dropoff_area text,
    dropoff_time_mode text, dropoff_target_time time,
    stop_duration_minutes integer, keep_siblings_together boolean, revision integer, note text
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
  set status = 'draft', confirmed_at = null, revision = revision + 1
  where organization_id = p_organization_id
    and service_date >= month_start
    and service_date < month_end;
  return inserted_count;
end;
$$;

revoke all on function public.replace_monthly_transport_requirements(uuid, date, jsonb) from public;
grant execute on function public.replace_monthly_transport_requirements(uuid, date, jsonb) to authenticated;

create or replace function public.replace_child_monthly_transport_requirements(
  p_organization_id uuid,
  p_month date,
  p_child_id text,
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
  affected_dates date[] := array[]::date[];
  inserted_count integer := 0;
begin
  if auth.uid() is null
     or p_organization_id is distinct from public.current_organization_id()
     or public.current_user_role() not in ('manager', 'admin') then
    raise exception using errcode = '42501', message = '児童別の月間送迎予定を反映する権限がありません。';
  end if;
  if coalesce(trim(p_child_id), '') = '' then
    raise exception using errcode = '22023', message = '児童を選択してください。';
  end if;
  if jsonb_typeof(coalesce(p_requirements, '[]'::jsonb)) is distinct from 'array' then
    raise exception using errcode = '22023', message = '児童別の月間送迎予定の形式が不正です。';
  end if;
  if not exists (
    select 1 from public.children child
    where child.organization_id = p_organization_id
      and child.id = p_child_id
      and child.deleted_at is null
      and child.service_suspended = false
  ) then
    raise exception using errcode = '22023', message = '対象児童が見つからないか、利用休止中です。';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_requirements, '[]'::jsonb)) entry
    where entry->>'child_id' is distinct from p_child_id
      or nullif(entry->>'service_date', '')::date < month_start
      or nullif(entry->>'service_date', '')::date >= month_end
  ) then
    raise exception using errcode = '22023', message = '対象児童または対象月が一致しない予定が含まれています。';
  end if;

  select coalesce(array_agg(distinct target_date), array[]::date[])
  into affected_dates
  from (
    select service_date as target_date
    from public.daily_transport_requirements
    where organization_id = p_organization_id
      and child_id = p_child_id
      and service_date >= month_start
      and service_date < month_end
    union
    select nullif(entry->>'service_date', '')::date
    from jsonb_array_elements(coalesce(p_requirements, '[]'::jsonb)) entry
  ) affected;

  delete from public.daily_transport_requirements
  where organization_id = p_organization_id
    and child_id = p_child_id
    and service_date >= month_start
    and service_date < month_end;

  insert into public.daily_transport_requirements (
    organization_id, id, child_id, service_date,
    pickup_enabled, dropoff_enabled, pickup_pattern,
    pickup_location_profile_id, pickup_location_name, pickup_address, pickup_area,
    pickup_time_mode, pickup_target_time,
    dropoff_location_profile_id, dropoff_location_name, dropoff_address, dropoff_area,
    dropoff_time_mode, dropoff_target_time,
    stop_duration_minutes, keep_siblings_together,
    source, status, revision, note
  )
  select
    p_organization_id, coalesce(entry.id, gen_random_uuid()), entry.child_id, entry.service_date,
    coalesce(entry.pickup_enabled, true), coalesce(entry.dropoff_enabled, true), coalesce(entry.pickup_pattern, 'school'),
    entry.pickup_location_profile_id, nullif(trim(entry.pickup_location_name), ''), nullif(trim(entry.pickup_address), ''), nullif(trim(entry.pickup_area), ''),
    coalesce(entry.pickup_time_mode, case when entry.pickup_pattern = 'home' then 'arrival_backward' else 'fixed' end), entry.pickup_target_time,
    entry.dropoff_location_profile_id, nullif(trim(entry.dropoff_location_name), ''), nullif(trim(entry.dropoff_address), ''), nullif(trim(entry.dropoff_area), ''),
    coalesce(entry.dropoff_time_mode, 'departure_forward'), entry.dropoff_target_time,
    greatest(0, least(60, coalesce(entry.stop_duration_minutes, 5))), coalesce(entry.keep_siblings_together, true),
    'baseline', 'draft', greatest(1, coalesce(entry.revision, 1)), nullif(trim(entry.note), '')
  from jsonb_to_recordset(coalesce(p_requirements, '[]'::jsonb)) as entry(
    id uuid, child_id text, service_date date,
    pickup_enabled boolean, dropoff_enabled boolean, pickup_pattern text,
    pickup_location_profile_id text, pickup_location_name text, pickup_address text, pickup_area text,
    pickup_time_mode text, pickup_target_time time,
    dropoff_location_profile_id text, dropoff_location_name text, dropoff_address text, dropoff_area text,
    dropoff_time_mode text, dropoff_target_time time,
    stop_duration_minutes integer, keep_siblings_together boolean, revision integer, note text
  );

  get diagnostics inserted_count = row_count;
  update public.transport_plan_days
  set status = 'draft', confirmed_at = null, revision = revision + 1
  where organization_id = p_organization_id
    and service_date = any(affected_dates);
  return inserted_count;
end;
$$;

revoke all on function public.replace_child_monthly_transport_requirements(uuid, date, text, jsonb) from public;
grant execute on function public.replace_child_monthly_transport_requirements(uuid, date, text, jsonb) to authenticated;
