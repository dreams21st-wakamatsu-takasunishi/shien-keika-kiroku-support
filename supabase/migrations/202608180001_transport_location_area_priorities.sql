-- Named transport areas with per-location preference ordering.

alter table public.transport_area_zones
  add column if not exists location_priorities jsonb not null default '{}'::jsonb,
  add column if not exists show_boundary boolean not null default true;

alter table public.transport_area_zones
  drop constraint if exists transport_area_zones_location_priorities_object;

alter table public.transport_area_zones
  add constraint transport_area_zones_location_priorities_object
  check (jsonb_typeof(location_priorities) = 'object');

-- Preserve existing pin assignments. If a pin belonged to multiple areas,
-- the prior global area order becomes that pin's initial preference order.
with ranked_locations as (
  select
    zone.organization_id,
    zone.id as zone_id,
    location_id,
    row_number() over (
      partition by zone.organization_id, location_id
      order by zone.priority, zone.name, zone.id
    ) as location_rank
  from public.transport_area_zones zone
  cross join lateral unnest(zone.location_ids) as expanded(location_id)
), grouped as (
  select
    organization_id,
    zone_id,
    jsonb_object_agg(location_id, location_rank) as priorities
  from ranked_locations
  group by organization_id, zone_id
)
update public.transport_area_zones zone
set location_priorities = grouped.priorities
from grouped
where zone.organization_id = grouped.organization_id
  and zone.id = grouped.zone_id
  and zone.location_priorities = '{}'::jsonb;

comment on column public.transport_area_zones.location_priorities is
  'Map of transport map location ID to per-location preferred area rank (1 is highest).';
comment on column public.transport_area_zones.show_boundary is
  'Whether the optional circular boundary is displayed and used as a fallback assignment.';
