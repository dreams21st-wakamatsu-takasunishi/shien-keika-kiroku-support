-- Monthly transport requirements and production-ready assignment settings.
-- Requirements are edited before dispatch; confirmed transport_runs remain the
-- immutable execution snapshot used by the personal field mode.

alter table public.children
  add column if not exists pickup_area text,
  add column if not exists dropoff_area text;

alter table public.vehicles
  add column if not exists vehicle_kind text not null default 'facility'
    check (vehicle_kind in ('facility', 'reserve', 'private')),
  add column if not exists assignment_priority integer not null default 100
    check (assignment_priority between 1 and 999),
  add column if not exists auto_assignment_policy text not null default 'always'
    check (auto_assignment_policy in ('always', 'when_needed', 'manual_only')),
  add column if not exists owner_recorder_profile_id uuid,
  add column if not exists insurance_due_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicles_owner_recorder_profile_fk'
      and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_owner_recorder_profile_fk
      foreign key (organization_id, owner_recorder_profile_id)
      references public.recorder_profiles(organization_id, id) on delete set null;
  end if;
end $$;

alter table public.transport_route_settings
  add column if not exists holiday_arrival_time time not null default '10:00',
  add column if not exists school_wait_tolerance_minutes integer not null default 10
    check (school_wait_tolerance_minutes between 0 and 60),
  add column if not exists minimum_facility_staff integer not null default 2
    check (minimum_facility_staff between 0 and 30);

create table if not exists public.transport_plan_days (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_date date not null,
  pickup_mode text not null default 'school'
    check (pickup_mode in ('school', 'home', 'custom')),
  target_arrival_time time not null default '10:00',
  status text not null default 'draft'
    check (status in ('draft', 'requirements_confirmed', 'dispatch_draft', 'dispatch_confirmed')),
  revision integer not null default 1 check (revision >= 1),
  note text,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, service_date)
);

create table if not exists public.daily_transport_requirements (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  child_id text not null,
  service_date date not null,
  pickup_enabled boolean not null default true,
  dropoff_enabled boolean not null default true,
  pickup_pattern text not null default 'school'
    check (pickup_pattern in ('school', 'home', 'custom')),
  pickup_location_profile_id text,
  pickup_location_name text,
  pickup_address text,
  pickup_area text,
  pickup_target_time time,
  dropoff_location_profile_id text,
  dropoff_location_name text,
  dropoff_address text,
  dropoff_area text,
  dropoff_target_time time,
  stop_duration_minutes integer not null default 5
    check (stop_duration_minutes between 0 and 60),
  keep_siblings_together boolean not null default true,
  source text not null default 'baseline'
    check (source in ('baseline', 'manual', 'assistant')),
  status text not null default 'draft'
    check (status in ('draft', 'confirmed')),
  revision integer not null default 1 check (revision >= 1),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, child_id, service_date),
  foreign key (organization_id, child_id)
    references public.children(organization_id, id) on delete cascade
);

create index if not exists transport_plan_days_org_month_idx
  on public.transport_plan_days(organization_id, service_date, status);
create index if not exists daily_transport_requirements_org_date_idx
  on public.daily_transport_requirements(organization_id, service_date, status);
create index if not exists daily_transport_requirements_child_date_idx
  on public.daily_transport_requirements(organization_id, child_id, service_date);

drop trigger if exists transport_plan_days_updated_at on public.transport_plan_days;
create trigger transport_plan_days_updated_at
  before update on public.transport_plan_days
  for each row execute function public.set_updated_at();

drop trigger if exists daily_transport_requirements_updated_at on public.daily_transport_requirements;
create trigger daily_transport_requirements_updated_at
  before update on public.daily_transport_requirements
  for each row execute function public.set_updated_at();

drop trigger if exists audit_transport_plan_days_after on public.transport_plan_days;
create trigger audit_transport_plan_days_after
  after insert or update or delete on public.transport_plan_days
  for each row execute function public.write_audit_log();

drop trigger if exists audit_daily_transport_requirements_after on public.daily_transport_requirements;
create trigger audit_daily_transport_requirements_after
  after insert or update or delete on public.daily_transport_requirements
  for each row execute function public.write_audit_log();

alter table public.transport_plan_days enable row level security;
alter table public.daily_transport_requirements enable row level security;

create policy transport_plan_days_select on public.transport_plan_days for select
  using (organization_id = public.current_organization_id());
create policy transport_plan_days_write on public.transport_plan_days for all
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  )
  with check (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

create policy daily_transport_requirements_select on public.daily_transport_requirements for select
  using (organization_id = public.current_organization_id());
create policy daily_transport_requirements_write on public.daily_transport_requirements for all
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  )
  with check (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

grant select, insert, update, delete on public.transport_plan_days to authenticated;
grant select, insert, update, delete on public.daily_transport_requirements to authenticated;
grant all on public.transport_plan_days, public.daily_transport_requirements to service_role;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['transport_plan_days', 'daily_transport_requirements'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;

comment on table public.daily_transport_requirements is
  'Per-child daily pickup/drop-off requirements prepared before transport runs are generated.';
comment on table public.transport_plan_days is
  'Per-day planning mode, target arrival time, confirmation state, and optimistic revision.';
