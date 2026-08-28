-- Keep the server-side menu validation aligned with the current home
-- workspaces. The original function only knew the six legacy navigation IDs,
-- so saving any of the newer home items failed with HTTP 400.

create or replace function public.set_recorder_menu_preferences(
  p_organization_id uuid,
  p_recorder_profile_id uuid,
  p_preferences jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed constant text[] := array[
    'home',
    'dailyChanges',
    'todayWork',
    'attendance',
    'calendar',
    'monthlySchedule',
    'operations',
    'communication',
    'assistant',
    'form',
    'records',
    'children',
    'templates',
    'team'
  ];
  v_order_input jsonb;
  v_hidden_input jsonb;
  v_preferences jsonb;
begin
  if p_organization_id is distinct from public.current_organization_id() then
    raise exception using errcode = '42501', message = 'Recorder menu settings require organization access.';
  end if;

  if jsonb_typeof(coalesce(p_preferences, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'Menu preferences must be an object.';
  end if;

  v_order_input := coalesce(p_preferences -> 'order', '[]'::jsonb);
  v_hidden_input := coalesce(p_preferences -> 'hidden', '[]'::jsonb);

  if jsonb_typeof(v_order_input) <> 'array' or jsonb_typeof(v_hidden_input) <> 'array' then
    raise exception using errcode = '22023', message = 'Menu order and hidden values must be arrays.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(v_order_input) as item(value)
    where not (item.value = any(v_allowed))
  ) or exists (
    select 1
    from jsonb_array_elements_text(v_hidden_input) as item(value)
    where not (item.value = any(v_allowed))
  ) then
    raise exception using errcode = '22023', message = 'Menu preferences contain an unknown item.';
  end if;

  select jsonb_build_object(
    'order', coalesce((
      select jsonb_agg(item.value order by item.first_position)
      from (
        select value, min(position) as first_position
        from jsonb_array_elements_text(v_order_input) with ordinality as ordered(value, position)
        group by value
      ) as item
    ), '[]'::jsonb),
    'hidden', coalesce((
      select jsonb_agg(item.value order by item.first_position)
      from (
        select value, min(position) as first_position
        from jsonb_array_elements_text(v_hidden_input) with ordinality as hidden(value, position)
        where value <> 'home'
        group by value
      ) as item
    ), '[]'::jsonb)
  ) into v_preferences;

  update public.recorder_profiles
  set menu_preferences = v_preferences
  where organization_id = p_organization_id
    and id = p_recorder_profile_id
    and active = true;

  if not found then
    raise exception using errcode = 'P0002', message = 'Active recorder profile was not found.';
  end if;

  return v_preferences;
end;
$$;

revoke all on function public.set_recorder_menu_preferences(uuid, uuid, jsonb) from public;
grant execute on function public.set_recorder_menu_preferences(uuid, uuid, jsonb) to authenticated;
