-- Personal phone displays; approved facility browser scans. Old entrance QRs
-- must not authorize either login or attendance after this migration.
create table public.staff_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  recorder_profile_id uuid not null,
  issued_device_id uuid not null references public.organization_devices(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_action text check (consumed_action in ('ログイン', '出勤', '退勤')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, recorder_profile_id) references public.recorder_profiles(organization_id, id) on delete cascade
);
create index staff_qr_tokens_owner_idx on public.staff_qr_tokens(user_id, expires_at);
create index staff_qr_tokens_expiry_idx on public.staff_qr_tokens(expires_at);
-- Retain the audit trail even after expired secrets are cleaned up.
create table public.staff_qr_events (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  recorder_profile_id uuid references public.recorder_profiles(id) on delete set null,
  issued_device_id uuid references public.organization_devices(id) on delete set null,
  scanned_device_id uuid references public.organization_devices(id) on delete set null,
  action text not null check (action in ('ログイン', '出勤', '退勤')),
  scanned_at timestamptz not null
);
create index staff_qr_events_user_time_idx on public.staff_qr_events(user_id, scanned_at desc);
alter table public.staff_qr_tokens enable row level security;
alter table public.staff_qr_events enable row level security;
revoke all on public.staff_qr_tokens, public.staff_qr_events from public, anon, authenticated;
grant all on public.staff_qr_tokens, public.staff_qr_events to service_role;

