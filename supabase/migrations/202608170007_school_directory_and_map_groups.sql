-- Shared school ledger and pin-based transport grouping.

create table if not exists public.schools (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  address text not null check (char_length(trim(address)) between 1 and 300),
  area text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create index if not exists schools_name_idx
  on public.schools(organization_id, name);

alter table public.children
  add column if not exists school_id text;

alter table public.transport_map_locations
  add column if not exists school_id text;

alter table public.transport_area_zones
  add column if not exists location_ids text[] not null default '{}';

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.transport_map_locations'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%source_type%';
  if constraint_name is not null then
    execute format('alter table public.transport_map_locations drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.transport_map_locations
  add constraint transport_map_locations_source_type_check
  check (source_type in ('facility', 'child', 'school'));

-- Seed one shared school entry for each existing school address. This keeps
-- existing child data working while making repeated addresses selectable.
with legacy_schools as (
  select distinct on (
    child.organization_id,
    lower(trim(location ->> 'name')),
    lower(trim(location ->> 'address'))
  )
    child.organization_id,
    'school-' || md5(lower(trim(location ->> 'name')) || '|' || lower(trim(location ->> 'address'))) as id,
    trim(location ->> 'name') as name,
    trim(location ->> 'address') as address,
    nullif(trim(location ->> 'area'), '') as area
  from public.children child
  cross join lateral jsonb_array_elements(coalesce(child.transport_locations, '[]'::jsonb)) location
  where child.deleted_at is null
    and location ->> 'type' = '学校'
    and trim(coalesce(location ->> 'name', '')) <> ''
    and trim(coalesce(location ->> 'address', '')) <> ''
)
insert into public.schools (organization_id, id, name, address, area)
select organization_id, id, name, address, area
from legacy_schools
on conflict (organization_id, id) do nothing;

update public.children child
set school_id = school.id
from public.schools school
where child.organization_id = school.organization_id
  and child.school_id is null
  and child.deleted_at is null
  and lower(trim(coalesce(child.school_name, ''))) = lower(trim(school.name));

drop trigger if exists schools_updated_at on public.schools;
create trigger schools_updated_at
  before update on public.schools
  for each row execute function public.set_updated_at();

alter table public.schools enable row level security;

drop policy if exists schools_select on public.schools;
create policy schools_select on public.schools for select
  using (organization_id = public.current_organization_id());

drop policy if exists schools_write on public.schools;
create policy schools_write on public.schools for all
  using (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'))
  with check (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'));

grant select, insert, update, delete on public.schools to authenticated;

drop trigger if exists audit_schools_after on public.schools;
create trigger audit_schools_after
  after insert or update or delete on public.schools
  for each row execute function public.write_audit_log();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'schools'
  ) then
    alter publication supabase_realtime add table public.schools;
  end if;
end $$;

comment on table public.schools is
  'Organization-wide school ledger reused by child profiles, transport planning and map pins.';
comment on column public.transport_area_zones.location_ids is
  'Transport map pin IDs explicitly grouped into the same preferred dispatch area.';
