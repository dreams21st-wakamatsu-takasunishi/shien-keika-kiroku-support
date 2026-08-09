-- Split physical device approval from staff identity and add a transport-only
-- field workflow for personal devices. Existing staff_devices rows are kept as
-- a rollback reference and migrated into organization_devices.

create table if not exists public.organization_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token_hash text not null,
  label text not null check (char_length(trim(label)) between 1 and 160),
  platform text,
  device_kind text not null default 'personal'
    check (device_kind in ('facility_shared', 'personal')),
  owner_recorder_profile_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'revoked')),
  transport_mode_only boolean not null default true,
  requested_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, owner_recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete cascade,
  unique (organization_id, token_hash),
  check (
    (device_kind = 'personal' and owner_recorder_profile_id is not null and transport_mode_only)
    or (device_kind = 'facility_shared' and owner_recorder_profile_id is null and not transport_mode_only)
  )
);

create index if not exists organization_devices_org_status_idx
  on public.organization_devices(organization_id, status, requested_at desc);
create index if not exists organization_devices_owner_idx
  on public.organization_devices(organization_id, owner_recorder_profile_id, status);

drop trigger if exists organization_devices_updated_at on public.organization_devices;
create trigger organization_devices_updated_at
  before update on public.organization_devices
  for each row execute function public.set_updated_at();

drop trigger if exists audit_organization_devices_after on public.organization_devices;
create trigger audit_organization_devices_after
  after insert or update or delete on public.organization_devices
  for each row execute function public.write_audit_log();

alter table public.organization_devices enable row level security;

drop policy if exists organization_devices_select on public.organization_devices;
create policy organization_devices_select on public.organization_devices for select
  using (
    organization_id = public.current_organization_id()
    and (
      public.current_user_role() in ('manager', 'admin')
      or owner_recorder_profile_id = public.current_recorder_profile_id()
      or device_kind = 'facility_shared'
    )
  );

grant select on public.organization_devices to authenticated;
grant all on public.organization_devices to service_role;

insert into public.organization_devices (
  organization_id, token_hash, label, platform, device_kind,
  owner_recorder_profile_id, status, transport_mode_only,
  requested_at, approved_by, approved_at, revoked_by, revoked_at,
  last_seen_at, created_at, updated_at
)
select distinct on (legacy.organization_id, legacy.token_hash)
  legacy.organization_id,
  legacy.token_hash,
  legacy.label,
  legacy.platform,
  case when legacy.device_kind = 'managed' then 'facility_shared' else 'personal' end,
  case when legacy.device_kind = 'managed' then null else legacy.recorder_profile_id end,
  legacy.status,
  case when legacy.device_kind = 'managed' then false else true end,
  legacy.requested_at,
  legacy.approved_by,
  legacy.approved_at,
  legacy.revoked_by,
  legacy.revoked_at,
  legacy.last_seen_at,
  legacy.created_at,
  legacy.updated_at
from public.staff_devices as legacy
order by legacy.organization_id, legacy.token_hash,
  case legacy.status when 'approved' then 0 when 'pending' then 1 else 2 end,
  legacy.updated_at desc
on conflict (organization_id, token_hash) do nothing;

