-- Shared morning-meeting notes with live Supabase Realtime updates.

create table if not exists public.morning_meeting_records (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_date date not null,
  content text not null default ''
    check (char_length(content) <= 20000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_by_recorder_profile_id uuid,
  updated_by_name text
    check (updated_by_name is null or char_length(trim(updated_by_name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, meeting_date),
  foreign key (organization_id, updated_by_recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete restrict
);

create or replace function public.prepare_morning_meeting_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists morning_meeting_prepare_before on public.morning_meeting_records;
create trigger morning_meeting_prepare_before
  before insert or update on public.morning_meeting_records
  for each row execute function public.prepare_morning_meeting_write();

drop trigger if exists morning_meeting_updated_at on public.morning_meeting_records;
create trigger morning_meeting_updated_at
  before update on public.morning_meeting_records
  for each row execute function public.set_updated_at();

alter table public.morning_meeting_records enable row level security;

drop policy if exists morning_meeting_select on public.morning_meeting_records;
create policy morning_meeting_select on public.morning_meeting_records for select
  using (organization_id = public.current_organization_id());

drop policy if exists morning_meeting_insert on public.morning_meeting_records;
create policy morning_meeting_insert on public.morning_meeting_records for insert
  with check (
    organization_id = public.current_organization_id()
    and (
      updated_by_recorder_profile_id is null
      or exists (
        select 1
        from public.recorder_profiles
        where organization_id = public.current_organization_id()
          and id = updated_by_recorder_profile_id
          and active = true
      )
    )
  );

drop policy if exists morning_meeting_update on public.morning_meeting_records;
create policy morning_meeting_update on public.morning_meeting_records for update
  using (organization_id = public.current_organization_id())
  with check (
    organization_id = public.current_organization_id()
    and (
      updated_by_recorder_profile_id is null
      or exists (
        select 1
        from public.recorder_profiles
        where organization_id = public.current_organization_id()
          and id = updated_by_recorder_profile_id
          and active = true
      )
    )
  );

grant select, insert, update on public.morning_meeting_records to authenticated;
grant all on public.morning_meeting_records to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'morning_meeting_records'
     ) then
    alter publication supabase_realtime add table public.morning_meeting_records;
  end if;
end $$;
