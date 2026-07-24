-- Separate authenticated accounts from the staff names recorded on support records.
-- A shared "staff" login can therefore select the actual recorder from an
-- organization-managed roster without requiring one email address per instructor.

create table if not exists public.recorder_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 100),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index if not exists recorder_profiles_active_name_idx
  on public.recorder_profiles(organization_id, lower(display_name))
  where active = true;

create index if not exists recorder_profiles_org_name_idx
  on public.recorder_profiles(organization_id, display_name)
  where active = true;

alter table public.support_records
  add column if not exists recorder_profile_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'support_records_recorder_profile_fk'
  ) then
    alter table public.support_records
      add constraint support_records_recorder_profile_fk
      foreign key (organization_id, recorder_profile_id)
      references public.recorder_profiles(organization_id, id)
      on delete restrict;
  end if;
end $$;

insert into public.recorder_profiles (organization_id, display_name, created_by)
select profile.organization_id, profile.display_name, profile.id
from public.profiles as profile
where profile.active = true
  and nullif(trim(profile.display_name), '') is not null
on conflict do nothing;

drop trigger if exists recorder_profiles_updated_at on public.recorder_profiles;
create trigger recorder_profiles_updated_at
  before update on public.recorder_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists audit_recorder_profiles_after on public.recorder_profiles;
create trigger audit_recorder_profiles_after
  after insert or update or delete on public.recorder_profiles
  for each row execute function public.write_audit_log();

alter table public.recorder_profiles enable row level security;

drop policy if exists recorder_profiles_select on public.recorder_profiles;
create policy recorder_profiles_select on public.recorder_profiles for select
  using (organization_id = public.current_organization_id());

drop policy if exists recorder_profiles_insert on public.recorder_profiles;
create policy recorder_profiles_insert on public.recorder_profiles for insert
  with check (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

drop policy if exists recorder_profiles_update on public.recorder_profiles;
create policy recorder_profiles_update on public.recorder_profiles for update
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  )
  with check (organization_id = public.current_organization_id());

grant select, insert, update on public.recorder_profiles to authenticated;
grant all on public.recorder_profiles to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'recorder_profiles'
     ) then
    alter publication supabase_realtime add table public.recorder_profiles;
  end if;
end $$;