drop function if exists public.get_current_staff_device_access(text);
create function public.get_current_staff_device_access(p_device_token text)
returns table(
  access_allowed boolean,
  access_reason text,
  device_id uuid,
  device_status text,
  field_mode_only boolean,
  device_kind text,
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
  current_device public.organization_devices%rowtype;
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
    return query select false, '利用可能な職員アカウントが見つかりません。', null::uuid,
      null::text, false, null::text, false, false;
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

  -- Email-based manager/admin sessions remain normal managed sessions.
  if current_profile.role <> 'staff' then
    return query select true, null::text, null::uuid, 'approved'::text, false,
      'unmanaged'::text, current_organization.device_approval_enabled,
      current_organization.personal_access_time_enabled;
    return;
  end if;

  -- The legacy shared staff login continues to work on facility tablets.
  if linked_recorder.id is null then
    return query select
      current_organization.shared_staff_login_allowed,
      case when current_organization.shared_staff_login_allowed then null::text else '共有の指導員ログインは利用停止されています。' end,
      null::uuid,
      case when current_organization.shared_staff_login_allowed then 'approved'::text else 'revoked'::text end,
      false,
      'facility_shared'::text,
      current_organization.device_approval_enabled,
      current_organization.personal_access_time_enabled;
    return;
  end if;

  if coalesce(p_device_token, '') !~ '^[A-Fa-f0-9]{64}$' then
    return query select false, 'この端末を識別できません。ログインし直してください。', null::uuid,
      'pending'::text, true, 'personal'::text,
      current_organization.device_approval_enabled,
      current_organization.personal_access_time_enabled;
    return;
  end if;

  token_digest := encode(digest(p_device_token, 'sha256'), 'hex');
  select * into current_device
  from public.organization_devices
  where organization_id = current_profile.organization_id
    and token_hash = token_digest
  limit 1;

  if current_device.id is null then
    return query select false, 'この端末は未登録です。ログインし直して利用申請を送信してください。',
      null::uuid, 'pending'::text, true, 'personal'::text,
      current_organization.device_approval_enabled,
      current_organization.personal_access_time_enabled;
    return;
  end if;

  if current_device.device_kind = 'personal'
     and current_device.owner_recorder_profile_id is distinct from linked_recorder.id then
    return query select false, 'この個人端末は別の職員に登録されています。管理者へ確認してください。',
      current_device.id, current_device.status, true, current_device.device_kind,
      current_organization.device_approval_enabled,
      current_organization.personal_access_time_enabled;
    return;
  end if;

  update public.organization_devices
  set last_seen_at = now()
  where id = current_device.id
    and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');

  if current_device.status = 'revoked' then
    return query select false, 'この端末の利用許可は取り消されています。',
      current_device.id, current_device.status,
      current_device.device_kind = 'personal', current_device.device_kind,
      current_organization.device_approval_enabled,
      current_organization.personal_access_time_enabled;
    return;
  end if;

  if current_organization.device_approval_enabled and current_device.status <> 'approved' then
    return query select false,
      case current_device.status
        when 'revoked' then 'この端末の利用許可は取り消されています。'
        else 'この端末は管理者の承認待ちです。'
      end,
      current_device.id, current_device.status,
      current_device.device_kind = 'personal', current_device.device_kind,
      true, current_organization.personal_access_time_enabled;
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

  return query select within_time,
    case when within_time then null::text else '現在は個人端末から利用できる時間外です。' end,
    current_device.id, current_device.status,
    current_device.device_kind = 'personal', current_device.device_kind,
    current_organization.device_approval_enabled,
    current_organization.personal_access_time_enabled;
end;
$$;

create or replace function public.review_organization_device(
  p_device_id uuid,
  p_action text,
  p_device_kind text default 'personal'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.organization_devices%rowtype;
begin
  if public.current_user_role() not in ('manager', 'admin') then
    raise exception using errcode = '42501', message = 'Manager access is required.';
  end if;
  if p_action not in ('approve', 'revoke') then
    raise exception using errcode = '22023', message = 'Device review action is invalid.';
  end if;
  if p_device_kind not in ('facility_shared', 'personal') then
    raise exception using errcode = '22023', message = 'Device kind is invalid.';
  end if;

  select * into target from public.organization_devices
  where id = p_device_id and organization_id = public.current_organization_id()
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Device was not found.';
  end if;

  update public.organization_devices
  set status = case when p_action = 'approve' then 'approved' else 'revoked' end,
      device_kind = p_device_kind,
      owner_recorder_profile_id = case when p_device_kind = 'facility_shared' then null else target.owner_recorder_profile_id end,
      transport_mode_only = p_device_kind = 'personal',
      approved_by = case when p_action = 'approve' then auth.uid() else approved_by end,
      approved_at = case when p_action = 'approve' then now() else approved_at end,
      revoked_by = case when p_action = 'revoke' then auth.uid() else null end,
      revoked_at = case when p_action = 'revoke' then now() else null end
  where id = p_device_id;
end;
$$;

revoke all on function public.get_current_staff_device_access(text) from public;
revoke all on function public.review_organization_device(uuid, text, text) from public;
grant execute on function public.get_current_staff_device_access(text) to authenticated;
grant execute on function public.review_organization_device(uuid, text, text) to authenticated;

create or replace function public.current_request_device_kind()
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  request_headers jsonb;
  raw_token text;
  resolved_kind text;
begin
  -- Email/shared sessions are not bound to an individual recorder and keep the
  -- existing facility workflow. Individual staff-ID sessions must present the
  -- physical device token on every write request.
  if public.current_recorder_profile_id() is null then return 'unmanaged'; end if;
  begin
    request_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return 'unverified';
  end;
  raw_token := request_headers->>'x-support-device-token';
  if coalesce(raw_token, '') !~ '^[A-Fa-f0-9]{64}$' then return 'unverified'; end if;
  select device.device_kind into resolved_kind
  from public.organization_devices device
  where device.organization_id = public.current_organization_id()
    and device.token_hash = encode(digest(raw_token, 'sha256'), 'hex')
    and device.status = 'approved';
  return coalesce(resolved_kind, 'unverified');
end;
$$;

create or replace function public.prevent_personal_device_record_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_recorder_profile_id() is not null
     and public.current_request_device_kind() <> 'facility_shared' then
    raise exception using
      errcode = '42501',
      message = 'PERSONAL_TRANSPORT_ONLY: 個人端末では支援経過記録を入力・変更できません。事業所共有端末を使用してください。';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists prevent_personal_record_mutation_before on public.support_records;
create trigger prevent_personal_record_mutation_before
  before insert or update or delete on public.support_records
  for each row execute function public.prevent_personal_device_record_mutation();

drop trigger if exists prevent_personal_draft_mutation_before on public.record_drafts;
create trigger prevent_personal_draft_mutation_before
  before insert or update or delete on public.record_drafts
  for each row execute function public.prevent_personal_device_record_mutation();

revoke all on function public.current_request_device_kind() from public;
revoke all on function public.prevent_personal_device_record_mutation() from public;

create table if not exists public.transport_stop_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transport_run_id uuid not null,
  stop_id text,
  child_id text,
  event_type text not null check (event_type in (
    'departed', 'arrived', 'boarded', 'dropped_off', 'facility_arrived',
    'returned', 'delay', 'help_requested'
  )),
  event_at timestamptz not null default now(),
  recorder_profile_id uuid not null,
  device_id uuid references public.organization_devices(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  cancelled_at timestamptz,
  cancelled_by_recorder_profile_id uuid,
  notification_sent_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, transport_run_id)
    references public.transport_runs(organization_id, id) on delete cascade,
  foreign key (organization_id, child_id)
    references public.children(organization_id, id) on delete restrict,
  foreign key (organization_id, recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete restrict,
  foreign key (organization_id, cancelled_by_recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete restrict
);

create index if not exists transport_stop_events_run_idx
  on public.transport_stop_events(organization_id, transport_run_id, event_at desc);
create index if not exists transport_stop_events_date_idx
  on public.transport_stop_events(organization_id, event_at desc);

drop trigger if exists audit_transport_stop_events_after on public.transport_stop_events;
create trigger audit_transport_stop_events_after
  after insert or update on public.transport_stop_events
  for each row execute function public.write_audit_log();

alter table public.transport_stop_events enable row level security;
drop policy if exists transport_stop_events_select on public.transport_stop_events;
create policy transport_stop_events_select on public.transport_stop_events for select
  using (organization_id = public.current_organization_id());
grant select on public.transport_stop_events to authenticated;
grant all on public.transport_stop_events to service_role;

create table if not exists public.transport_run_covers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transport_run_id uuid not null,
  recorder_profile_id uuid not null,
  device_id uuid references public.organization_devices(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, transport_run_id)
    references public.transport_runs(organization_id, id) on delete cascade,
  foreign key (organization_id, recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete cascade
);

create unique index if not exists transport_run_covers_active_unique_idx
  on public.transport_run_covers(organization_id, transport_run_id, recorder_profile_id)
  where ended_at is null;

alter table public.transport_run_covers enable row level security;
drop policy if exists transport_run_covers_select on public.transport_run_covers;
create policy transport_run_covers_select on public.transport_run_covers for select
  using (organization_id = public.current_organization_id());
grant select on public.transport_run_covers to authenticated;
grant all on public.transport_run_covers to service_role;

create or replace function public.current_transport_device(p_device_token text)
returns public.organization_devices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result public.organization_devices%rowtype;
begin
  if coalesce(p_device_token, '') !~ '^[A-Fa-f0-9]{64}$' then return null; end if;
  select * into result from public.organization_devices
  where organization_id = public.current_organization_id()
    and token_hash = encode(digest(p_device_token, 'sha256'), 'hex')
    and status = 'approved';
  return result;
end;
$$;

create or replace function public.get_personal_transport_dashboard(
  p_service_date date,
  p_device_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id_value uuid := public.current_organization_id();
  recorder_id_value uuid := public.current_recorder_profile_id();
  device_value public.organization_devices%rowtype;
  result jsonb;
begin
  device_value := public.current_transport_device(p_device_token);
  if organization_id_value is null or recorder_id_value is null or device_value.id is null then
    raise exception using errcode = '42501', message = 'TRANSPORT_DEVICE_ACCESS_DENIED';
  end if;
  if device_value.device_kind = 'personal'
     and device_value.owner_recorder_profile_id is distinct from recorder_id_value then
    raise exception using errcode = '42501', message = 'TRANSPORT_DEVICE_OWNER_MISMATCH';
  end if;

  with run_details as (
    select
      run.*,
      driver.display_name as driver_name,
      vehicle.name as vehicle_name,
      (
        run.driver_recorder_profile_id = recorder_id_value
        or run.assistant_recorder_profile_ids ? recorder_id_value::text
      ) as is_assigned,
      exists (
        select 1 from public.transport_run_covers cover
        where cover.organization_id = run.organization_id
          and cover.transport_run_id = run.id
          and cover.recorder_profile_id = recorder_id_value
          and cover.ended_at is null
      ) as is_covering
    from public.transport_runs run
    left join public.recorder_profiles driver
      on driver.organization_id = run.organization_id and driver.id = run.driver_recorder_profile_id
    left join public.vehicles vehicle
      on vehicle.organization_id = run.organization_id and vehicle.id = run.vehicle_id
    where run.organization_id = organization_id_value
      and run.service_date = p_service_date
  ), prepared as (
    select jsonb_build_object(
      'id', detail.id,
      'date', detail.service_date,
      'name', detail.name,
      'direction', detail.direction,
      'startTime', detail.start_time,
      'endTime', detail.end_time,
      'driverRecorderProfileId', detail.driver_recorder_profile_id,
      'driverName', detail.driver_name,
      'assistantRecorderProfileIds', detail.assistant_recorder_profile_ids,
      'assistantNames', coalesce((
        select jsonb_agg(profile.display_name order by profile.display_name)
        from public.recorder_profiles profile
        where profile.organization_id = detail.organization_id
          and detail.assistant_recorder_profile_ids ? profile.id::text
      ), '[]'::jsonb),
      'vehicleId', detail.vehicle_id,
      'vehicleName', detail.vehicle_name,
      'status', detail.status,
      'statusUpdatedAt', detail.status_updated_at,
      'passengerCount', jsonb_array_length(detail.stops),
      'isAssigned', detail.is_assigned,
      'isCovering', detail.is_covering,
      'hasHelpRequest', exists (
        select 1 from public.transport_stop_events event
        where event.organization_id = detail.organization_id
          and event.transport_run_id = detail.id
          and event.event_type = 'help_requested'
          and event.cancelled_at is null
          and event.event_at > now() - interval '2 hours'
      ),
      'hasDelay', exists (
        select 1 from public.transport_stop_events event
        where event.organization_id = detail.organization_id
          and event.transport_run_id = detail.id
          and event.event_type = 'delay'
          and event.cancelled_at is null
          and event.event_at > now() - interval '2 hours'
      ),
      'stops', case when detail.is_assigned or detail.is_covering then coalesce((
        select jsonb_agg(
          stop.value || jsonb_build_object(
            'events', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', event.id,
                'eventType', event.event_type,
                'eventAt', event.event_at,
                'recorderProfileId', event.recorder_profile_id,
                'recorderName', recorder.display_name,
                'cancelledAt', event.cancelled_at
              ) order by event.event_at)
              from public.transport_stop_events event
              left join public.recorder_profiles recorder
                on recorder.organization_id = event.organization_id and recorder.id = event.recorder_profile_id
              where event.organization_id = detail.organization_id
                and event.transport_run_id = detail.id
                and event.stop_id = stop.value->>'id'
            ), '[]'::jsonb)
          ) order by coalesce((stop.value->>'order')::integer, stop.ordinality::integer)
        )
        from jsonb_array_elements(detail.stops) with ordinality as stop(value, ordinality)
      ), '[]'::jsonb) else '[]'::jsonb end,
      'runEvents', case when detail.is_assigned or detail.is_covering then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', event.id,
          'eventType', event.event_type,
          'eventAt', event.event_at,
          'recorderProfileId', event.recorder_profile_id,
          'recorderName', recorder.display_name,
          'cancelledAt', event.cancelled_at
        ) order by event.event_at)
        from public.transport_stop_events event
        left join public.recorder_profiles recorder
          on recorder.organization_id = event.organization_id and recorder.id = event.recorder_profile_id
        where event.organization_id = detail.organization_id
          and event.transport_run_id = detail.id
          and event.stop_id is null
      ), '[]'::jsonb) else '[]'::jsonb end
    ) as item,
    detail.is_assigned,
    detail.is_covering,
    detail.start_time
    from run_details detail
  )
  select jsonb_build_object(
    'serviceDate', p_service_date,
    'recorderProfileId', recorder_id_value,
    'myRuns', coalesce(jsonb_agg(item order by start_time)
      filter (where is_assigned or is_covering), '[]'::jsonb),
    'allRuns', coalesce(jsonb_agg(item order by start_time), '[]'::jsonb)
  ) into result
  from prepared;

  return coalesce(result, jsonb_build_object(
    'serviceDate', p_service_date,
    'recorderProfileId', recorder_id_value,
    'myRuns', '[]'::jsonb,
    'allRuns', '[]'::jsonb
  ));
