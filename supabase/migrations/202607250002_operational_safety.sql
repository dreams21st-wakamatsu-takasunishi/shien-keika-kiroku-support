-- Operational safety for shared staff accounts and tablet use.
-- Adds protected recorder PINs, conflict-aware draft sessions, record revision
-- history, and organization-wide handover items.

alter table public.recorder_profiles
  add column if not exists pin_hash text,
  add column if not exists pin_configured boolean not null default false;

create or replace function public.set_recorder_pin(
  p_organization_id uuid,
  p_recorder_profile_id uuid,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_organization_id is distinct from public.current_organization_id()
     or public.current_user_role() not in ('manager', 'admin') then
    raise exception using errcode = '42501', message = 'Recorder PIN settings require manager access.';
  end if;

  if coalesce(p_pin, '') = '' then
    update public.recorder_profiles
    set pin_hash = null, pin_configured = false
    where organization_id = p_organization_id
      and id = p_recorder_profile_id;
    return;
  end if;

  if p_pin !~ '^[0-9]{4,8}$' then
    raise exception using errcode = '22023', message = 'PIN must contain 4 to 8 digits.';
  end if;

  update public.recorder_profiles
  set pin_hash = crypt(p_pin, gen_salt('bf')), pin_configured = true
  where organization_id = p_organization_id
    and id = p_recorder_profile_id
    and active = true;

  if not found then
    raise exception using errcode = 'P0002', message = 'Active recorder profile was not found.';
  end if;
end;
$$;

create or replace function public.verify_recorder_pin(
  p_organization_id uuid,
  p_recorder_profile_id uuid,
  p_pin text
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.recorder_profiles
    where organization_id = p_organization_id
      and organization_id = public.current_organization_id()
      and id = p_recorder_profile_id
      and active = true
      and (
        pin_configured = false
        or pin_hash = crypt(coalesce(p_pin, ''), pin_hash)
      )
  )
$$;

revoke all on function public.set_recorder_pin(uuid, uuid, text) from public;
revoke all on function public.verify_recorder_pin(uuid, uuid, text) from public;
grant execute on function public.set_recorder_pin(uuid, uuid, text) to authenticated;
grant execute on function public.verify_recorder_pin(uuid, uuid, text) to authenticated;

-- A short PIN must never be exposed, even as a hash, because shared staff
-- accounts can read the recorder roster.
revoke select on public.recorder_profiles from authenticated;
grant select (
  id,
  organization_id,
  display_name,
  active,
  created_by,
  created_at,
  updated_at,
  pin_configured
) on public.recorder_profiles to authenticated;

alter table public.record_drafts
  add column if not exists recorder_profile_id uuid,
  add column if not exists device_id text,
  add column if not exists revision bigint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'record_drafts_recorder_profile_fk'
  ) then
    alter table public.record_drafts
      add constraint record_drafts_recorder_profile_fk
      foreign key (organization_id, recorder_profile_id)
      references public.recorder_profiles(organization_id, id)
      on delete restrict;
  end if;
end $$;

create index if not exists record_drafts_org_updated_idx
  on public.record_drafts(organization_id, updated_at desc);

