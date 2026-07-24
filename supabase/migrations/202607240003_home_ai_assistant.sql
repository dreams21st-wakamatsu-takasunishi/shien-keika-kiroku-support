-- Home AI assistant: auditable proposals and effective-dated regular-use schedules.

alter table public.children
  add column if not exists regular_days_effective_from date not null default current_date;

create table if not exists public.assistant_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  child_id text not null,
  requested_by uuid references public.profiles(id) on delete set null,
  instruction text not null,
  action_type text not null check (action_type in ('schedule_regular_days')),
  proposal jsonb not null default '{}'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed', 'executed', 'cancelled', 'failed')),
  result_message text,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, child_id)
    references public.children(organization_id, id) on delete restrict
);

create index if not exists assistant_actions_org_created_idx
  on public.assistant_actions(organization_id, created_at desc);

create table if not exists public.child_regular_day_schedules (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  child_id text not null,
  effective_from date not null,
  regular_days text[] not null default '{}',
  source_action_id uuid unique references public.assistant_actions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, child_id, effective_from),
  foreign key (organization_id, child_id)
    references public.children(organization_id, id) on delete cascade,
  check (regular_days <@ array['月', '火', '水', '木', '金', '土', '日']::text[])
);

create index if not exists child_regular_day_schedules_lookup_idx
  on public.child_regular_day_schedules(organization_id, child_id, effective_from desc);

drop trigger if exists assistant_actions_updated_at on public.assistant_actions;
create trigger assistant_actions_updated_at
  before update on public.assistant_actions
  for each row execute function public.set_updated_at();

drop trigger if exists child_regular_day_schedules_updated_at on public.child_regular_day_schedules;
create trigger child_regular_day_schedules_updated_at
  before update on public.child_regular_day_schedules
  for each row execute function public.set_updated_at();

alter table public.assistant_actions enable row level security;
alter table public.child_regular_day_schedules enable row level security;

drop policy if exists assistant_actions_select on public.assistant_actions;
create policy assistant_actions_select on public.assistant_actions for select
  using (
    organization_id = public.current_organization_id()
    and (
      requested_by = auth.uid()
      or public.current_user_role() in ('manager', 'admin')
    )
  );

drop policy if exists regular_day_schedules_select on public.child_regular_day_schedules;
create policy regular_day_schedules_select on public.child_regular_day_schedules for select
  using (organization_id = public.current_organization_id());

grant select on public.assistant_actions, public.child_regular_day_schedules to authenticated;
grant all on public.assistant_actions, public.child_regular_day_schedules to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'child_regular_day_schedules'
     ) then
    alter publication supabase_realtime add table public.child_regular_day_schedules;
  end if;
end $$;