end;
$$;

create or replace function public.record_transport_field_action(
  p_transport_run_id uuid,
  p_stop_id text,
  p_action text,
  p_device_token text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id_value uuid := public.current_organization_id();
  recorder_id_value uuid := public.current_recorder_profile_id();
  device_value public.organization_devices%rowtype;
  run_value public.transport_runs%rowtype;
  stop_value jsonb;
  child_id_value text;
  existing_event_id uuid;
  inserted_event_id uuid;
  assigned boolean;
begin
  if p_action not in ('departed', 'arrived', 'boarded', 'dropped_off', 'facility_arrived', 'returned', 'delay', 'help_requested') then
    raise exception using errcode = '22023', message = 'Unsupported transport action.';
  end if;
  device_value := public.current_transport_device(p_device_token);
  if organization_id_value is null or recorder_id_value is null or device_value.id is null then
    raise exception using errcode = '42501', message = 'TRANSPORT_DEVICE_ACCESS_DENIED';
  end if;
  if device_value.device_kind = 'personal'
     and device_value.owner_recorder_profile_id is distinct from recorder_id_value then
    raise exception using errcode = '42501', message = 'TRANSPORT_DEVICE_OWNER_MISMATCH';
  end if;

  select * into run_value from public.transport_runs
  where organization_id = organization_id_value and id = p_transport_run_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Transport run not found.'; end if;

  assigned := run_value.driver_recorder_profile_id = recorder_id_value
    or run_value.assistant_recorder_profile_ids ? recorder_id_value::text
    or exists (
      select 1 from public.transport_run_covers cover
      where cover.organization_id = organization_id_value
        and cover.transport_run_id = run_value.id
        and cover.recorder_profile_id = recorder_id_value
        and cover.ended_at is null
    );
  if not assigned then
    raise exception using errcode = '42501', message = 'TRANSPORT_NOT_ASSIGNED';
  end if;

  if p_action in ('arrived', 'boarded', 'dropped_off') then
    select value into stop_value
    from jsonb_array_elements(run_value.stops) as item(value)
    where value->>'id' = p_stop_id
    limit 1;
    if stop_value is null then
      raise exception using errcode = '22023', message = 'Transport stop is required.';
    end if;
    child_id_value := nullif(stop_value->>'childId', '');
  else
    p_stop_id := null;
  end if;

  select event.id into existing_event_id
  from public.transport_stop_events event
  where event.organization_id = organization_id_value
    and event.transport_run_id = run_value.id
    and event.recorder_profile_id = recorder_id_value
    and event.event_type = p_action
    and event.stop_id is not distinct from p_stop_id
    and event.cancelled_at is null
    and event.event_at > now() - interval '10 seconds'
  order by event.event_at desc limit 1;
  if existing_event_id is not null then return existing_event_id; end if;

  insert into public.transport_stop_events (
    organization_id, transport_run_id, stop_id, child_id, event_type,
    recorder_profile_id, device_id, note
  ) values (
    organization_id_value, run_value.id, p_stop_id, child_id_value, p_action,
    recorder_id_value, device_value.id, nullif(trim(coalesce(p_note, '')), '')
  ) returning id into inserted_event_id;

  update public.transport_runs
  set status = case p_action
      when 'departed' then '出発済み'
      when 'boarded' then '乗車済み'
      when 'dropped_off' then '降車済み'
      when 'facility_arrived' then '事業所到着'
      when 'returned' then '帰着'
      else status
    end,
    status_updated_at = case when p_action in ('departed', 'boarded', 'dropped_off', 'facility_arrived', 'returned') then now() else status_updated_at end,
    status_updated_by_recorder_id = case when p_action in ('departed', 'boarded', 'dropped_off', 'facility_arrived', 'returned') then recorder_id_value else status_updated_by_recorder_id end
  where organization_id = organization_id_value and id = run_value.id;

  return inserted_event_id;
end;
$$;

create or replace function public.cancel_transport_field_action(
  p_event_id uuid,
  p_device_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recorder_id_value uuid := public.current_recorder_profile_id();
  device_value public.organization_devices%rowtype;
  target_event public.transport_stop_events%rowtype;
  fallback_status text;
begin
  device_value := public.current_transport_device(p_device_token);
  if recorder_id_value is null or device_value.id is null then
    raise exception using errcode = '42501', message = 'TRANSPORT_DEVICE_ACCESS_DENIED';
  end if;
  select * into target_event from public.transport_stop_events
  where id = p_event_id
    and organization_id = public.current_organization_id()
    and recorder_profile_id = recorder_id_value
    and cancelled_at is null
    and event_at > now() - interval '60 seconds'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'この操作は取り消せません。管理者へ修正を依頼してください。';
  end if;

  update public.transport_stop_events
  set cancelled_at = now(), cancelled_by_recorder_profile_id = recorder_id_value
  where id = target_event.id;

  if target_event.event_type in ('departed', 'boarded', 'dropped_off', 'facility_arrived', 'returned') then
    select case event.event_type
      when 'returned' then '帰着'
      when 'facility_arrived' then '事業所到着'
      when 'dropped_off' then '降車済み'
      when 'boarded' then '乗車済み'
      when 'departed' then '出発済み'
      else '未出発'
    end into fallback_status
    from public.transport_stop_events event
    where event.organization_id = target_event.organization_id
      and event.transport_run_id = target_event.transport_run_id
      and event.cancelled_at is null
      and event.event_type in ('departed', 'boarded', 'dropped_off', 'facility_arrived', 'returned')
    order by event.event_at desc
    limit 1;

    update public.transport_runs
    set status = coalesce(fallback_status, '未出発'),
        status_updated_at = now(),
        status_updated_by_recorder_id = recorder_id_value
    where organization_id = target_event.organization_id
      and id = target_event.transport_run_id;
  end if;
end;
$$;

create or replace function public.set_transport_cover(
  p_transport_run_id uuid,
  p_active boolean,
  p_device_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id_value uuid := public.current_organization_id();
  recorder_id_value uuid := public.current_recorder_profile_id();
  device_value public.organization_devices%rowtype;
begin
  device_value := public.current_transport_device(p_device_token);
  if organization_id_value is null or recorder_id_value is null or device_value.id is null then
    raise exception using errcode = '42501', message = 'TRANSPORT_DEVICE_ACCESS_DENIED';
  end if;
  if not exists (
    select 1 from public.transport_runs
    where organization_id = organization_id_value and id = p_transport_run_id
  ) then
    raise exception using errcode = 'P0002', message = 'Transport run not found.';
  end if;
  if p_active then
    insert into public.transport_run_covers (
      organization_id, transport_run_id, recorder_profile_id, device_id
    ) values (
      organization_id_value, p_transport_run_id, recorder_id_value, device_value.id
    ) on conflict do nothing;
  else
    update public.transport_run_covers set ended_at = now()
    where organization_id = organization_id_value
      and transport_run_id = p_transport_run_id
      and recorder_profile_id = recorder_id_value
      and ended_at is null;
  end if;
end;
$$;

revoke all on function public.current_transport_device(text) from public;
revoke all on function public.get_personal_transport_dashboard(date, text) from public;
revoke all on function public.record_transport_field_action(uuid, text, text, text, text) from public;
revoke all on function public.cancel_transport_field_action(uuid, text) from public;
revoke all on function public.set_transport_cover(uuid, boolean, text) from public;
grant execute on function public.get_personal_transport_dashboard(date, text) to authenticated;
grant execute on function public.record_transport_field_action(uuid, text, text, text, text) to authenticated;
grant execute on function public.cancel_transport_field_action(uuid, text) to authenticated;
grant execute on function public.set_transport_cover(uuid, boolean, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'organization_devices'
    ) then alter publication supabase_realtime add table public.organization_devices; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transport_stop_events'
    ) then alter publication supabase_realtime add table public.transport_stop_events; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transport_run_covers'
    ) then alter publication supabase_realtime add table public.transport_run_covers; end if;
  end if;
end $$;
