-- Secure rotating QR attendance, administrator-only correction approval, and
-- exact navigation coordinates for personal-device transport directions.

drop policy if exists attendance_corrections_manage on public.attendance_correction_requests;
create policy attendance_corrections_manage on public.attendance_correction_requests for update
  using (organization_id = public.current_organization_id() and public.current_user_role() = 'admin')
  with check (organization_id = public.current_organization_id() and public.current_user_role() = 'admin');

create or replace function public.review_attendance_correction(
  p_organization_id uuid,
  p_request_id uuid,
  p_approved boolean,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  correction public.attendance_correction_requests%rowtype;
  reviewer_name text;
begin
  if p_organization_id is distinct from public.current_organization_id()
     or public.current_user_role() <> 'admin' then
    raise exception using errcode = '42501', message = 'ATTENDANCE_ADMIN_APPROVAL_REQUIRED';
  end if;
  select * into correction from public.attendance_correction_requests
  where organization_id = p_organization_id and id = p_request_id and status = '申請中'
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Correction request not found.'; end if;
  select display_name into reviewer_name from public.profiles where id = auth.uid();
  if p_approved then
    update public.attendance_records
    set clock_in_at = correction.requested_clock_in_at,
        clock_out_at = correction.requested_clock_out_at,
        updated_at = now()
    where organization_id = p_organization_id and id = correction.attendance_record_id;
  end if;
  update public.attendance_correction_requests
  set status = case when p_approved then '承認' else '却下' end,
      reviewed_by = auth.uid(), reviewed_by_name = reviewer_name,
      reviewed_at = now(), review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      updated_at = now()
  where organization_id = p_organization_id and id = p_request_id;
end;
$$;

create table if not exists public.attendance_qr_challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token_hash text not null,
  issued_device_id uuid references public.organization_devices(id) on delete set null,
  issued_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, token_hash)
);

create index if not exists attendance_qr_challenges_expiry_idx
  on public.attendance_qr_challenges(organization_id, expires_at desc);

create table if not exists public.attendance_qr_scans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  challenge_id uuid references public.attendance_qr_challenges(id) on delete set null,
  recorder_profile_id uuid not null,
  device_id uuid references public.organization_devices(id) on delete set null,
  action text not null check (action in ('出勤', '退勤')),
  scanned_at timestamptz not null default now(),
  foreign key (organization_id, recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete restrict,
  unique (challenge_id, recorder_profile_id, action)
);

create index if not exists attendance_qr_scans_org_time_idx
  on public.attendance_qr_scans(organization_id, scanned_at desc);

alter table public.attendance_qr_challenges enable row level security;
alter table public.attendance_qr_scans enable row level security;
grant all on public.attendance_qr_challenges to service_role;
grant all on public.attendance_qr_scans to service_role;

