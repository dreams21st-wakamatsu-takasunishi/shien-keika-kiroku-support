-- Reusable morning-meeting templates and durable read confirmations.

create table if not exists public.morning_meeting_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  content text not null default '' check (char_length(content) between 1 and 20000),
  created_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index if not exists morning_meeting_templates_active_name_idx
  on public.morning_meeting_templates(organization_id, lower(name))
  where archived_at is null;

create index if not exists morning_meeting_templates_org_idx
  on public.morning_meeting_templates(organization_id, updated_at desc)
  where archived_at is null;

create or replace function public.prepare_morning_meeting_template_write()
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

drop trigger if exists morning_meeting_templates_prepare_before on public.morning_meeting_templates;
create trigger morning_meeting_templates_prepare_before
  before insert or update on public.morning_meeting_templates
  for each row execute function public.prepare_morning_meeting_template_write();

drop trigger if exists morning_meeting_templates_updated_at on public.morning_meeting_templates;
create trigger morning_meeting_templates_updated_at
  before update on public.morning_meeting_templates
  for each row execute function public.set_updated_at();

drop trigger if exists audit_morning_meeting_templates_after on public.morning_meeting_templates;
create trigger audit_morning_meeting_templates_after
  after insert or update or delete on public.morning_meeting_templates
  for each row execute function public.write_audit_log();

alter table public.morning_meeting_templates enable row level security;

drop policy if exists morning_meeting_templates_select on public.morning_meeting_templates;
create policy morning_meeting_templates_select on public.morning_meeting_templates for select
  using (organization_id = public.current_organization_id());

drop policy if exists morning_meeting_templates_insert on public.morning_meeting_templates;
create policy morning_meeting_templates_insert on public.morning_meeting_templates for insert
  with check (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

drop policy if exists morning_meeting_templates_update on public.morning_meeting_templates;
create policy morning_meeting_templates_update on public.morning_meeting_templates for update
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  )
  with check (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

grant select, insert, update on public.morning_meeting_templates to authenticated;
grant all on public.morning_meeting_templates to service_role;

create table if not exists public.morning_meeting_confirmations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_date date not null,
  confirmer_key text not null check (char_length(confirmer_key) between 6 and 80),
  user_id uuid references public.profiles(id) on delete cascade,
  recorder_profile_id uuid,
  confirmer_name text not null check (char_length(trim(confirmer_name)) between 1 and 100),
  confirmed_at timestamptz not null default now(),
  unique (organization_id, meeting_date, confirmer_key),
  foreign key (organization_id, meeting_date)
    references public.morning_meeting_records(organization_id, meeting_date) on delete cascade,
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

create index if not exists morning_meeting_confirmations_date_idx
  on public.morning_meeting_confirmations(organization_id, meeting_date, confirmed_at desc);

alter table public.morning_meeting_confirmations enable row level security;

drop policy if exists morning_meeting_confirmations_select on public.morning_meeting_confirmations;
create policy morning_meeting_confirmations_select on public.morning_meeting_confirmations for select
  using (organization_id = public.current_organization_id());

drop policy if exists morning_meeting_confirmations_insert on public.morning_meeting_confirmations;
create policy morning_meeting_confirmations_insert on public.morning_meeting_confirmations for insert
  with check (
    organization_id = public.current_organization_id()
    and (
      (user_id = auth.uid() and recorder_profile_id is null)
      or exists (
        select 1 from public.recorder_profiles
        where organization_id = public.current_organization_id()
          and id = recorder_profile_id
          and active = true
      )
    )
  );

drop policy if exists morning_meeting_confirmations_update on public.morning_meeting_confirmations;
create policy morning_meeting_confirmations_update on public.morning_meeting_confirmations for update
  using (organization_id = public.current_organization_id())
  with check (
    organization_id = public.current_organization_id()
    and (
      (user_id = auth.uid() and recorder_profile_id is null)
      or exists (
        select 1 from public.recorder_profiles
        where organization_id = public.current_organization_id()
          and id = recorder_profile_id
          and active = true
      )
    )
  );

drop policy if exists morning_meeting_confirmations_delete on public.morning_meeting_confirmations;
create policy morning_meeting_confirmations_delete on public.morning_meeting_confirmations for delete
  using (
    organization_id = public.current_organization_id()
    and (
      user_id = auth.uid()
      or recorder_profile_id is not null
      or public.current_user_role() in ('manager', 'admin')
    )
  );

grant select, insert, update, delete on public.morning_meeting_confirmations to authenticated;
grant all on public.morning_meeting_confirmations to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'handover_items_organization_id_id_key'
  ) then
    alter table public.handover_items
      add constraint handover_items_organization_id_id_key unique (organization_id, id);
  end if;
end $$;

create table if not exists public.handover_confirmations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  handover_item_id uuid not null,
  confirmer_key text not null check (char_length(confirmer_key) between 6 and 80),
  user_id uuid references public.profiles(id) on delete cascade,
  recorder_profile_id uuid,
  confirmer_name text not null check (char_length(trim(confirmer_name)) between 1 and 100),
  confirmed_at timestamptz not null default now(),
  unique (organization_id, handover_item_id, confirmer_key),
  foreign key (organization_id, handover_item_id)
    references public.handover_items(organization_id, id) on delete cascade,
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

create index if not exists handover_confirmations_item_idx
  on public.handover_confirmations(organization_id, handover_item_id, confirmed_at desc);

alter table public.handover_confirmations enable row level security;

drop policy if exists handover_confirmations_select on public.handover_confirmations;
create policy handover_confirmations_select on public.handover_confirmations for select
  using (organization_id = public.current_organization_id());

drop policy if exists handover_confirmations_insert on public.handover_confirmations;
create policy handover_confirmations_insert on public.handover_confirmations for insert
  with check (
    organization_id = public.current_organization_id()
    and (
      (user_id = auth.uid() and recorder_profile_id is null)
      or exists (
        select 1 from public.recorder_profiles
        where organization_id = public.current_organization_id()
          and id = recorder_profile_id
          and active = true
      )
    )
  );

drop policy if exists handover_confirmations_update on public.handover_confirmations;
create policy handover_confirmations_update on public.handover_confirmations for update
  using (organization_id = public.current_organization_id())
  with check (
    organization_id = public.current_organization_id()
    and (
      (user_id = auth.uid() and recorder_profile_id is null)
      or exists (
        select 1 from public.recorder_profiles
        where organization_id = public.current_organization_id()
          and id = recorder_profile_id
          and active = true
      )
    )
  );

drop policy if exists handover_confirmations_delete on public.handover_confirmations;
create policy handover_confirmations_delete on public.handover_confirmations for delete
  using (
    organization_id = public.current_organization_id()
    and (
      user_id = auth.uid()
      or recorder_profile_id is not null
      or public.current_user_role() in ('manager', 'admin')
    )
  );

grant select, insert, update, delete on public.handover_confirmations to authenticated;
grant all on public.handover_confirmations to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'morning_meeting_templates'
    ) then
      alter publication supabase_realtime add table public.morning_meeting_templates;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'morning_meeting_confirmations'
    ) then
      alter publication supabase_realtime add table public.morning_meeting_confirmations;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'handover_confirmations'
    ) then
      alter publication supabase_realtime add table public.handover_confirmations;
    end if;
  end if;
end $$;
