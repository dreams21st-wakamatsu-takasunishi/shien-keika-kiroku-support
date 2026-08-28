-- Keep transport field access consistent with get_current_staff_device_access:
-- managers, classroom managers and administrators may operate transport from
-- their normal login without registering that browser as a personal device.
-- Staff accounts still require an approved personal or facility-shared device.

create or replace function public.resolve_transport_field_operator(p_device_token text)
returns table(
  organization_id uuid,
  recorder_profile_id uuid,
  device_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_value public.profiles%rowtype;
  recorder_id_value uuid;
  device_value public.organization_devices%rowtype;
  management_operator boolean;
  resolved_device_id uuid;
begin
  select * into profile_value
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.active = true;

  recorder_id_value := public.current_recorder_profile_id();
  device_value := public.current_transport_device(p_device_token);
  management_operator := coalesce(profile_value.role, '') in ('manager', 'classroom_manager', 'admin');

  if profile_value.organization_id is null or recorder_id_value is null then
    raise exception using errcode = '42501', message = 'TRANSPORT_OPERATOR_NOT_LINKED';
  end if;

  if not management_operator and device_value.id is null then
    raise exception using errcode = '42501', message = 'TRANSPORT_DEVICE_ACCESS_DENIED';
  end if;

  if not management_operator
     and device_value.device_kind = 'personal'
     and device_value.owner_recorder_profile_id is distinct from recorder_id_value then
    raise exception using errcode = '42501', message = 'TRANSPORT_DEVICE_OWNER_MISMATCH';
  end if;

  -- Do not attribute a management action to another staff member's personal
  -- device if a stale browser token happens to remain on the machine.
  resolved_device_id := case
    when device_value.id is null then null
    when device_value.device_kind = 'personal'
      and device_value.owner_recorder_profile_id is distinct from recorder_id_value then null
    else device_value.id
  end;

  return query select profile_value.organization_id, recorder_id_value, resolved_device_id;
end;
$$;

create or replace function public.get_personal_transport_dashboard(
  p_service_date date,
  p_device_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  operator_value record;
  organization_id_value uuid;
  recorder_id_value uuid;
  result jsonb;
begin
  select * into operator_value
  from public.resolve_transport_field_operator(p_device_token);
  organization_id_value := operator_value.organization_id;
  recorder_id_value := operator_value.recorder_profile_id;

  with run_details as (
    select
      run.*,
      driver.display_name as driver_name,
      vehicle.name as vehicle_name,
      (
        run.driver_recorder_profile_id = recorder_id_value
        or run.assistant_recorder_profile_ids ? recorder_id_value::text
      ) as is_assigned,
      exists (
        select 1 from public.transport_run_covers cover
        where cover.organization_id = run.organization_id
          and cover.transport_run_id = run.id
          and cover.recorder_profile_id = recorder_id_value
          and cover.ended_at is null
      ) as is_covering
    from public.transport_runs run
    left join public.recorder_profiles driver
      on driver.organization_id = run.organization_id and driver.id = run.driver_recorder_profile_id
    left join public.vehicles vehicle
      on vehicle.organization_id = run.organization_id and vehicle.id = run.vehicle_id
    where run.organization_id = organization_id_value
      and run.service_date = p_service_date
  ), prepared as (
    select jsonb_build_object(
      'id', detail.id,
      'date', detail.service_date,
      'name', detail.name,
      'direction', detail.direction,
      'startTime', detail.start_time,
      'endTime', detail.end_time,
      'driverRecorderProfileId', detail.driver_recorder_profile_id,
      'driverName', detail.driver_name,
      'assistantRecorderProfileIds', detail.assistant_recorder_profile_ids,
      'assistantNames', coalesce((
        select jsonb_agg(profile.display_name order by profile.display_name)
        from public.recorder_profiles profile
        where profile.organization_id = detail.organization_id
          and detail.assistant_recorder_profile_ids ? profile.id::text
      ), '[]'::jsonb),
      'vehicleId', detail.vehicle_id,
      'vehicleName', detail.vehicle_name,
      'status', detail.status,
      'statusUpdatedAt', detail.status_updated_at,
      'passengerCount', jsonb_array_length(detail.stops),
      'isAssigned', detail.is_assigned,
      'isCovering', detail.is_covering,
      'hasHelpRequest', exists (
        select 1 from public.transport_stop_events event
        where event.organization_id = detail.organization_id
          and event.transport_run_id = detail.id
          and event.event_type = 'help_requested'
          and event.cancelled_at is null
          and event.event_at > now() - interval '2 hours'
      ),
      'hasDelay', exists (
        select 1 from public.transport_stop_events event
        where event.organization_id = detail.organization_id
          and event.transport_run_id = detail.id
          and event.event_type = 'delay'
          and event.cancelled_at is null
          and event.event_at > now() - interval '2 hours'
      ),
      'stops', case when detail.is_assigned or detail.is_covering then coalesce((
        select jsonb_agg(
          stop.value || jsonb_build_object(
            'events', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', event.id,
                'eventType', event.event_type,
                'eventAt', event.event_at,
                'recorderProfileId', event.recorder_profile_id,
                'recorderName', recorder.display_name,
                'cancelledAt', event.cancelled_at
              ) order by event.event_at)
              from public.transport_stop_events event
              left join public.recorder_profiles recorder
                on recorder.organization_id = event.organization_id and recorder.id = event.recorder_profile_id
              where event.organization_id = detail.organization_id
                and event.transport_run_id = detail.id
                and event.stop_id = stop.value->>'id'
            ), '[]'::jsonb)
          ) order by coalesce((stop.value->>'order')::integer, stop.ordinality::integer)
        )
        from jsonb_array_elements(detail.stops) with ordinality as stop(value, ordinality)
      ), '[]'::jsonb) else '[]'::jsonb end,
      'runEvents', case when detail.is_assigned or detail.is_covering then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', event.id,
          'eventType', event.event_type,
          'eventAt', event.event_at,
          'recorderProfileId', event.recorder_profile_id,
          'recorderName', recorder.display_name,
          'cancelledAt', event.cancelled_at
        ) order by event.event_at)
        from public.transport_stop_events event
        left join public.recorder_profiles recorder
          on recorder.organization_id = event.organization_id and recorder.id = event.recorder_profile_id
        where event.organization_id = detail.organization_id
          and event.transport_run_id = detail.id
          and event.stop_id is null
      ), '[]'::jsonb) else '[]'::jsonb end
    ) as item,
    detail.is_assigned,
    detail.is_covering,
    detail.start_time
    from run_details detail
  )
  select jsonb_build_object(
    'serviceDate', p_service_date,
    'recorderProfileId', recorder_id_value,
    'myRuns', coalesce(jsonb_agg(item order by start_time)
      filter (where is_assigned or is_covering), '[]'::jsonb),
    'allRuns', coalesce(jsonb_agg(item order by start_time), '[]'::jsonb)
  ) into result
  from prepared;

  return coalesce(result, jsonb_build_object(
    'serviceDate', p_service_date,
    'recorderProfileId', recorder_id_value,
    'myRuns', '[]'::jsonb,
    'allRuns', '[]'::jsonb
  ));
