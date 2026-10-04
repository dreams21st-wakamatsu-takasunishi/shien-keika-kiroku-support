-- Activity-wide planning; does not write child service records or support plans.
create table public.activity_plans (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  kind text not null check (kind in ('工作','運動','調理','外出','生活・学習','その他')),
  activity_date date,
  status text not null default '下書き' check (status in ('下書き','準備完了','実施済み','保管')),
  is_template boolean not null default false,
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 200000),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  check (is_template or activity_date is not null)
);
create index activity_plans_recent_idx on public.activity_plans(organization_id, updated_at desc);
create index activity_plans_date_idx on public.activity_plans(organization_id, activity_date);

create or replace function public.prepare_activity_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_key text; v_item jsonb; v_minutes numeric; v_total numeric := 0;
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.revision := 1;
    new.created_at := now();
  else
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
      or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception 'Activity plan identity cannot be changed';
    end if;
    if new.revision <> old.revision + 1 then
      raise exception 'ACTIVITY_CONFLICT: reload before saving';
    end if;
  end if;
  new.updated_by := auth.uid(); new.updated_at := now();
  foreach v_key in array array['goal','target','location','leader','startTime','considerations','safety','roles','reflection','nextTime'] loop
    if jsonb_typeof(new.content->v_key) is distinct from 'string' or char_length(new.content->>v_key) > 10000 then
      raise exception 'Invalid activity text';
    end if;
  end loop;
  if (new.content->>'startTime') <> '' and (new.content->>'startTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Invalid activity start time';
  end if;
  if jsonb_typeof(new.content->'steps') is distinct from 'array'
    or jsonb_typeof(new.content->'preparations') is distinct from 'array' then
    raise exception 'Invalid activity arrays';
  end if;
  if jsonb_array_length(new.content->'steps') > 40 or jsonb_array_length(new.content->'preparations') > 80 then
    raise exception 'Too many activity items';
  end if;
  for v_item in select value from jsonb_array_elements(new.content->'steps') loop
    if jsonb_typeof(v_item->'id') is distinct from 'string'
      or jsonb_typeof(v_item->'title') is distinct from 'string'
      or char_length(btrim(v_item->>'title')) not between 1 and 200
      or jsonb_typeof(v_item->'support') is distinct from 'string'
      or char_length(v_item->>'support') > 2000
      or jsonb_typeof(v_item->'minutes') is distinct from 'number' then
      raise exception 'Invalid activity step';
    end if;
    v_minutes := (v_item->>'minutes')::numeric;
    if v_minutes <> trunc(v_minutes) or v_minutes not between 1 and 600 then raise exception 'Invalid activity duration'; end if;
    v_total := v_total + v_minutes;
  end loop;
  if v_total > 1440 then raise exception 'Activity exceeds 24 hours'; end if;
  for v_item in select value from jsonb_array_elements(new.content->'preparations') loop
    if jsonb_typeof(v_item->'id') is distinct from 'string'
      or jsonb_typeof(v_item->'name') is distinct from 'string'
      or char_length(btrim(v_item->>'name')) not between 1 and 200
      or jsonb_typeof(v_item->'quantity') is distinct from 'string'
      or char_length(v_item->>'quantity') > 100
      or jsonb_typeof(v_item->'owner') is distinct from 'string'
      or char_length(v_item->>'owner') > 160
      or jsonb_typeof(v_item->'done') is distinct from 'boolean' then
      raise exception 'Invalid activity preparation';
    end if;
  end loop;
  if new.status = '準備完了' and (
    btrim(new.content->>'goal') = '' or btrim(new.content->>'safety') = ''
    or jsonb_array_length(new.content->'steps') = 0
    or exists(select 1 from jsonb_array_elements(new.content->'preparations') p where p->>'done' <> 'true')
  ) then raise exception 'Complete goals, safety, steps and preparations before marking ready'; end if;
  return new;
end;
$$;
revoke all on function public.prepare_activity_plan() from public, anon;
create trigger activity_plan_prepare before insert or update on public.activity_plans
  for each row execute function public.prepare_activity_plan();
create trigger activity_plan_device before insert or update on public.activity_plans
  for each row execute function public.prevent_personal_device_record_mutation();
create trigger activity_plan_audit after insert or update on public.activity_plans
  for each row execute function public.write_audit_log();

alter table public.activity_plans enable row level security;
-- Individual transport-only devices must not read or edit activity planning.
create policy activity_plan_read on public.activity_plans for select to authenticated
  using (organization_id = public.current_organization_id()
    and (public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared'));
create policy activity_plan_insert on public.activity_plans for insert to authenticated
  with check (organization_id = public.current_organization_id() and created_by = auth.uid()
    and (public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared'));
create policy activity_plan_update on public.activity_plans for update to authenticated
  using (organization_id = public.current_organization_id()
    and (public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared'))
  with check (organization_id = public.current_organization_id()
    and (public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared'));
grant select on public.activity_plans to authenticated;
grant insert (organization_id,title,kind,activity_date,status,is_template,content) on public.activity_plans to authenticated;
grant update (title,kind,activity_date,status,is_template,content,revision) on public.activity_plans to authenticated;
-- Plans are archived rather than deleted. No anon or DELETE grant.
revoke all on public.activity_plans from anon;

-- Preserve existing menu access rules and add activity planning.
create or replace function public.set_recorder_menu_preferences(
  p_organization_id uuid, p_recorder_profile_id uuid, p_preferences jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_allowed constant text[] := array['home','dailyChanges','todayWork','attendance','calendar',
    'monthlySchedule','trafficCost','activityPlans','operations','communication','assistant','form','records','meetings','learning','children','templates','team'];
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
