-- Daily staff movement schedules. Managers maintain the schedule while every
-- authenticated member of the organization can view it in real time.

create table if not exists public.staff_schedule_items (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  recorder_profile_id uuid not null,
  service_date date not null,
  start_time time not null,
  end_time time not null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  category text not null
    check (category in ('送迎', '支援', '休憩', '会議', '事務', '外出', 'その他')),
  location text
    check (location is null or char_length(trim(location)) <= 120),
  child_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(child_ids) = 'array'),
  note text
    check (note is null or char_length(note) <= 2000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete restrict,
  check (start_time < end_time)
);

create index if not exists staff_schedule_items_org_date_idx
  on public.staff_schedule_items(organization_id, service_date, start_time);

create index if not exists staff_schedule_items_recorder_date_idx
  on public.staff_schedule_items(organization_id, recorder_profile_id, service_date);

create or replace function public.prepare_staff_schedule_item_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists staff_schedule_items_prepare_before on public.staff_schedule_items;
create trigger staff_schedule_items_prepare_before
  before insert on public.staff_schedule_items
  for each row execute function public.prepare_staff_schedule_item_write();

drop trigger if exists staff_schedule_items_updated_at on public.staff_schedule_items;
create trigger staff_schedule_items_updated_at
  before update on public.staff_schedule_items
  for each row execute function public.set_updated_at();

alter table public.staff_schedule_items enable row level security;

drop policy if exists staff_schedule_items_select on public.staff_schedule_items;
create policy staff_schedule_items_select on public.staff_schedule_items for select
  using (organization_id = public.current_organization_id());

drop policy if exists staff_schedule_items_insert on public.staff_schedule_items;
create policy staff_schedule_items_insert on public.staff_schedule_items for insert
  with check (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

drop policy if exists staff_schedule_items_update on public.staff_schedule_items;
create policy staff_schedule_items_update on public.staff_schedule_items for update
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  )
  with check (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

drop policy if exists staff_schedule_items_delete on public.staff_schedule_items;
create policy staff_schedule_items_delete on public.staff_schedule_items for delete
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

grant select on public.staff_schedule_items to authenticated;
grant insert, update, delete on public.staff_schedule_items to authenticated;
grant all on public.staff_schedule_items to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'staff_schedule_items'
     ) then
    alter publication supabase_realtime add table public.staff_schedule_items;
  end if;
end $$;