end;
$$;

create or replace function public.record_transport_field_action(
  p_transport_run_id uuid,
  p_stop_id text,
  p_action text,
  p_device_token text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  operator_value record;
  organization_id_value uuid;
  recorder_id_value uuid;
  device_id_value uuid;
  run_value public.transport_runs%rowtype;
  stop_value jsonb;
  child_id_value text;
  existing_event_id uuid;
  inserted_event_id uuid;
  assigned boolean;
begin
  if p_action not in ('departed', 'arrived', 'boarded', 'dropped_off', 'facility_arrived', 'returned', 'delay', 'help_requested') then
    raise exception using errcode = '22023', message = 'Unsupported transport action.';
  end if;

  select * into operator_value
  from public.resolve_transport_field_operator(p_device_token);
  organization_id_value := operator_value.organization_id;
  recorder_id_value := operator_value.recorder_profile_id;
  device_id_value := operator_value.device_id;

  select * into run_value from public.transport_runs
  where organization_id = organization_id_value and id = p_transport_run_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Transport run not found.'; end if;

  assigned := run_value.driver_recorder_profile_id = recorder_id_value
    or run_value.assistant_recorder_profile_ids ? recorder_id_value::text
    or exists (
      select 1 from public.transport_run_covers cover
      where cover.organization_id = organization_id_value
        and cover.transport_run_id = run_value.id
        and cover.recorder_profile_id = recorder_id_value
        and cover.ended_at is null
    );
  if not assigned then
    raise exception using errcode = '42501', message = 'TRANSPORT_NOT_ASSIGNED';
  end if;

  if p_action in ('arrived', 'boarded', 'dropped_off') then
    select value into stop_value
    from jsonb_array_elements(run_value.stops) as item(value)
    where value->>'id' = p_stop_id
    limit 1;
    if stop_value is null then
      raise exception using errcode = '22023', message = 'Transport stop is required.';
    end if;
    child_id_value := nullif(stop_value->>'childId', '');
  else
    p_stop_id := null;
  end if;

  select event.id into existing_event_id
  from public.transport_stop_events event
  where event.organization_id = organization_id_value
    and event.transport_run_id = run_value.id
    and event.recorder_profile_id = recorder_id_value
    and event.event_type = p_action
    and event.stop_id is not distinct from p_stop_id
    and event.cancelled_at is null
    and event.event_at > now() - interval '10 seconds'
  order by event.event_at desc limit 1;
  if existing_event_id is not null then return existing_event_id; end if;

  insert into public.transport_stop_events (
    organization_id, transport_run_id, stop_id, child_id, event_type,
    recorder_profile_id, device_id, note
  ) values (
    organization_id_value, run_value.id, p_stop_id, child_id_value, p_action,
    recorder_id_value, device_id_value, nullif(trim(coalesce(p_note, '')), '')
  ) returning id into inserted_event_id;

  update public.transport_runs
  set status = case p_action
      when 'departed' then '出発済み'
      when 'boarded' then '乗車済み'
      when 'dropped_off' then '降車済み'
      when 'facility_arrived' then '事業所到着'
      when 'returned' then '帰着'
      else status
    end,
    status_updated_at = case when p_action in ('departed', 'boarded', 'dropped_off', 'facility_arrived', 'returned') then now() else status_updated_at end,
    status_updated_by_recorder_id = case when p_action in ('departed', 'boarded', 'dropped_off', 'facility_arrived', 'returned') then recorder_id_value else status_updated_by_recorder_id end
  where organization_id = organization_id_value and id = run_value.id;

  return inserted_event_id;
end;
$$;

create or replace function public.cancel_transport_field_action(
  p_event_id uuid,
  p_device_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  operator_value record;
  organization_id_value uuid;
  recorder_id_value uuid;
  target_event public.transport_stop_events%rowtype;
  fallback_status text;
begin
  select * into operator_value
  from public.resolve_transport_field_operator(p_device_token);
  organization_id_value := operator_value.organization_id;
  recorder_id_value := operator_value.recorder_profile_id;

  select * into target_event from public.transport_stop_events
  where id = p_event_id
    and organization_id = organization_id_value
    and recorder_profile_id = recorder_id_value
    and cancelled_at is null
    and event_at > now() - interval '60 seconds'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'この操作は取り消せません。管理者へ修正を依頼してください。';
  end if;

  update public.transport_stop_events
  set cancelled_at = now(), cancelled_by_recorder_profile_id = recorder_id_value
  where id = target_event.id;

  if target_event.event_type in ('departed', 'boarded', 'dropped_off', 'facility_arrived', 'returned') then
    select case event.event_type
      when 'returned' then '帰着'
      when 'facility_arrived' then '事業所到着'
      when 'dropped_off' then '降車済み'
      when 'boarded' then '乗車済み'
      when 'departed' then '出発済み'
      else '未出発'
    end into fallback_status
    from public.transport_stop_events event
    where event.organization_id = target_event.organization_id
      and event.transport_run_id = target_event.transport_run_id
      and event.cancelled_at is null
      and event.event_type in ('departed', 'boarded', 'dropped_off', 'facility_arrived', 'returned')
    order by event.event_at desc
    limit 1;

    update public.transport_runs
    set status = coalesce(fallback_status, '未出発'),
        status_updated_at = now(),
        status_updated_by_recorder_id = recorder_id_value
    where organization_id = target_event.organization_id
      and id = target_event.transport_run_id;
  end if;
end;
$$;

create or replace function public.set_transport_cover(
  p_transport_run_id uuid,
  p_active boolean,
  p_device_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  operator_value record;
  organization_id_value uuid;
  recorder_id_value uuid;
  device_id_value uuid;
begin
  select * into operator_value
  from public.resolve_transport_field_operator(p_device_token);
  organization_id_value := operator_value.organization_id;
  recorder_id_value := operator_value.recorder_profile_id;
  device_id_value := operator_value.device_id;

  if not exists (
    select 1 from public.transport_runs
    where organization_id = organization_id_value and id = p_transport_run_id
  ) then
    raise exception using errcode = 'P0002', message = 'Transport run not found.';
  end if;
  if p_active then
    insert into public.transport_run_covers (
      organization_id, transport_run_id, recorder_profile_id, device_id
    ) values (
      organization_id_value, p_transport_run_id, recorder_id_value, device_id_value
    ) on conflict do nothing;
  else
    update public.transport_run_covers set ended_at = now()
    where organization_id = organization_id_value
      and transport_run_id = p_transport_run_id
      and recorder_profile_id = recorder_id_value
      and ended_at is null;
  end if;
end;
$$;

revoke all on function public.resolve_transport_field_operator(text) from public;
revoke all on function public.get_personal_transport_dashboard(date, text) from public;
revoke all on function public.record_transport_field_action(uuid, text, text, text, text) from public;
revoke all on function public.cancel_transport_field_action(uuid, text) from public;
revoke all on function public.set_transport_cover(uuid, boolean, text) from public;

grant execute on function public.get_personal_transport_dashboard(date, text) to authenticated;
grant execute on function public.record_transport_field_action(uuid, text, text, text, text) to authenticated;
grant execute on function public.cancel_transport_field_action(uuid, text) to authenticated;
grant execute on function public.set_transport_cover(uuid, boolean, text) to authenticated;
