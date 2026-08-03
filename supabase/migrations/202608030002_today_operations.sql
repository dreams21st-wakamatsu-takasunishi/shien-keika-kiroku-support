-- Unified "today's work" foundation: calendar, attendance, vehicles and
-- transport runs. Source data remains authoritative and is projected onto the
-- existing staff Gantt chart by the client.

alter table public.children
  add column if not exists transportation_required boolean not null default false,
  add column if not exists pickup_location text,
  add column if not exists dropoff_location text;

create table if not exists public.calendar_events (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  event_type text not null check (event_type in (
    '通常利用', '追加利用', '欠席', '勤務予定', '会議', '朝礼', '研修',
    '保護者面談', '学校行事', '事業所行事', '送迎予定', '提出期限', 'その他'
  )),
  event_date date not null,
  end_date date,
  all_day boolean not null default false,
  start_time time,
  end_time time,
  location text,
  recorder_profile_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(recorder_profile_ids) = 'array'),
  child_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(child_ids) = 'array'),
  note text,
  notification_enabled boolean not null default false,
  visibility text not null default '全体' check (visibility in ('全体', '関係者のみ', '管理者のみ')),
  color text not null default '#0f766e',
  recurrence text not null default 'なし' check (recurrence in ('なし', '毎日', '毎週', '毎月')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  check (end_date is null or end_date >= event_date),
  check (all_day or start_time is not null),
  check (end_time is null or start_time is null or start_time < end_time)
);

create index if not exists calendar_events_org_date_idx
  on public.calendar_events(organization_id, event_date, start_time);

create table if not exists public.calendar_notification_deliveries (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  calendar_event_id uuid not null,
  occurrence_date date not null,
  sent_at timestamptz not null default now(),
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  primary key (organization_id, id),
  unique (organization_id, calendar_event_id, occurrence_date),
  foreign key (organization_id, calendar_event_id)
    references public.calendar_events(organization_id, id) on delete cascade
);

create index if not exists calendar_notification_deliveries_event_idx
  on public.calendar_notification_deliveries(organization_id, calendar_event_id, occurrence_date desc);

create table if not exists public.attendance_records (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  recorder_profile_id uuid not null,
  work_date date not null,
  scheduled_start_time time,
  scheduled_end_time time,
  status text not null default '勤務予定' check (status in (
    '勤務予定', '出勤中', '休憩中', '退勤済み', '遅刻', '早退', '欠勤', '有給', '公休', '研修'
  )),
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  break_periods jsonb not null default '[]'::jsonb check (jsonb_typeof(break_periods) = 'array'),
  note text,
  device_id text,
  last_action_by_recorder_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, recorder_profile_id, work_date),
  foreign key (organization_id, recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete restrict,
  foreign key (organization_id, last_action_by_recorder_id)
    references public.recorder_profiles(organization_id, id) on delete restrict,
  check (scheduled_end_time is null or scheduled_start_time is null or scheduled_start_time < scheduled_end_time),
  check (clock_out_at is null or clock_in_at is null or clock_in_at <= clock_out_at)
);

create index if not exists attendance_records_org_date_idx
  on public.attendance_records(organization_id, work_date, status);

create table if not exists public.attendance_correction_requests (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  attendance_record_id uuid not null,
  recorder_profile_id uuid not null,
  requested_clock_in_at timestamptz,
  requested_clock_out_at timestamptz,
  reason text not null check (char_length(trim(reason)) between 1 and 1000),
  status text not null default '申請中' check (status in ('申請中', '承認', '却下')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, attendance_record_id)
    references public.attendance_records(organization_id, id) on delete cascade,
  foreign key (organization_id, recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete restrict
);

create index if not exists attendance_corrections_org_status_idx
  on public.attendance_correction_requests(organization_id, status, created_at desc);

create table if not exists public.vehicles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  registration_number text,
  capacity integer not null default 4 check (capacity between 1 and 30),
  wheelchair_accessible boolean not null default false,
  inspection_due_date date,
  available boolean not null default true,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create unique index if not exists vehicles_org_name_unique_idx
  on public.vehicles(organization_id, lower(name));

create table if not exists public.transport_runs (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  service_date date not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  direction text not null check (direction in ('迎え', '送り')),
  start_time time not null,
  end_time time not null,
  driver_recorder_profile_id uuid,
  assistant_recorder_profile_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(assistant_recorder_profile_ids) = 'array'),
  vehicle_id uuid,
  stops jsonb not null default '[]'::jsonb check (jsonb_typeof(stops) = 'array'),
  guardian_note text,
  operation_note text,
  status text not null default '未出発' check (status in (
    '未出発', '出発済み', '乗車済み', '事業所到着', '降車済み', '帰着'
  )),
  status_updated_at timestamptz,
  status_updated_by_recorder_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, driver_recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete restrict,
  foreign key (organization_id, status_updated_by_recorder_id)
    references public.recorder_profiles(organization_id, id) on delete restrict,
  foreign key (organization_id, vehicle_id)
    references public.vehicles(organization_id, id) on delete restrict,
  check (start_time < end_time)
);

