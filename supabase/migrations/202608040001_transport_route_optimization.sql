-- Google Routes API route optimization settings and privacy-conscious usage logs.

alter table public.transport_runs
  add column if not exists route_origin text,
  add column if not exists route_destination text,
  add column if not exists route_optimized_at timestamptz;

create table if not exists public.transport_route_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null default 'default' check (id = 'default'),
  facility_address text not null default '',
  stop_duration_minutes integer not null default 5 check (stop_duration_minutes between 0 and 30),
  avoid_tolls boolean not null default false,
  avoid_highways boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create table if not exists public.route_optimization_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  transport_run_id text,
  provider text not null default 'google_routes',
  stops_count integer not null default 0,
  distance_meters integer,
  duration_seconds integer,
  status text not null check (status in ('success', 'error')),
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists route_optimization_logs_org_created_idx
  on public.route_optimization_logs(organization_id, created_at desc);

drop trigger if exists transport_route_settings_updated_at on public.transport_route_settings;
create trigger transport_route_settings_updated_at
  before update on public.transport_route_settings
  for each row execute function public.set_updated_at();

drop trigger if exists audit_transport_route_settings_after on public.transport_route_settings;
create trigger audit_transport_route_settings_after
  after insert or update or delete on public.transport_route_settings
  for each row execute function public.write_audit_log();

alter table public.transport_route_settings enable row level security;
alter table public.route_optimization_logs enable row level security;

create policy transport_route_settings_select on public.transport_route_settings for select
  using (organization_id = public.current_organization_id());
create policy transport_route_settings_write on public.transport_route_settings for all
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  )
  with check (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

create policy route_optimization_logs_select on public.route_optimization_logs for select
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

grant select, insert, update, delete on public.transport_route_settings to authenticated;
grant select on public.route_optimization_logs to authenticated;
grant all on public.route_optimization_logs to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'transport_route_settings'
     ) then
    alter publication supabase_realtime add table public.transport_route_settings;
  end if;
end $$;