create or replace function public.save_record_draft_guarded(
  p_organization_id uuid,
  p_draft_key text,
  p_payload jsonb,
  p_device_id text,
  p_expected_revision bigint default null,
  p_recorder_profile_id uuid default null
)
returns table(new_revision bigint, saved_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_row public.record_drafts%rowtype;
begin
  if p_organization_id is distinct from public.current_organization_id()
     or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Draft access denied.';
  end if;

  if nullif(trim(coalesce(p_draft_key, '')), '') is null
     or nullif(trim(coalesce(p_device_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'Draft key and device id are required.';
  end if;

  update public.record_drafts
  set payload = p_payload,
      device_id = p_device_id,
      recorder_profile_id = p_recorder_profile_id,
      revision = revision + 1
  where organization_id = p_organization_id
    and user_id = auth.uid()
    and draft_key = p_draft_key
    and (
      device_id is null
      or device_id = p_device_id
      or (p_expected_revision is not null and revision = p_expected_revision)
    )
  returning * into saved_row;

  if found then
    return query select saved_row.revision, saved_row.updated_at;
    return;
  end if;

  if exists (
    select 1
    from public.record_drafts
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and draft_key = p_draft_key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'DRAFT_CONFLICT: This draft was updated on another device.';
  end if;

  insert into public.record_drafts (
    organization_id,
    user_id,
    draft_key,
    payload,
    device_id,
    recorder_profile_id,
    revision
  ) values (
    p_organization_id,
    auth.uid(),
    p_draft_key,
    p_payload,
    p_device_id,
    p_recorder_profile_id,
    1
  )
  returning * into saved_row;

  return query select saved_row.revision, saved_row.updated_at;
end;
$$;

revoke all on function public.save_record_draft_guarded(uuid, text, jsonb, text, bigint, uuid) from public;
grant execute on function public.save_record_draft_guarded(uuid, text, jsonb, text, bigint, uuid) to authenticated;

alter table public.support_records
  add column if not exists review_issues jsonb not null default '[]'::jsonb;

create table if not exists public.record_revisions (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  record_id text not null,
  version integer not null,
  changed_by uuid references public.profiles(id) on delete set null,
  snapshot jsonb not null,
  changed_at timestamptz not null default now()
);

create index if not exists record_revisions_record_idx
  on public.record_revisions(organization_id, record_id, changed_at desc);

create or replace function public.capture_support_record_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.record_revisions(
    organization_id,
    record_id,
    version,
    changed_by,
    snapshot
  ) values (
    old.organization_id,
    old.id,
    old.version,
    auth.uid(),
    to_jsonb(old)
  );
  return new;
end;
$$;

drop trigger if exists capture_support_record_revision_before on public.support_records;
create trigger capture_support_record_revision_before
  before update on public.support_records
  for each row execute function public.capture_support_record_revision();

alter table public.record_revisions enable row level security;

drop policy if exists record_revisions_select on public.record_revisions;
create policy record_revisions_select on public.record_revisions for select
  using (organization_id = public.current_organization_id());

grant select on public.record_revisions to authenticated;
grant all on public.record_revisions to service_role;
grant usage, select on sequence public.record_revisions_id_seq to authenticated, service_role;

create table if not exists public.handover_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  child_id text,
  category text not null default '申し送り'
    check (category in ('申し送り', '保護者連絡', 'けが・事故', '次回確認', 'その他')),
  content text not null check (char_length(trim(content)) between 1 and 4000),
  priority text not null default '通常'
    check (priority in ('通常', '重要', '緊急')),
  status text not null default '未対応'
    check (status in ('未対応', '対応中', '完了')),
  due_date date,
  assignee text,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_recorder_profile_id uuid,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, child_id)
    references public.children(organization_id, id) on delete restrict,
  foreign key (organization_id, created_by_recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete restrict
);

create index if not exists handover_items_open_idx
  on public.handover_items(organization_id, status, priority, due_date, created_at desc);

create or replace function public.prepare_handover_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  if new.status = '完了' then
    new.resolved_by := coalesce(new.resolved_by, auth.uid());
    new.resolved_at := coalesce(new.resolved_at, now());
  else
    new.resolved_by := null;
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists handover_items_prepare_before on public.handover_items;
create trigger handover_items_prepare_before
  before insert or update on public.handover_items
  for each row execute function public.prepare_handover_write();

drop trigger if exists handover_items_updated_at on public.handover_items;
create trigger handover_items_updated_at
  before update on public.handover_items
  for each row execute function public.set_updated_at();

drop trigger if exists audit_handover_items_after on public.handover_items;
create trigger audit_handover_items_after
  after insert or update or delete on public.handover_items
  for each row execute function public.write_audit_log();

alter table public.handover_items enable row level security;

drop policy if exists handover_items_select on public.handover_items;
create policy handover_items_select on public.handover_items for select
  using (organization_id = public.current_organization_id());

drop policy if exists handover_items_insert on public.handover_items;
create policy handover_items_insert on public.handover_items for insert
  with check (
    organization_id = public.current_organization_id()
    and (
      created_by_recorder_profile_id is null
      or exists (
        select 1 from public.recorder_profiles
        where organization_id = public.current_organization_id()
          and id = created_by_recorder_profile_id
          and active = true
      )
    )
  );

drop policy if exists handover_items_update on public.handover_items;
create policy handover_items_update on public.handover_items for update
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

drop policy if exists handover_items_delete on public.handover_items;
create policy handover_items_delete on public.handover_items for delete
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

grant select, insert, update, delete on public.handover_items to authenticated;
grant all on public.handover_items to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'record_drafts'
    ) then
      alter publication supabase_realtime add table public.record_drafts;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'handover_items'
    ) then
      alter publication supabase_realtime add table public.handover_items;
    end if;
  end if;
end $$;