create index if not exists transport_runs_org_date_idx
  on public.transport_runs(organization_id, service_date, start_time);

alter table public.handover_items
  add column if not exists transport_run_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'handover_items_transport_run_fk'
      and conrelid = 'public.handover_items'::regclass
  ) then
    alter table public.handover_items
      add constraint handover_items_transport_run_fk
      foreign key (organization_id, transport_run_id)
      references public.transport_runs(organization_id, id) on delete set null (transport_run_id);
  end if;
end $$;

create or replace function public.prepare_today_operations_write()
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

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'calendar_events', 'attendance_records', 'attendance_correction_requests',
    'vehicles', 'transport_runs'
  ] loop
    execute format('drop trigger if exists %I_prepare_before on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_prepare_before before insert on public.%I for each row execute function public.prepare_today_operations_write()',
      table_name, table_name
    );
    execute format('drop trigger if exists %I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
    execute format('drop trigger if exists audit_%I_after on public.%I', table_name, table_name);
    execute format(
      'create trigger audit_%I_after after insert or update or delete on public.%I for each row execute function public.write_audit_log()',
      table_name, table_name
    );
  end loop;
end $$;

alter table public.calendar_events enable row level security;
alter table public.calendar_notification_deliveries enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_correction_requests enable row level security;
alter table public.vehicles enable row level security;
alter table public.transport_runs enable row level security;

create policy calendar_events_select on public.calendar_events for select
  using (
    organization_id = public.current_organization_id()
    and (visibility <> '管理者のみ' or public.current_user_role() in ('manager', 'admin'))
  );
create policy calendar_events_write on public.calendar_events for all
  using (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'))
  with check (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'));

create policy attendance_records_select on public.attendance_records for select
  using (organization_id = public.current_organization_id());
create policy attendance_records_write on public.attendance_records for all
  using (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'))
  with check (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'));

create policy attendance_corrections_select on public.attendance_correction_requests for select
  using (organization_id = public.current_organization_id());
create policy attendance_corrections_manage on public.attendance_correction_requests for update
  using (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'))
  with check (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'));

create policy vehicles_select on public.vehicles for select
  using (organization_id = public.current_organization_id());
create policy vehicles_write on public.vehicles for all
  using (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'))
  with check (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'));

create policy transport_runs_select on public.transport_runs for select
  using (organization_id = public.current_organization_id());
create policy transport_runs_write on public.transport_runs for all
  using (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'))
  with check (organization_id = public.current_organization_id() and public.current_user_role() in ('manager', 'admin'));

grant select, insert, update, delete on public.calendar_events to authenticated;
grant all on public.calendar_notification_deliveries to service_role;
grant select, insert, update, delete on public.attendance_records to authenticated;
grant select, update on public.attendance_correction_requests to authenticated;
grant select, insert, update, delete on public.vehicles to authenticated;
grant select, insert, update, delete on public.transport_runs to authenticated;

create or replace function public.punch_attendance(
  p_organization_id uuid,
  p_recorder_profile_id uuid,
  p_pin text,
  p_action text,
  p_device_id text
)
returns setof public.attendance_records
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  work_day date := (timezone('Asia/Tokyo', now()))::date;
  current_row public.attendance_records%rowtype;
  break_count integer;
begin
  if p_organization_id is distinct from public.current_organization_id() or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Attendance access denied.';
  end if;
  if p_action not in ('出勤', '退勤', '休憩開始', '休憩終了') then
    raise exception using errcode = '22023', message = 'Unsupported attendance action.';
  end if;
  if not exists (
    select 1 from public.recorder_profiles
    where organization_id = p_organization_id
      and id = p_recorder_profile_id
      and active = true
      and pin_configured = true
      and pin_hash = crypt(coalesce(p_pin, ''), pin_hash)
  ) then
    raise exception using errcode = '42501', message = 'ATTENDANCE_PIN_INVALID';
  end if;

  select * into current_row
  from public.attendance_records
  where organization_id = p_organization_id
    and recorder_profile_id = p_recorder_profile_id
    and work_date = work_day
  for update;

  if p_action = '出勤' then
    if not found then
      insert into public.attendance_records (
        organization_id, recorder_profile_id, work_date, status, clock_in_at,
        device_id, last_action_by_recorder_id, created_by
      ) values (
        p_organization_id, p_recorder_profile_id, work_day, '出勤中', now(),
        nullif(trim(coalesce(p_device_id, '')), ''), p_recorder_profile_id, auth.uid()
      ) returning * into current_row;
    else
      if current_row.clock_in_at is not null then
        raise exception using errcode = 'P0001', message = 'ATTENDANCE_ALREADY_CLOCKED_IN';
      end if;
      update public.attendance_records
      set clock_in_at = now(), status = '出勤中', device_id = nullif(trim(coalesce(p_device_id, '')), ''),
          last_action_by_recorder_id = p_recorder_profile_id
      where organization_id = p_organization_id and id = current_row.id
      returning * into current_row;
    end if;
  elsif not found or current_row.clock_in_at is null then
    raise exception using errcode = 'P0001', message = 'ATTENDANCE_NOT_CLOCKED_IN';
  elsif p_action = '休憩開始' then
    if current_row.status = '休憩中' then
      raise exception using errcode = 'P0001', message = 'ATTENDANCE_BREAK_ALREADY_STARTED';
    end if;
    update public.attendance_records
    set break_periods = coalesce(break_periods, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('startedAt', now()::text)),
        status = '休憩中', device_id = nullif(trim(coalesce(p_device_id, '')), ''),
        last_action_by_recorder_id = p_recorder_profile_id
    where organization_id = p_organization_id and id = current_row.id
    returning * into current_row;
  elsif p_action = '休憩終了' then
    break_count := jsonb_array_length(coalesce(current_row.break_periods, '[]'::jsonb));
    if current_row.status <> '休憩中' or break_count = 0 then
      raise exception using errcode = 'P0001', message = 'ATTENDANCE_BREAK_NOT_STARTED';
    end if;
    update public.attendance_records
    set break_periods = jsonb_set(
          break_periods,
          array[(break_count - 1)::text, 'endedAt'],
          to_jsonb(now()::text),
          true
        ),
        status = '出勤中', device_id = nullif(trim(coalesce(p_device_id, '')), ''),
        last_action_by_recorder_id = p_recorder_profile_id
    where organization_id = p_organization_id and id = current_row.id
    returning * into current_row;
  else
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
        clock_out_at = now(), status = '退勤済み',
        device_id = nullif(trim(coalesce(p_device_id, '')), ''),
        last_action_by_recorder_id = p_recorder_profile_id
    where organization_id = p_organization_id and id = current_row.id
    returning * into current_row;
  end if;

  return next current_row;
end;
$$;

create or replace function public.request_attendance_correction(
  p_organization_id uuid,
  p_attendance_record_id uuid,
  p_recorder_profile_id uuid,
  p_pin text,
  p_clock_in_at timestamptz,
  p_clock_out_at timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_id uuid;
begin
  if p_organization_id is distinct from public.current_organization_id() or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Attendance access denied.';
  end if;
  if not exists (
    select 1 from public.recorder_profiles
    where organization_id = p_organization_id and id = p_recorder_profile_id and active = true
      and pin_configured = true and pin_hash = crypt(coalesce(p_pin, ''), pin_hash)
  ) then
    raise exception using errcode = '42501', message = 'ATTENDANCE_PIN_INVALID';
  end if;
  if not exists (
    select 1 from public.attendance_records
    where organization_id = p_organization_id and id = p_attendance_record_id
      and recorder_profile_id = p_recorder_profile_id
  ) then
    raise exception using errcode = 'P0002', message = 'Attendance record not found.';
  end if;
  insert into public.attendance_correction_requests (
    organization_id, attendance_record_id, recorder_profile_id,
    requested_clock_in_at, requested_clock_out_at, reason, created_by
  ) values (
    p_organization_id, p_attendance_record_id, p_recorder_profile_id,
    p_clock_in_at, p_clock_out_at, trim(p_reason), auth.uid()
  ) returning id into request_id;
  return request_id;
end;
$$;

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
     or public.current_user_role() not in ('manager', 'admin') then
    raise exception using errcode = '42501', message = 'Manager access required.';
  end if;
  select * into correction from public.attendance_correction_requests
  where organization_id = p_organization_id and id = p_request_id and status = '申請中'
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Correction request not found.'; end if;
  select display_name into reviewer_name from public.profiles where id = auth.uid();
  if p_approved then
    update public.attendance_records
    set clock_in_at = correction.requested_clock_in_at,
        clock_out_at = correction.requested_clock_out_at
    where organization_id = p_organization_id and id = correction.attendance_record_id;
  end if;
  update public.attendance_correction_requests
  set status = case when p_approved then '承認' else '却下' end,
      reviewed_by = auth.uid(), reviewed_by_name = reviewer_name,
      reviewed_at = now(), review_note = nullif(trim(coalesce(p_review_note, '')), '')
  where organization_id = p_organization_id and id = p_request_id;
end;
$$;

create or replace function public.update_transport_run_status(
  p_organization_id uuid,
  p_transport_run_id uuid,
  p_recorder_profile_id uuid,
  p_pin text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  run_row public.transport_runs%rowtype;
begin
  if p_organization_id is distinct from public.current_organization_id() or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Transport access denied.';
  end if;
  if p_status not in ('未出発', '出発済み', '乗車済み', '事業所到着', '降車済み', '帰着') then
    raise exception using errcode = '22023', message = 'Unsupported transport status.';
  end if;
  if not exists (
    select 1 from public.recorder_profiles
    where organization_id = p_organization_id and id = p_recorder_profile_id and active = true
      and pin_configured = true and pin_hash = crypt(coalesce(p_pin, ''), pin_hash)
  ) then
    raise exception using errcode = '42501', message = 'TRANSPORT_PIN_INVALID';
  end if;
  select * into run_row from public.transport_runs
  where organization_id = p_organization_id and id = p_transport_run_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Transport run not found.'; end if;
  if public.current_user_role() = 'staff'
     and run_row.driver_recorder_profile_id is distinct from p_recorder_profile_id
     and not (run_row.assistant_recorder_profile_ids ? p_recorder_profile_id::text) then
    raise exception using errcode = '42501', message = 'TRANSPORT_NOT_ASSIGNED';
  end if;
  update public.transport_runs
  set status = p_status, status_updated_at = now(), status_updated_by_recorder_id = p_recorder_profile_id
  where organization_id = p_organization_id and id = p_transport_run_id;
end;
$$;

revoke all on function public.punch_attendance(uuid, uuid, text, text, text) from public;
grant execute on function public.punch_attendance(uuid, uuid, text, text, text) to authenticated;
revoke all on function public.request_attendance_correction(uuid, uuid, uuid, text, timestamptz, timestamptz, text) from public;
grant execute on function public.request_attendance_correction(uuid, uuid, uuid, text, timestamptz, timestamptz, text) to authenticated;
revoke all on function public.review_attendance_correction(uuid, uuid, boolean, text) from public;
grant execute on function public.review_attendance_correction(uuid, uuid, boolean, text) to authenticated;
revoke all on function public.update_transport_run_status(uuid, uuid, uuid, text, text) from public;
grant execute on function public.update_transport_run_status(uuid, uuid, uuid, text, text) to authenticated;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'calendar_events', 'attendance_records', 'attendance_correction_requests',
      'vehicles', 'transport_runs'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;
