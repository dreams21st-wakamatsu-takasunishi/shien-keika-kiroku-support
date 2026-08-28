-- Managers with transport permission can correct the recorded operation time.
-- Every insert/update remains covered by audit_transport_stop_events_after.

create or replace function public.set_transport_operation_event(
  p_event_id uuid,
  p_transport_run_id uuid,
  p_stop_id text,
  p_event_type text,
  p_event_at timestamptz,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id_value uuid := public.current_organization_id();
  recorder_id_value uuid := public.current_recorder_profile_id();
  run_value public.transport_runs%rowtype;
  event_id_value uuid;
  stop_value jsonb;
  child_id_value text;
  latest_progress_event text;
begin
  if organization_id_value is null or not public.current_user_has_permission('manage_transport') then
    raise exception using errcode = '42501', message = '送迎実績を修正する権限がありません。';
  end if;
  if recorder_id_value is null then
    raise exception using errcode = '42501', message = 'ログイン職員と職員名簿の紐づけを確認してください。';
  end if;
  if p_event_type not in ('departed', 'arrived', 'boarded', 'dropped_off', 'facility_arrived', 'returned') then
    raise exception using errcode = '22023', message = '修正できない送迎操作です。';
  end if;
  if p_event_at is null then
    raise exception using errcode = '22023', message = '時刻を入力してください。';
  end if;

  select * into run_value
  from public.transport_runs
  where organization_id = organization_id_value
    and id = p_transport_run_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = '送迎便が見つかりません。';
  end if;
  if p_event_at < run_value.service_date::timestamptz - interval '1 day'
     or p_event_at >= run_value.service_date::timestamptz + interval '2 days' then
    raise exception using errcode = '22023', message = '運行日から離れた時刻は登録できません。';
  end if;

  if p_event_type in ('arrived', 'boarded', 'dropped_off') then
    select item.value into stop_value
    from jsonb_array_elements(run_value.stops) as item(value)
    where item.value->>'id' = p_stop_id
    limit 1;
    if stop_value is null then
      raise exception using errcode = '22023', message = '対象の乗降地点を確認してください。';
    end if;
    child_id_value := nullif(stop_value->>'childId', '');
  else
    p_stop_id := null;
  end if;

  if p_event_id is not null then
    select event.id into event_id_value
    from public.transport_stop_events event
    where event.id = p_event_id
      and event.organization_id = organization_id_value
      and event.transport_run_id = run_value.id
      and event.event_type = p_event_type
      and event.stop_id is not distinct from p_stop_id
      and event.cancelled_at is null
    for update;
    if event_id_value is null then
      raise exception using errcode = 'P0002', message = '修正対象の送迎実績が見つかりません。';
    end if;
  else
    select event.id into event_id_value
    from public.transport_stop_events event
    where event.organization_id = organization_id_value
      and event.transport_run_id = run_value.id
      and event.event_type = p_event_type
      and event.stop_id is not distinct from p_stop_id
      and event.cancelled_at is null
    order by event.event_at desc
    limit 1
    for update;
  end if;

  if event_id_value is null then
    insert into public.transport_stop_events (
      organization_id, transport_run_id, stop_id, child_id, event_type,
      event_at, recorder_profile_id, note
    ) values (
      organization_id_value, run_value.id, p_stop_id, child_id_value, p_event_type,
      p_event_at, recorder_id_value, nullif(trim(coalesce(p_note, '')), '')
    ) returning id into event_id_value;
  else
    update public.transport_stop_events
    set event_at = p_event_at,
        recorder_profile_id = recorder_id_value,
        note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note)
    where id = event_id_value;
  end if;

  select event.event_type into latest_progress_event
  from public.transport_stop_events event
  where event.organization_id = organization_id_value
    and event.transport_run_id = run_value.id
    and event.cancelled_at is null
    and event.event_type in ('departed', 'boarded', 'dropped_off', 'facility_arrived', 'returned')
  order by case event.event_type
    when 'returned' then 5
    when 'facility_arrived' then 5
    when 'dropped_off' then 4
    when 'boarded' then 3
    when 'departed' then 2
    else 1
  end desc, event.event_at desc
  limit 1;

  update public.transport_runs
  set status = case latest_progress_event
      when 'returned' then '帰着'
      when 'facility_arrived' then '事業所到着'
      when 'dropped_off' then '降車済み'
      when 'boarded' then '乗車済み'
      when 'departed' then '出発済み'
      else status
    end,
    status_updated_at = now(),
    status_updated_by_recorder_id = recorder_id_value
  where organization_id = organization_id_value and id = run_value.id;

  return event_id_value;
end;
$$;

revoke all on function public.set_transport_operation_event(uuid, uuid, text, text, timestamptz, text) from public;
grant execute on function public.set_transport_operation_event(uuid, uuid, text, text, timestamptz, text) to authenticated;

