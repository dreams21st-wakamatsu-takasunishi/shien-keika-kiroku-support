-- Daily operational plans keep billing/service classification separate from
-- the record format staff should use for the child's actual day flow.

create table if not exists public.daily_child_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  child_id text not null,
  service_date date not null,
  attendance_plan text not null default '利用予定'
    check (attendance_plan in ('利用予定', '追加利用', '欠席')),
  service_category text not null default '平日'
    check (service_category in ('平日', '休日')),
  record_format text not null default '平日'
    check (record_format in ('平日', '休日')),
  day_pattern text not null default '通常'
    check (day_pattern in ('通常', '短縮授業', '午前のみ', '午後のみ', '個別')),
  has_morning_program boolean not null default false,
  has_lunch boolean not null default false,
  has_afternoon_program boolean not null default true,
  has_snack boolean not null default true,
  school_end_time time,
  arrival_time time,
  departure_time time,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, child_id)
    references public.children(organization_id, id) on delete cascade,
  unique (organization_id, child_id, service_date)
);

create index if not exists daily_child_plans_org_date_idx
  on public.daily_child_plans(organization_id, service_date, attendance_plan);
create index if not exists daily_child_plans_child_date_idx
  on public.daily_child_plans(organization_id, child_id, service_date desc);

drop trigger if exists daily_child_plans_updated_at on public.daily_child_plans;
create trigger daily_child_plans_updated_at
  before update on public.daily_child_plans
  for each row execute function public.set_updated_at();

drop trigger if exists audit_daily_child_plans_after on public.daily_child_plans;
create trigger audit_daily_child_plans_after
  after insert or update or delete on public.daily_child_plans
  for each row execute function public.write_audit_log();

alter table public.daily_child_plans enable row level security;

drop policy if exists daily_child_plans_select on public.daily_child_plans;
create policy daily_child_plans_select on public.daily_child_plans for select
  using (organization_id = public.current_organization_id());

drop policy if exists daily_child_plans_insert on public.daily_child_plans;
create policy daily_child_plans_insert on public.daily_child_plans for insert
  with check (organization_id = public.current_organization_id());

drop policy if exists daily_child_plans_update on public.daily_child_plans;
create policy daily_child_plans_update on public.daily_child_plans for update
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

drop policy if exists daily_child_plans_delete on public.daily_child_plans;
create policy daily_child_plans_delete on public.daily_child_plans for delete
  using (organization_id = public.current_organization_id());

grant select, insert, update, delete on public.daily_child_plans to authenticated;
grant all on public.daily_child_plans to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'daily_child_plans'
  ) then
    alter publication supabase_realtime add table public.daily_child_plans;
  end if;
end
$$;
