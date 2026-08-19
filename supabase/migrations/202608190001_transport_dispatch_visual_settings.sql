-- Dispatch grouping threshold and configurable fallback marker colors.

alter table public.transport_route_settings
  add column if not exists same_location_time_window_minutes integer not null default 15,
  add column if not exists facility_pin_color text not null default '#7c3aed',
  add column if not exists residential_pin_color text not null default '#059669',
  add column if not exists education_pin_color text not null default '#0284c7',
  add column if not exists other_pin_color text not null default '#d97706';

alter table public.transport_route_settings
  drop constraint if exists transport_route_settings_same_location_time_window_range,
  drop constraint if exists transport_route_settings_facility_pin_color_hex,
  drop constraint if exists transport_route_settings_residential_pin_color_hex,
  drop constraint if exists transport_route_settings_education_pin_color_hex,
  drop constraint if exists transport_route_settings_other_pin_color_hex;

alter table public.transport_route_settings
  add constraint transport_route_settings_same_location_time_window_range
    check (same_location_time_window_minutes between 0 and 120),
  add constraint transport_route_settings_facility_pin_color_hex
    check (facility_pin_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint transport_route_settings_residential_pin_color_hex
    check (residential_pin_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint transport_route_settings_education_pin_color_hex
    check (education_pin_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint transport_route_settings_other_pin_color_hex
    check (other_pin_color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.transport_route_settings.same_location_time_window_minutes is
  'Maximum time difference used to visually group children with the same pickup or dropoff location.';

-- Convert the former multi-priority/circular-zone model to one explicit area
-- per map location. Preserve the highest-ranked existing assignment.
with expanded as (
  select
    zone.organization_id,
    zone.id as zone_id,
    location_id,
    case
      when coalesce(zone.location_priorities ->> location_id, '') ~ '^[0-9]+$'
        then (zone.location_priorities ->> location_id)::integer
      else 1000
    end as location_rank,
    zone.priority as zone_priority
  from public.transport_area_zones zone
  cross join lateral unnest(zone.location_ids) as expanded_location(location_id)
), ranked as (
  select
    organization_id,
    zone_id,
    location_id,
    row_number() over (
      partition by organization_id, location_id
      order by location_rank, zone_priority, zone_id
    ) as assignment_rank
  from expanded
)
update public.transport_area_zones zone
set
  location_ids = coalesce((
    select array_agg(ranked.location_id order by ranked.location_id)
    from ranked
    where ranked.organization_id = zone.organization_id
      and ranked.zone_id = zone.id
      and ranked.assignment_rank = 1
  ), '{}'::text[]),
  location_priorities = '{}'::jsonb,
  show_boundary = false;

comment on column public.transport_area_zones.location_ids is
  'Map location IDs explicitly assigned to this single named dispatch area.';
comment on column public.transport_area_zones.location_priorities is
  'Deprecated compatibility field. Dispatch now uses one explicit area per map location.';
comment on column public.transport_area_zones.show_boundary is
  'Deprecated compatibility field. Circular priority boundaries are no longer used.';