create or replace function public.issue_attendance_qr_challenge(p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  organization_id_value uuid := public.current_organization_id();
  device_value public.organization_devices%rowtype;
  raw_token text;
  expiry timestamptz := now() + interval '2 minutes';
begin
  if organization_id_value is null or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Attendance access denied.';
  end if;
  device_value := public.current_transport_device(p_device_token);
  if device_value.id is null or device_value.device_kind <> 'facility_shared' then
    raise exception using errcode = '42501', message = 'ATTENDANCE_SHARED_DEVICE_REQUIRED';
  end if;

  delete from public.attendance_qr_challenges
  where organization_id = organization_id_value
    and expires_at < now() - interval '1 day';

  raw_token := encode(gen_random_bytes(32), 'hex');
  insert into public.attendance_qr_challenges (
    organization_id, token_hash, issued_device_id, issued_by, expires_at
  ) values (
    organization_id_value,
    encode(digest(raw_token, 'sha256'), 'hex'),
    device_value.id,
    auth.uid(),
    expiry
  );

  return jsonb_build_object(
    'token', raw_token,
    'expiresAt', expiry,
    'refreshAfterSeconds', 90
  );
end;
$$;

create or replace function public.punch_attendance_with_qr(
  p_qr_token text,
  p_action text,
  p_device_token text
)
returns setof public.attendance_records
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  organization_id_value uuid := public.current_organization_id();
  recorder_id_value uuid := public.current_recorder_profile_id();
  device_value public.organization_devices%rowtype;
  challenge_value public.attendance_qr_challenges%rowtype;
  current_row public.attendance_records%rowtype;
  work_day date := (timezone('Asia/Tokyo', now()))::date;
  break_count integer;
begin
  if organization_id_value is null or recorder_id_value is null or auth.uid() is null then
    raise exception using errcode = '42501', message = 'ATTENDANCE_PERSONAL_DEVICE_REQUIRED';
  end if;
  if p_action not in ('出勤', '退勤') then
    raise exception using errcode = '22023', message = 'Unsupported attendance action.';
  end if;

  device_value := public.current_transport_device(p_device_token);
  if device_value.id is null
     or device_value.device_kind <> 'personal'
     or device_value.owner_recorder_profile_id is distinct from recorder_id_value then
    raise exception using errcode = '42501', message = 'ATTENDANCE_PERSONAL_DEVICE_REQUIRED';
  end if;

  if coalesce(p_qr_token, '') !~ '^[A-Fa-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'ATTENDANCE_QR_INVALID';
  end if;
  select * into challenge_value
  from public.attendance_qr_challenges
  where organization_id = organization_id_value
    and token_hash = encode(digest(p_qr_token, 'sha256'), 'hex')
  order by created_at desc
  limit 1;
  if challenge_value.id is null then
    raise exception using errcode = '22023', message = 'ATTENDANCE_QR_INVALID';
  end if;
  if challenge_value.expires_at < now() then
    raise exception using errcode = '22023', message = 'ATTENDANCE_QR_EXPIRED';
  end if;
  if not exists (
    select 1 from public.organization_devices issued
    where issued.id = challenge_value.issued_device_id
      and issued.organization_id = organization_id_value
      and issued.device_kind = 'facility_shared'
      and issued.status = 'approved'
  ) then
    raise exception using errcode = '42501', message = 'ATTENDANCE_QR_INVALID';
  end if;

  select * into current_row
  from public.attendance_records
  where organization_id = organization_id_value
    and recorder_profile_id = recorder_id_value
    and work_date = work_day
  for update;

  if p_action = '出勤' then
    if current_row.id is null then
      insert into public.attendance_records (
        organization_id, recorder_profile_id, work_date, status, clock_in_at,
        device_id, last_action_by_recorder_id, created_by
      ) values (
        organization_id_value, recorder_id_value, work_day, '出勤中', now(),
        device_value.id::text, recorder_id_value, auth.uid()
      ) returning * into current_row;
    elsif current_row.clock_in_at is not null then
      raise exception using errcode = 'P0001', message = 'ATTENDANCE_ALREADY_CLOCKED_IN';
    else
      update public.attendance_records
      set clock_in_at = now(), status = '出勤中', device_id = device_value.id::text,
          last_action_by_recorder_id = recorder_id_value, updated_at = now()
      where organization_id = organization_id_value and id = current_row.id
      returning * into current_row;
    end if;
  else
    if current_row.id is null or current_row.clock_in_at is null then
      raise exception using errcode = 'P0001', message = 'ATTENDANCE_NOT_CLOCKED_IN';
    end if;
    if current_row.clock_out_at is not null then
      raise exception using errcode = 'P0001', message = 'ATTENDANCE_ALREADY_CLOCKED_OUT';
    end if;
    break_count := jsonb_array_length(coalesce(current_row.break_periods, '[]'::jsonb));
    update public.attendance_records
    set break_periods = case
          when current_row.status = '休憩中' and break_count > 0 then jsonb_set(
            break_periods,
            array[(break_count - 1)::text, 'endedAt'],
            to_jsonb(now()::text),
            true
          )
          else break_periods
        end,
        clock_out_at = now(), status = '退勤済み', device_id = device_value.id::text,
        last_action_by_recorder_id = recorder_id_value, updated_at = now()
    where organization_id = organization_id_value and id = current_row.id
    returning * into current_row;
  end if;

  insert into public.attendance_qr_scans (
    organization_id, challenge_id, recorder_profile_id, device_id, action
  ) values (
    organization_id_value, challenge_value.id, recorder_id_value, device_value.id, p_action
  );
  return next current_row;
end;
$$;

revoke all on function public.issue_attendance_qr_challenge(text) from public;
revoke all on function public.punch_attendance_with_qr(text, text, text) from public;
grant execute on function public.issue_attendance_qr_challenge(text) to authenticated;
grant execute on function public.punch_attendance_with_qr(text, text, text) to authenticated;

create or replace function public.enrich_transport_stop_navigation(
  p_organization_id uuid,
  p_stop jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  navigation_value text;
  stop_address text := regexp_replace(lower(coalesce(p_stop->>'location', '')), '[[:space:]　]', '', 'g');
begin
  select location.latitude::text || ',' || location.longitude::text
  into navigation_value
  from public.transport_map_locations location
  where location.organization_id = p_organization_id
    and location.latitude is not null
    and location.longitude is not null
    and (
      (nullif(p_stop->>'locationProfileId', '') is not null
        and location.location_profile_id = p_stop->>'locationProfileId'
        and (location.child_id = nullif(p_stop->>'childId', '') or location.child_id is null))
      or (nullif(p_stop->>'childId', '') is not null
        and location.child_id = p_stop->>'childId'
        and regexp_replace(lower(location.address), '[[:space:]　]', '', 'g') = stop_address)
      or (stop_address <> ''
        and regexp_replace(lower(location.address), '[[:space:]　]', '', 'g') = stop_address)
    )
  order by
    case
      when nullif(p_stop->>'locationProfileId', '') is not null
        and location.location_profile_id = p_stop->>'locationProfileId' then 0
      when nullif(p_stop->>'childId', '') is not null and location.child_id = p_stop->>'childId' then 1
      else 2
    end,
    location.updated_at desc
  limit 1;

  return p_stop || jsonb_build_object(
    'navigationLocation', coalesce(navigation_value, nullif(p_stop->>'location', ''))
  );
end;
$$;

create or replace function public.enrich_transport_run_navigation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(jsonb_agg(
    public.enrich_transport_stop_navigation(new.organization_id, stop.value)
    order by stop.ordinality
  ), '[]'::jsonb)
  into new.stops
  from jsonb_array_elements(coalesce(new.stops, '[]'::jsonb)) with ordinality as stop(value, ordinality);
  return new;
end;
$$;

drop trigger if exists enrich_transport_run_navigation_before on public.transport_runs;
create trigger enrich_transport_run_navigation_before
  before insert or update of stops on public.transport_runs
  for each row execute function public.enrich_transport_run_navigation();

update public.transport_runs run
set stops = coalesce((
  select jsonb_agg(
    public.enrich_transport_stop_navigation(run.organization_id, stop.value)
    order by stop.ordinality
  )
  from jsonb_array_elements(coalesce(run.stops, '[]'::jsonb)) with ordinality as stop(value, ordinality)
), '[]'::jsonb);

revoke all on function public.enrich_transport_stop_navigation(uuid, jsonb) from public;
