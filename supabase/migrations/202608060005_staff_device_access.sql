-- Staged device approval and personal-device access controls.
-- All controls default to off so existing shared/tablet operations continue.

alter table public.organizations
  add column if not exists device_approval_enabled boolean not null default false,
  add column if not exists personal_access_time_enabled boolean not null default false,
  add column if not exists personal_access_start time not null default '07:00',
  add column if not exists personal_access_end time not null default '22:00',
  add column if not exists personal_access_days smallint[] not null default array[1,2,3,4,5,6,7]::smallint[],
  add column if not exists default_personal_field_mode boolean not null default true,
  add column if not exists shared_staff_login_allowed boolean not null default true;

alter table public.organizations
  drop constraint if exists organizations_personal_access_days_valid;
alter table public.organizations
  add constraint organizations_personal_access_days_valid
  check (
    cardinality(personal_access_days) between 1 and 7
    and personal_access_days <@ array[1,2,3,4,5,6,7]::smallint[]
  );

create table if not exists public.staff_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recorder_profile_id uuid not null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  label text not null check (char_length(trim(label)) between 1 and 160),
  platform text,
  device_kind text not null default 'personal' check (device_kind in ('managed', 'personal')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  field_mode_only boolean not null default true,
  requested_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete cascade,
  unique (auth_user_id, token_hash)
);

create index if not exists staff_devices_org_status_idx
  on public.staff_devices(organization_id, status, requested_at desc);
create index if not exists staff_devices_recorder_idx
  on public.staff_devices(organization_id, recorder_profile_id, status);

drop trigger if exists staff_devices_updated_at on public.staff_devices;
create trigger staff_devices_updated_at
  before update on public.staff_devices
  for each row execute function public.set_updated_at();

drop trigger if exists audit_staff_devices_after on public.staff_devices;
drop trigger if exists audit_staff_devices_insert_delete on public.staff_devices;
drop trigger if exists audit_staff_devices_security_update on public.staff_devices;
create trigger audit_staff_devices_insert_delete
  after insert or delete on public.staff_devices
  for each row execute function public.write_audit_log();
create trigger audit_staff_devices_security_update
  after update of status, device_kind, field_mode_only on public.staff_devices
  for each row execute function public.write_audit_log();

alter table public.staff_devices enable row level security;

drop policy if exists staff_devices_select on public.staff_devices;
create policy staff_devices_select on public.staff_devices for select
  using (
    organization_id = public.current_organization_id()
    and (
      auth_user_id = auth.uid()
      or public.current_user_role() in ('manager', 'admin')
    )
  );

grant select on public.staff_devices to authenticated;
grant all on public.staff_devices to service_role;

-- Shared staff accounts can be retired after all instructors have individual
-- IDs. The default remains true to avoid interrupting current operations.
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select profile.organization_id
  from public.profiles as profile
  join public.organizations as organization on organization.id = profile.organization_id
  where profile.id = auth.uid()
    and profile.active = true
    and (
      profile.role <> 'staff'
      or organization.shared_staff_login_allowed = true
      or exists (
        select 1
        from public.recorder_profiles as recorder
        where recorder.organization_id = profile.organization_id
          and recorder.auth_user_id = profile.id
          and recorder.active = true
          and recorder.individual_login_enabled = true
      )
    )
$$;