-- Internal helper: the recorder lock serializes issue/consume, and also covers
-- the first attendance insert of a day (which has no existing row to lock).
create function public.validate_staff_qr_identity(p_user_id uuid, p_recorder_id uuid, p_issuer_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  recorder_value public.recorder_profiles%rowtype;
  profile_value public.profiles%rowtype;
  org_value public.organizations%rowtype;
  local_now timestamp := clock_timestamp() at time zone 'Asia/Tokyo';
  within_time boolean;
begin
  select * into recorder_value from public.recorder_profiles where id = p_recorder_id for update;
  select * into profile_value from public.profiles where id = p_user_id for share;
  if recorder_value.id is null or profile_value.id is null
    or recorder_value.active is not true or profile_value.active is not true
    or recorder_value.organization_id is distinct from profile_value.organization_id
    or not (coalesce(profile_value.recorder_profile_id = p_recorder_id, false)
      or coalesce(recorder_value.auth_user_id = p_user_id, false))
    or (profile_value.recorder_profile_id is not null and profile_value.recorder_profile_id <> p_recorder_id)
    or (recorder_value.auth_user_id is not null and (recorder_value.auth_user_id <> p_user_id or recorder_value.individual_login_enabled is not true))
    or exists (select 1 from public.profiles where id <> p_user_id and active = true
      and organization_id = profile_value.organization_id and recorder_profile_id = p_recorder_id) then
    raise exception 'STAFF_QR_ACCOUNT_UNAVAILABLE';
  end if;
  perform 1 from public.organization_devices where id = p_issuer_id
    and organization_id = profile_value.organization_id and device_kind = 'personal'
    and status = 'approved' and owner_recorder_profile_id = p_recorder_id for share;
  if not found then raise exception 'STAFF_QR_PERSONAL_REQUIRED'; end if;
  select * into org_value from public.organizations where id = profile_value.organization_id for share;
  if org_value.personal_access_time_enabled then
    if org_value.personal_access_start <= org_value.personal_access_end then
      within_time := local_now::time between org_value.personal_access_start and org_value.personal_access_end;
    else
      within_time := local_now::time >= org_value.personal_access_start or local_now::time <= org_value.personal_access_end;
    end if;
    if not coalesce(within_time and extract(isodow from local_now)::smallint = any(org_value.personal_access_days), false) then
      raise exception 'STAFF_QR_OUTSIDE_ACCESS_TIME';
    end if;
  end if;
  return jsonb_build_object('userId', p_user_id, 'recorderProfileId', p_recorder_id,
    'organizationId', profile_value.organization_id, 'displayName', recorder_value.display_name);
end;
$$;
revoke all on function public.validate_staff_qr_identity(uuid, uuid, uuid) from public, anon, authenticated;

create function public.issue_personal_staff_qr(p_device_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  recorder_id_value uuid := public.current_recorder_profile_id();
  device_id_value uuid;
  identity_value jsonb;
  raw_token text;
  issue_time timestamptz;
begin
  if auth.uid() is null or recorder_id_value is null then raise exception 'STAFF_QR_ACCOUNT_UNAVAILABLE'; end if;
  if coalesce(p_device_token, '') !~ '^[a-fA-F0-9]{64}$' then raise exception 'STAFF_QR_PERSONAL_REQUIRED'; end if;
  select id into device_id_value from public.organization_devices
    where organization_id = public.current_organization_id()
      and token_hash = encode(digest(p_device_token, 'sha256'), 'hex');
  identity_value := public.validate_staff_qr_identity(auth.uid(), recorder_id_value, device_id_value);
  issue_time := clock_timestamp();
  -- One active QR per phone; refresh/reopen invalidates the previous image.
  update public.staff_qr_tokens set expires_at = issue_time
    where issued_device_id = device_id_value and consumed_at is null and expires_at > issue_time;
  delete from public.staff_qr_tokens where user_id = auth.uid() and expires_at < issue_time - interval '1 day';
  raw_token := encode(gen_random_bytes(32), 'hex');
  insert into public.staff_qr_tokens(organization_id, user_id, recorder_profile_id, issued_device_id, token_hash, expires_at)
    values ((identity_value->>'organizationId')::uuid, auth.uid(), recorder_id_value, device_id_value,
      encode(digest(raw_token, 'sha256'), 'hex'), issue_time + interval '2 minutes');
  return jsonb_build_object('token', raw_token, 'expiresAt', issue_time + interval '2 minutes',
    'serverNow', issue_time, 'refreshAfterSeconds', 90, 'displayName', identity_value->>'displayName');
end;
$$;
revoke all on function public.issue_personal_staff_qr(text) from public, anon;
grant execute on function public.issue_personal_staff_qr(text) to authenticated;

create function public.get_personal_staff_qr_status(p_qr_token text)
returns jsonb language sql security definer set search_path = public, extensions as $$
  select jsonb_build_object('usedAt', consumed_at, 'action', consumed_action)
  from public.staff_qr_tokens where user_id = auth.uid()
    and token_hash = encode(digest(p_qr_token, 'sha256'), 'hex');
$$;
create function public.revoke_personal_staff_qr(p_qr_token text)
returns void language sql security definer set search_path = public, extensions as $$
  update public.staff_qr_tokens set expires_at = least(expires_at, clock_timestamp())
    where user_id = auth.uid() and token_hash = encode(digest(p_qr_token, 'sha256'), 'hex');
$$;
revoke all on function public.get_personal_staff_qr_status(text), public.revoke_personal_staff_qr(text) from public, anon;
grant execute on function public.get_personal_staff_qr_status(text), public.revoke_personal_staff_qr(text) to authenticated;

-- Called only by the Edge Function. Reused immediately before consumption so
-- validation cannot become stale across the Auth user-status check.
create function public.inspect_personal_staff_qr(p_qr_token text, p_device_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  token_value public.staff_qr_tokens%rowtype;
  device_value public.organization_devices%rowtype;
  identity_value jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'STAFF_QR_DENIED'; end if;
  if coalesce(p_qr_token, '') !~ '^[a-fA-F0-9]{64}$' or coalesce(p_device_token, '') !~ '^[a-fA-F0-9]{64}$' then
    raise exception 'STAFF_QR_INVALID';
  end if;
  select * into token_value from public.staff_qr_tokens where token_hash = encode(digest(p_qr_token, 'sha256'), 'hex');
  if token_value.id is null then raise exception 'STAFF_QR_INVALID'; end if;
  identity_value := public.validate_staff_qr_identity(token_value.user_id, token_value.recorder_profile_id, token_value.issued_device_id);
  if (identity_value->>'organizationId')::uuid is distinct from token_value.organization_id then raise exception 'STAFF_QR_INVALID'; end if;
  select * into token_value from public.staff_qr_tokens where id = token_value.id for update;
  if token_value.consumed_at is not null then raise exception 'STAFF_QR_ALREADY_USED'; end if;
  if token_value.expires_at <= clock_timestamp() then raise exception 'STAFF_QR_EXPIRED'; end if;
  select * into device_value from public.organization_devices
    where organization_id = token_value.organization_id
      and token_hash = encode(digest(p_device_token, 'sha256'), 'hex') for share;
  if device_value.id is null or device_value.device_kind <> 'facility_shared' or device_value.status <> 'approved' then
    raise exception 'STAFF_QR_SHARED_REQUIRED';
  end if;
  return identity_value || jsonb_build_object('tokenId', token_value.id, 'deviceId', device_value.id, 'issuerId', token_value.issued_device_id);
end;
$$;
revoke all on function public.inspect_personal_staff_qr(text, text) from public, anon, authenticated;
grant execute on function public.inspect_personal_staff_qr(text, text) to service_role;

create function public.consume_personal_staff_qr(p_qr_token text, p_device_token text, p_action text, p_expected_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  identity_value jsonb;
  org_id uuid;
  recorder_id_value uuid;
  current_row public.attendance_records%rowtype;
  scan_time timestamptz;
  work_day date;
  break_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'STAFF_QR_DENIED'; end if;
  if p_action is null or p_action not in ('ログイン', '出勤', '退勤') then raise exception 'STAFF_QR_INVALID'; end if;
  identity_value := public.inspect_personal_staff_qr(p_qr_token, p_device_token);
  if (identity_value->>'userId')::uuid is distinct from p_expected_user_id then raise exception 'STAFF_QR_ACCOUNT_UNAVAILABLE'; end if;
  org_id := (identity_value->>'organizationId')::uuid;
  recorder_id_value := (identity_value->>'recorderProfileId')::uuid;
  scan_time := clock_timestamp();
  work_day := (scan_time at time zone 'Asia/Tokyo')::date;
  if p_action = 'ログイン' then
    if (select count(*) from public.staff_qr_events where user_id = p_expected_user_id
      and action = 'ログイン' and scanned_at > scan_time - interval '5 minutes') >= 5 then raise exception 'STAFF_QR_RATE_LIMITED'; end if;
  else
    select * into current_row from public.attendance_records
      where organization_id = org_id and recorder_profile_id = recorder_id_value and work_date = work_day for update;
    if p_action = '出勤' then
      if current_row.clock_in_at is not null then raise exception 'ATTENDANCE_ALREADY_CLOCKED_IN'; end if;
      if current_row.id is null then
        insert into public.attendance_records(organization_id, recorder_profile_id, work_date, status, clock_in_at,
          device_id, last_action_by_recorder_id, created_by)
        values (org_id, recorder_id_value, work_day, '出勤中', scan_time,
          identity_value->>'deviceId', recorder_id_value, p_expected_user_id) returning * into current_row;
      else
        update public.attendance_records set clock_in_at = scan_time, status = '出勤中',
          device_id = identity_value->>'deviceId', last_action_by_recorder_id = recorder_id_value, updated_at = scan_time
          where organization_id = org_id and id = current_row.id returning * into current_row;
      end if;
    else
      if current_row.id is null or current_row.clock_in_at is null then raise exception 'ATTENDANCE_NOT_CLOCKED_IN'; end if;
      if current_row.clock_out_at is not null then raise exception 'ATTENDANCE_ALREADY_CLOCKED_OUT'; end if;
      break_count := jsonb_array_length(coalesce(current_row.break_periods, '[]'::jsonb));
      update public.attendance_records set clock_out_at = scan_time, status = '退勤済み',
        break_periods = case when current_row.status = '休憩中' and break_count > 0 then
          jsonb_set(break_periods, array[(break_count-1)::text, 'endedAt'], to_jsonb(scan_time::text), true) else break_periods end,
        device_id = identity_value->>'deviceId', last_action_by_recorder_id = recorder_id_value, updated_at = scan_time
        where organization_id = org_id and id = current_row.id returning * into current_row;
    end if;
  end if;
  update public.staff_qr_tokens set consumed_at = scan_time, consumed_action = p_action where id = (identity_value->>'tokenId')::uuid;
  insert into public.staff_qr_events(token_id, organization_id, user_id, recorder_profile_id, issued_device_id, scanned_device_id, action, scanned_at)
    values ((identity_value->>'tokenId')::uuid, org_id, p_expected_user_id, recorder_id_value,
      (identity_value->>'issuerId')::uuid, (identity_value->>'deviceId')::uuid, p_action, scan_time);
  return jsonb_build_object('userId', p_expected_user_id, 'deviceId', identity_value->>'deviceId',
    'displayName', identity_value->>'displayName', 'action', p_action, 'scannedAt', scan_time,
    'clockInAt', current_row.clock_in_at, 'clockOutAt', current_row.clock_out_at);
end;
$$;
revoke all on function public.consume_personal_staff_qr(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.consume_personal_staff_qr(text, text, text, uuid) to service_role;

create or replace function public.consume_attendance_qr_login(p_qr_token text, p_device_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin raise exception 'STAFF_QR_LEGACY_DISABLED'; end; $$;
create or replace function public.issue_attendance_qr_challenge(p_device_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin raise exception 'STAFF_QR_LEGACY_DISABLED'; end; $$;
create or replace function public.punch_attendance_with_qr(p_qr_token text, p_action text, p_device_token text)
returns setof public.attendance_records language plpgsql security definer set search_path = public as $$
begin raise exception 'STAFF_QR_LEGACY_DISABLED'; end; $$;
