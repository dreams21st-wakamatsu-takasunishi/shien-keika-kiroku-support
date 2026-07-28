-- Allow authenticated staff to publish announcements and track per-user or
-- per-recorder read/confirmed status, including derived correction notices.

alter table public.announcements
  add column if not exists created_by_recorder_profile_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'announcements_created_by_recorder_profile_fk'
  ) then
    alter table public.announcements
      add constraint announcements_created_by_recorder_profile_fk
      foreign key (organization_id, created_by_recorder_profile_id)
      references public.recorder_profiles(organization_id, id)
      on delete set null;
  end if;
end $$;

drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements for insert
  with check (
    organization_id = public.current_organization_id()
    and (
      public.current_user_role() in ('manager', 'admin')
      or (
        public.current_user_role() = 'staff'
        and created_by_recorder_profile_id is not null
        and exists (
          select 1
          from public.recorder_profiles
          where organization_id = public.current_organization_id()
            and id = created_by_recorder_profile_id
            and active = true
        )
      )
    )
  );

create table if not exists public.announcement_confirmations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  announcement_id text not null check (char_length(trim(announcement_id)) between 1 and 240),
  confirmer_key text not null check (char_length(confirmer_key) between 6 and 80),
  user_id uuid references public.profiles(id) on delete cascade,
  recorder_profile_id uuid,
  confirmer_name text not null check (char_length(trim(confirmer_name)) between 1 and 100),
  read_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, announcement_id, confirmer_key),
  foreign key (organization_id, recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete cascade,
  check (
    (recorder_profile_id is not null and user_id is null
      and confirmer_key = 'recorder:' || recorder_profile_id::text)
    or
    (recorder_profile_id is null and user_id is not null
      and confirmer_key = 'user:' || user_id::text)
  )
);

create index if not exists announcement_confirmations_lookup_idx
  on public.announcement_confirmations(organization_id, announcement_id, confirmed_at desc);

drop trigger if exists announcement_confirmations_updated_at on public.announcement_confirmations;
create trigger announcement_confirmations_updated_at
  before update on public.announcement_confirmations
  for each row execute function public.set_updated_at();

alter table public.announcement_confirmations enable row level security;

drop policy if exists announcement_confirmations_select on public.announcement_confirmations;
create policy announcement_confirmations_select on public.announcement_confirmations for select
  using (organization_id = public.current_organization_id());

drop policy if exists announcement_confirmations_insert on public.announcement_confirmations;
create policy announcement_confirmations_insert on public.announcement_confirmations for insert
  with check (
    organization_id = public.current_organization_id()
    and (
      (user_id = auth.uid() and recorder_profile_id is null)
      or exists (
        select 1
        from public.recorder_profiles
        where organization_id = public.current_organization_id()
          and id = recorder_profile_id
          and active = true
      )
    )
  );

drop policy if exists announcement_confirmations_update on public.announcement_confirmations;
create policy announcement_confirmations_update on public.announcement_confirmations for update
  using (organization_id = public.current_organization_id())
  with check (
    organization_id = public.current_organization_id()
    and (
      (user_id = auth.uid() and recorder_profile_id is null)
      or exists (
        select 1
        from public.recorder_profiles
        where organization_id = public.current_organization_id()
          and id = recorder_profile_id
          and active = true
      )
    )
  );

grant select, insert, update on public.announcement_confirmations to authenticated;
grant all on public.announcement_confirmations to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'announcement_confirmations'
     ) then
    alter publication supabase_realtime add table public.announcement_confirmations;
  end if;
end $$;
