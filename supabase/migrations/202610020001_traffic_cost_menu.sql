-- Add the calculator to configurable menus without changing access rules.
create or replace function public.set_recorder_menu_preferences(
  p_organization_id uuid, p_recorder_profile_id uuid, p_preferences jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_allowed constant text[] := array['home','dailyChanges','todayWork','attendance','calendar',
    'monthlySchedule','trafficCost','operations','communication','assistant','form','records','meetings','learning','children','templates','team'];
  v_order jsonb; v_hidden jsonb; v_preferences jsonb;
begin
  if p_organization_id is distinct from public.current_organization_id() then
    raise exception 'Recorder menu settings require organization access.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_preferences, '{}'::jsonb)) <> 'object' then
    raise exception 'Menu preferences must be an object.' using errcode = '22023';
  end if;
  v_order := coalesce(p_preferences->'order', '[]'::jsonb);
  v_hidden := coalesce(p_preferences->'hidden', '[]'::jsonb);
  if jsonb_typeof(v_order) <> 'array' or jsonb_typeof(v_hidden) <> 'array' then
    raise exception 'Menu order and hidden values must be arrays.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(v_order) v(value) where not (v.value = any(v_allowed)))
    or exists (select 1 from jsonb_array_elements_text(v_hidden) v(value) where not (v.value = any(v_allowed))) then
    raise exception 'Menu preferences contain an unknown item.' using errcode = '22023';
  end if;
  select jsonb_build_object('order', coalesce((select jsonb_agg(value order by first_position) from (
    select value, min(position) first_position from jsonb_array_elements_text(v_order) with ordinality as ordered(value, position) group by value
  ) x), '[]'::jsonb), 'hidden', coalesce((select jsonb_agg(value order by first_position) from (
    select value, min(position) first_position from jsonb_array_elements_text(v_hidden) with ordinality as hidden(value, position)
    where value <> 'home' group by value
  ) x), '[]'::jsonb)) into v_preferences;
  update public.recorder_profiles set menu_preferences = v_preferences
    where organization_id = p_organization_id and id = p_recorder_profile_id and active;
  if not found then raise exception 'Active recorder profile was not found.' using errcode = 'P0002'; end if;
  return v_preferences;
end;
$$;
revoke all on function public.set_recorder_menu_preferences(uuid, uuid, jsonb) from public, anon;
grant execute on function public.set_recorder_menu_preferences(uuid, uuid, jsonb) to authenticated;
