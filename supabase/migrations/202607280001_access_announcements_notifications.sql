-- Keep shared staff sessions stable, lock in-progress drafts to the selected
-- recorder profile, protect record deletion, and add organization announcements.

create or replace function public.prevent_staff_record_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is distinct from new.deleted_at
     and public.current_user_role() = 'staff' then
    raise exception using
      errcode = '42501',
      message = 'Staff members cannot delete support records.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_staff_record_deletion_before on public.support_records;
create trigger prevent_staff_record_deletion_before
  before update of deleted_at on public.support_records
  for each row execute function public.prevent_staff_record_deletion();

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
  current_row public.record_drafts%rowtype;
begin
  if p_organization_id is distinct from public.current_organization_id()
     or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Draft access denied.';
  end if;

  if nullif(trim(coalesce(p_draft_key, '')), '') is null
     or nullif(trim(coalesce(p_device_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'Draft key and device id are required.';
  end if;

  select *
  into current_row
  from public.record_drafts
  where organization_id = p_organization_id
    and user_id = auth.uid()
    and draft_key = p_draft_key
  for update;

  if found then
    if public.current_user_role() = 'staff'
       and current_row.recorder_profile_id is not null
       and p_recorder_profile_id is distinct from current_row.recorder_profile_id then
      raise exception using
        errcode = '42501',
        message = 'DRAFT_OWNED_BY_ANOTHER_RECORDER: This draft is being edited by another recorder.';
    end if;

    if current_row.device_id is not null
       and current_row.device_id <> p_device_id
       and (p_expected_revision is null or current_row.revision <> p_expected_revision) then
      raise exception using
        errcode = 'P0001',
        message = 'DRAFT_CONFLICT: This draft was updated on another device.';
    end if;

    update public.record_drafts
    set payload = p_payload,
        device_id = p_device_id,
        recorder_profile_id = coalesce(current_row.recorder_profile_id, p_recorder_profile_id),
        revision = revision + 1
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and draft_key = p_draft_key
    returning * into saved_row;

    return query select saved_row.revision, saved_row.updated_at;
    return;
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

create table if not exists public.announcements (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  title text not null check (char_length(title) between 1 and 100),
  content text not null check (char_length(content) between 1 and 2000),
  priority text not null default 'normal'
    check (priority in ('normal', 'important', 'urgent')),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_by_name text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create index if not exists announcements_org_published_idx
  on public.announcements(organization_id, published_at desc)
  where archived_at is null;

drop trigger if exists announcements_updated_at on public.announcements;
create trigger announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

alter table public.announcements enable row level security;

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select
  using (organization_id = public.current_organization_id());

drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements for insert
  with check (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

drop policy if exists announcements_update on public.announcements;
create policy announcements_update on public.announcements for update
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  )
  with check (organization_id = public.current_organization_id());

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_org_idx
  on public.push_subscriptions(organization_id, last_seen_at desc);

drop trigger if exists push_subscriptions_updated_at on public.push_subscriptions;
create trigger push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select
  using (organization_id = public.current_organization_id() and user_id = auth.uid());

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions for insert
  with check (
    organization_id = public.current_organization_id()
    and user_id = auth.uid()
  );

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions for update
  using (organization_id = public.current_organization_id() and user_id = auth.uid())
  with check (organization_id = public.current_organization_id() and user_id = auth.uid());

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions for delete
  using (organization_id = public.current_organization_id() and user_id = auth.uid());

grant select, insert, update on public.announcements to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.announcements, public.push_subscriptions to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'announcements'
     ) then
    alter publication supabase_realtime add table public.announcements;
  end if;
end $$;