create or replace function public.get_current_staff_device_access(p_device_token text)
returns table(
  access_allowed boolean,
  access_reason text,
  device_id uuid,
  device_status text,
  field_mode_only boolean,
  device_approval_enabled boolean,
  access_time_restricted boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_profile public.profiles%rowtype;
  current_organization public.organizations%rowtype;
  linked_recorder public.recorder_profiles%rowtype;
  current_device public.staff_devices%rowtype;
  token_digest text;
  local_now timestamp;
  local_day smallint;
  local_time time;
  within_time boolean := true;
begin
  select * into current_profile
  from public.profiles
  where id = auth.uid() and active = true;

  if current_profile.id is null then
    return query select false, '利用可能な職員アカウントが見つかりません。', null::uuid, null::text, false, false, false;
    return;
  end if;

  select * into current_organization
  from public.organizations
  where id = current_profile.organization_id;

  select * into linked_recorder
  from public.recorder_profiles
  where organization_id = current_profile.organization_id
    and auth_user_id = current_profile.id
    and active = true
    and individual_login_enabled = true
  limit 1;

  if current_profile.role <> 'staff' then
    return query select true, null::text, null::uuid, 'approved'::text, false,
      current_organization.device_approval_enabled,
      current_organization.personal_access_time_enabled;
    return;
  end if;

  if linked_recorder.id is null then
    return query select
      current_organization.shared_staff_login_allowed,
      case when current_organization.shared_staff_login_allowed then null::text else '共有の指導員ログインは利用停止されています。' end,
      null::uuid,
      case when current_organization.shared_staff_login_allowed then 'approved'::text else 'revoked'::text end,
      false,
      current_organization.device_approval_enabled,
      current_organization.personal_access_time_enabled;
    return;
  end if;

  if coalesce(p_device_token, '') !~ '^[A-Fa-f0-9]{64}$' then
    return query select false, 'この端末を識別できません。ログインし直してください。', null::uuid, 'pending'::text, true,
      current_organization.device_approval_enabled,
      current_organization.personal_access_time_enabled;
    return;
  end if;

  token_digest := encode(digest(p_device_token, 'sha256'), 'hex');
  select * into current_device
  from public.staff_devices
  where organization_id = current_profile.organization_id
    and auth_user_id = current_profile.id
    and token_hash = token_digest
  limit 1;

  if current_device.id is null then
    if current_organization.device_approval_enabled then
      return query select false, 'この端末は未登録です。ログインし直して利用申請を送信してください。', null::uuid, 'pending'::text, true,
        true,
        current_organization.personal_access_time_enabled;
    else
      return query select true, null::text, null::uuid, 'approved'::text, false,
        false,
        current_organization.personal_access_time_enabled;
    end if;
    return;
  end if;

  update public.staff_devices
  set last_seen_at = now()
  where id = current_device.id
    and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');

  if current_organization.device_approval_enabled and current_device.status <> 'approved' then
    return query select false,
      case current_device.status
        when 'revoked' then 'この端末の利用許可は取り消されています。'
        else 'この端末は管理者の承認待ちです。'
      end,
      current_device.id,
      current_device.status,
      current_device.field_mode_only,
      true,
      current_organization.personal_access_time_enabled;
    return;
  end if;

  if current_organization.personal_access_time_enabled and current_device.device_kind = 'personal' then
    local_now := now() at time zone 'Asia/Tokyo';
    local_day := extract(isodow from local_now)::smallint;
    local_time := local_now::time;
    if current_organization.personal_access_start <= current_organization.personal_access_end then
      within_time := local_time >= current_organization.personal_access_start
        and local_time <= current_organization.personal_access_end;
    else
      within_time := local_time >= current_organization.personal_access_start
        or local_time <= current_organization.personal_access_end;
    end if;
    within_time := within_time and local_day = any(current_organization.personal_access_days);
  end if;

  return query select
    within_time,
    case when within_time then null::text else '現在は個人端末から利用できる時間外です。' end,
    current_device.id,
    current_device.status,
    current_device.field_mode_only,
    current_organization.device_approval_enabled,
    current_organization.personal_access_time_enabled;
end;
$$;

create or replace function public.update_staff_device_policy(
  p_device_approval_enabled boolean,
  p_personal_access_time_enabled boolean,
  p_personal_access_start time,
  p_personal_access_end time,
  p_personal_access_days smallint[],
  p_default_personal_field_mode boolean,
  p_shared_staff_login_allowed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() not in ('manager', 'admin') then
    raise exception using errcode = '42501', message = 'Manager access is required.';
  end if;
  if cardinality(p_personal_access_days) not between 1 and 7
     or not (p_personal_access_days <@ array[1,2,3,4,5,6,7]::smallint[]) then
    raise exception using errcode = '22023', message = 'Access weekdays are invalid.';
  end if;

  update public.organizations
  set device_approval_enabled = p_device_approval_enabled,
      personal_access_time_enabled = p_personal_access_time_enabled,
      personal_access_start = p_personal_access_start,
      personal_access_end = p_personal_access_end,
      personal_access_days = p_personal_access_days,
      default_personal_field_mode = p_default_personal_field_mode,
      shared_staff_login_allowed = p_shared_staff_login_allowed
  where id = public.current_organization_id();
end;
$$;

create or replace function public.review_staff_device(
  p_device_id uuid,
  p_action text,
  p_field_mode_only boolean default true,
  p_device_kind text default 'personal'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() not in ('manager', 'admin') then
    raise exception using errcode = '42501', message = 'Manager access is required.';
  end if;
  if p_action not in ('approve', 'revoke') then
    raise exception using errcode = '22023', message = 'Device review action is invalid.';
  end if;
  if p_device_kind not in ('managed', 'personal') then
    raise exception using errcode = '22023', message = 'Device kind is invalid.';
  end if;

  update public.staff_devices
  set status = case when p_action = 'approve' then 'approved' else 'revoked' end,
      field_mode_only = p_field_mode_only,
      device_kind = p_device_kind,
      approved_by = case when p_action = 'approve' then auth.uid() else approved_by end,
      approved_at = case when p_action = 'approve' then now() else approved_at end,
      revoked_by = case when p_action = 'revoke' then auth.uid() else null end,
      revoked_at = case when p_action = 'revoke' then now() else null end
  where id = p_device_id
    and organization_id = public.current_organization_id();

  if not found then
    raise exception using errcode = 'P0002', message = 'Device was not found.';
  end if;
end;
$$;

revoke all on function public.get_current_staff_device_access(text) from public;
revoke all on function public.update_staff_device_policy(boolean, boolean, time, time, smallint[], boolean, boolean) from public;
revoke all on function public.review_staff_device(uuid, text, boolean, text) from public;
grant execute on function public.get_current_staff_device_access(text) to authenticated;
grant execute on function public.update_staff_device_policy(boolean, boolean, time, time, smallint[], boolean, boolean) to authenticated;
grant execute on function public.review_staff_device(uuid, text, boolean, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'staff_devices'
     ) then
    alter publication supabase_realtime add table public.staff_devices;
  end if;
end $$;
