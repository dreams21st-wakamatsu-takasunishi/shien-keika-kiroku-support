-- Geocoded transport locations and visual priority zones for dispatch planning.

create table if not exists public.transport_map_locations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  source_type text not null check (source_type in ('facility', 'child')),
  child_id text,
  location_profile_id text,
  location_name text not null,
  location_type text not null,
  address text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  geocode_source text not null check (geocode_source in ('google', 'manual')),
  geocoded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create index if not exists transport_map_locations_child_idx
  on public.transport_map_locations(organization_id, child_id);

create table if not exists public.transport_area_zones (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  color text not null default '#0f766e' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  center_latitude double precision not null check (center_latitude between -90 and 90),
  center_longitude double precision not null check (center_longitude between -180 and 180),
  radius_km numeric(6,2) not null default 2 check (radius_km between 0.1 and 50),
  priority integer not null default 100 check (priority between 1 and 999),
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

drop trigger if exists transport_map_locations_updated_at on public.transport_map_locations;
create trigger transport_map_locations_updated_at
  before update on public.transport_map_locations
  for each row execute function public.set_updated_at();

drop trigger if exists transport_area_zones_updated_at on public.transport_area_zones;
create trigger transport_area_zones_updated_at
  before update on public.transport_area_zones
  for each row execute function public.set_updated_at();

alter table public.transport_map_locations enable row level security;
alter table public.transport_area_zones enable row level security;

drop policy if exists transport_map_locations_select on public.transport_map_locations;
create policy transport_map_locations_select on public.transport_map_locations for select
  using (organization_id = public.current_organization_id());
drop policy if exists transport_map_locations_write on public.transport_map_locations;
create policy transport_map_locations_write on public.transport_map_locations for all
  using (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'))
  with check (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'));

drop policy if exists transport_area_zones_select on public.transport_area_zones;
create policy transport_area_zones_select on public.transport_area_zones for select
  using (organization_id = public.current_organization_id());
drop policy if exists transport_area_zones_write on public.transport_area_zones;
create policy transport_area_zones_write on public.transport_area_zones for all
  using (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'))
  with check (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'));

grant select, insert, update, delete on public.transport_map_locations to authenticated;
grant select, insert, update, delete on public.transport_area_zones to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transport_map_locations'
  ) then
    alter publication supabase_realtime add table public.transport_map_locations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transport_area_zones'
  ) then
    alter publication supabase_realtime add table public.transport_area_zones;
  end if;
end $$;
