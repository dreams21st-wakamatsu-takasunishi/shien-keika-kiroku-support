-- Transport-only personal devices need the full current-day dispatch picture
-- to cover incidents safely. Reading another run does not grant operation
-- rights: record_transport_field_action still requires assignment or cover.

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
      'stops', coalesce((
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
      ), '[]'::jsonb),
      'runEvents', coalesce((
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
      ), '[]'::jsonb)
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

revoke all on function public.get_personal_transport_dashboard(date, text) from public;
grant execute on function public.get_personal_transport_dashboard(date, text) to authenticated;
