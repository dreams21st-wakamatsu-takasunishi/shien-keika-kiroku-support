-- A rotating entrance QR is proof of presence, not staff identity. Only the
-- already-approved personal device determines the account. No browser may call
-- this authorization function directly; the Edge Function exchanges its result
-- for a Supabase session without exposing service credentials or magic links.

create table public.attendance_qr_login_uses (
  challenge_id uuid not null references public.attendance_qr_challenges(id) on delete cascade,
  device_id uuid not null references public.organization_devices(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (challenge_id, device_id)
);
create index attendance_qr_login_uses_device_time_idx
  on public.attendance_qr_login_uses(device_id, created_at desc);
alter table public.attendance_qr_login_uses enable row level security;
revoke all on public.attendance_qr_login_uses from public, anon, authenticated;
grant all on public.attendance_qr_login_uses to service_role;

create or replace function public.consume_attendance_qr_login(p_qr_token text, p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  challenge_value public.attendance_qr_challenges%rowtype;
  device_value public.organization_devices%rowtype;
  organization_value public.organizations%rowtype;
  recorder_value public.recorder_profiles%rowtype;
  linked_user_ids uuid[];
  local_now timestamp;
  within_time boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'QR_LOGIN_DENIED';
  end if;
  if coalesce(p_qr_token, '') !~ '^[a-fA-F0-9]{64}$'
     or coalesce(p_device_token, '') !~ '^[a-fA-F0-9]{64}$' then
    raise exception using errcode = '22023', message = 'QR_LOGIN_INVALID';
  end if;

  select * into challenge_value from public.attendance_qr_challenges
  where token_hash = encode(digest(p_qr_token, 'sha256'), 'hex')
  order by created_at desc limit 1 for share;
  if challenge_value.id is null then
    raise exception using errcode = '42501', message = 'QR_LOGIN_INVALID';
  end if;
  if challenge_value.expires_at <= clock_timestamp() then
    raise exception using errcode = '42501', message = 'QR_LOGIN_EXPIRED';
  end if;
  perform 1 from public.organization_devices
  where id = challenge_value.issued_device_id
    and organization_id = challenge_value.organization_id
    and device_kind = 'facility_shared' and status = 'approved'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'QR_LOGIN_INVALID';
  end if;

  -- Serializes concurrent attempts from the same device (including rate checks).
  select * into device_value from public.organization_devices
  where organization_id = challenge_value.organization_id
    and token_hash = encode(digest(p_device_token, 'sha256'), 'hex')
  for update;
  if device_value.id is null or device_value.device_kind <> 'personal'
     or device_value.status <> 'approved' then
    raise exception using errcode = '42501', message = 'QR_LOGIN_DEVICE_REQUIRED';
  end if;
  select * into recorder_value from public.recorder_profiles
  where id = device_value.owner_recorder_profile_id
    and organization_id = device_value.organization_id and active = true
  for share;
  if recorder_value.id is null
     or (recorder_value.auth_user_id is not null and recorder_value.individual_login_enabled is not true) then
    raise exception using errcode = '42501', message = 'QR_LOGIN_ACCOUNT_UNAVAILABLE';
  end if;

  -- Support explicit email-account links and staff-ID links, but never choose
  -- an arbitrary account when the roster has conflicting identity links.
  select array_agg(id) into linked_user_ids from (
    select profile.id from public.profiles profile
    where profile.organization_id = device_value.organization_id
      and profile.active = true
      and (profile.recorder_profile_id = recorder_value.id
        or profile.id = recorder_value.auth_user_id)
    for share
  ) linked;
  if coalesce(array_length(linked_user_ids, 1), 0) <> 1
     or (recorder_value.auth_user_id is not null and recorder_value.auth_user_id <> linked_user_ids[1])
     or exists (
       select 1 from public.profiles profile where profile.id = linked_user_ids[1]
         and profile.recorder_profile_id is not null
         and profile.recorder_profile_id <> recorder_value.id
     ) then
    raise exception using errcode = '42501', message = 'QR_LOGIN_ACCOUNT_UNAVAILABLE';
  end if;

  select * into organization_value from public.organizations
  where id = device_value.organization_id for share;
  if organization_value.personal_access_time_enabled then
    local_now := clock_timestamp() at time zone 'Asia/Tokyo';
    if organization_value.personal_access_start <= organization_value.personal_access_end then
      within_time := local_now::time >= organization_value.personal_access_start
        and local_now::time <= organization_value.personal_access_end;
    else
      within_time := local_now::time >= organization_value.personal_access_start
        or local_now::time <= organization_value.personal_access_end;
    end if;
    if not coalesce(within_time and extract(isodow from local_now)::smallint = any(organization_value.personal_access_days), false) then
      raise exception using errcode = '42501', message = 'QR_LOGIN_OUTSIDE_ACCESS_TIME';
    end if;
  end if;
  -- Recheck after locks: a waiting request must not use an expired challenge.
  if challenge_value.expires_at <= clock_timestamp() then
    raise exception using errcode = '42501', message = 'QR_LOGIN_EXPIRED';
  end if;
  if exists (select 1 from public.attendance_qr_login_uses
    where challenge_id = challenge_value.id and device_id = device_value.id) then
    raise exception using errcode = '42501', message = 'QR_LOGIN_ALREADY_USED';
  end if;
  if (select count(*) from public.attendance_qr_login_uses
    where device_id = device_value.id and created_at > clock_timestamp() - interval '5 minutes') >= 5 then
    raise exception using errcode = '42501', message = 'QR_LOGIN_RATE_LIMITED';
  end if;
  insert into public.attendance_qr_login_uses(challenge_id, device_id, user_id)
  values (challenge_value.id, device_value.id, linked_user_ids[1]);
  update public.organization_devices set last_seen_at = now() where id = device_value.id;
  return jsonb_build_object('userId', linked_user_ids[1], 'deviceId', device_value.id);
end;
$$;
revoke all on function public.consume_attendance_qr_login(text, text) from public, anon, authenticated;
grant execute on function public.consume_attendance_qr_login(text, text) to service_role;
