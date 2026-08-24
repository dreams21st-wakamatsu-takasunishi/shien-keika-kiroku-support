-- Classroom-manager role, configurable delegated permissions and part-time shift requests.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('staff', 'manager', 'classroom_manager', 'admin'));

alter table public.member_invitations drop constraint if exists member_invitations_role_check;
alter table public.member_invitations
  add constraint member_invitations_role_check
  check (role in ('staff', 'manager', 'classroom_manager', 'admin'));

alter table public.calendar_events drop constraint if exists calendar_events_event_type_check;
alter table public.calendar_events
  add constraint calendar_events_event_type_check
  check (event_type in (
    '通常利用', '追加利用', '欠席', '勤務予定', '会議', '外出', '朝礼', '研修',
    '保護者面談', '学校行事', '事業所行事', '送迎予定', '提出期限', 'その他'
  ));

alter table public.recorder_profiles
  add column if not exists part_time_weekday_work_days text[] not null default '{}',
  add column if not exists part_time_weekday_start_time time,
  add column if not exists part_time_weekday_end_time time,
  add column if not exists part_time_holiday_work_days text[] not null default '{}',
  add column if not exists part_time_holiday_start_time time,
  add column if not exists part_time_holiday_end_time time;

-- Classroom managers also work operational shifts, so give them the same
-- one-to-one recorder identity used by managers and administrators.
insert into public.recorder_profiles (organization_id, display_name, created_by)
select profile.organization_id, profile.display_name, profile.id
from public.profiles profile
where profile.active = true
  and profile.role = 'classroom_manager'
  and nullif(btrim(profile.display_name), '') is not null
  and not exists (
    select 1 from public.recorder_profiles recorder
    where recorder.organization_id = profile.organization_id
      and lower(btrim(recorder.display_name)) = lower(btrim(profile.display_name))
      and recorder.active = true
  )
on conflict do nothing;

with candidates as (
  select profile.id as profile_id, recorder.id as recorder_id
  from public.profiles profile
  join public.recorder_profiles recorder
    on recorder.organization_id = profile.organization_id
   and lower(btrim(recorder.display_name)) = lower(btrim(profile.display_name))
   and recorder.active = true
  where profile.recorder_profile_id is null
    and profile.role = 'classroom_manager'
    and (recorder.auth_user_id is null or recorder.auth_user_id = profile.id)
), unique_profiles as (
  select profile_id, (array_agg(recorder_id order by recorder_id))[1] as recorder_id
  from candidates
  group by profile_id
  having count(*) = 1
)
update public.profiles profile
set recorder_profile_id = candidate.recorder_id
from unique_profiles candidate
where profile.id = candidate.profile_id
  and not exists (
    select 1 from public.profiles linked
    where linked.organization_id = profile.organization_id
      and linked.recorder_profile_id = candidate.recorder_id
  );

create or replace function public.ensure_login_recorder_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_recorder_id uuid;
begin
  if new.role not in ('manager', 'classroom_manager', 'admin') or not new.active then
    return new;
  end if;

  select recorder.id into matched_recorder_id
  from public.recorder_profiles recorder
  where recorder.organization_id = new.organization_id
    and lower(btrim(recorder.display_name)) = lower(btrim(new.display_name))
    and recorder.active = true
    and (recorder.auth_user_id is null or recorder.auth_user_id = new.id)
    and not exists (
      select 1 from public.profiles linked
      where linked.organization_id = new.organization_id
        and linked.recorder_profile_id = recorder.id
        and linked.id <> new.id
    )
  limit 1;

  if matched_recorder_id is null then
    insert into public.recorder_profiles (organization_id, display_name, created_by)
    values (new.organization_id, new.display_name, new.id)
    returning id into matched_recorder_id;
  end if;

  update public.profiles
  set recorder_profile_id = matched_recorder_id
  where id = new.id and recorder_profile_id is null;
  return new;
end;
$$;

drop trigger if exists ensure_login_recorder_profile_after_insert on public.profiles;
create trigger ensure_login_recorder_profile_after_insert
  after insert or update of role, display_name, active on public.profiles
  for each row execute function public.ensure_login_recorder_profile();

create table if not exists public.organization_role_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('manager', 'classroom_manager')),
  permissions jsonb not null default '[]'::jsonb check (jsonb_typeof(permissions) = 'array'),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, role)
);

insert into public.organization_role_permissions (organization_id, role, permissions)
select id, 'manager', '["review_records","manage_children","manage_record_settings","manage_shifts","manage_calendar","manage_transport","manage_communications"]'::jsonb
from public.organizations
on conflict (organization_id, role) do nothing;

insert into public.organization_role_permissions (organization_id, role, permissions)
select id, 'classroom_manager', '["manage_shifts"]'::jsonb
from public.organizations
on conflict (organization_id, role) do nothing;

drop trigger if exists organization_role_permissions_updated_at on public.organization_role_permissions;
create trigger organization_role_permissions_updated_at
  before update on public.organization_role_permissions
  for each row execute function public.set_updated_at();

alter table public.organization_role_permissions enable row level security;
drop policy if exists organization_role_permissions_select on public.organization_role_permissions;
create policy organization_role_permissions_select on public.organization_role_permissions for select
  using (organization_id = public.current_organization_id());
drop policy if exists organization_role_permissions_write on public.organization_role_permissions;
create policy organization_role_permissions_write on public.organization_role_permissions for all
  using (organization_id = public.current_organization_id() and public.current_user_role() = 'admin')
  with check (organization_id = public.current_organization_id() and public.current_user_role() = 'admin');
grant select, insert, update, delete on public.organization_role_permissions to authenticated;

create or replace function public.current_user_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_user_role() = 'admin' then true
    when public.current_user_role() = 'staff' then false
    when public.current_user_role() in ('manager', 'classroom_manager') and p_permission = 'manage_shifts' then true
    else exists (
      select 1
      from public.organization_role_permissions permissions
      where permissions.organization_id = public.current_organization_id()
        and permissions.role = public.current_user_role()
        and permissions.permissions ? p_permission
    )
  end;
$$;
revoke all on function public.current_user_has_permission(text) from public;
grant execute on function public.current_user_has_permission(text) to authenticated;

-- Enforce delegated permissions for the records, child directory, calendar,
-- transport and communication settings exposed by the client.
drop policy if exists children_insert on public.children;
create policy children_insert on public.children for insert
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_children'));
drop policy if exists children_update on public.children;
create policy children_update on public.children for update
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_children'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_children'));

drop policy if exists templates_insert on public.record_templates;
create policy templates_insert on public.record_templates for insert
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_record_settings'));
drop policy if exists templates_update on public.record_templates;
create policy templates_update on public.record_templates for update
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_record_settings'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_record_settings'));

drop policy if exists ai_settings_insert on public.organization_ai_settings;
create policy ai_settings_insert on public.organization_ai_settings for insert
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_record_settings'));
drop policy if exists ai_settings_update on public.organization_ai_settings;
create policy ai_settings_update on public.organization_ai_settings for update
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_record_settings'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_record_settings'));

drop policy if exists records_update on public.support_records;
create policy records_update on public.support_records for update
  using (
    organization_id = public.current_organization_id()
    and (created_by = auth.uid() or public.current_user_has_permission('review_records'))
  )
  with check (organization_id = public.current_organization_id());

create or replace function public.enforce_record_workflow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
begin
  select display_name into actor_name from public.profiles where id = auth.uid();
  new.retention_until := (new.record_date + interval '5 years')::date;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := auth.uid();
    if new.approval_status in ('確認済み', '要修正') and not public.current_user_has_permission('review_records') then
      raise exception 'Only authorized reviewers can review records';
    end if;
  else
    if old.approval_status = '確認済み' and new.approval_status = '確認済み' then
      raise exception 'Approved records are locked. Mark the record as requiring revision first.';
    end if;
    if new.approval_status in ('確認済み', '要修正')
       and new.approval_status is distinct from old.approval_status
       and not public.current_user_has_permission('review_records') then
      raise exception 'Only authorized reviewers can review records';
    end if;
    new.version := old.version + 1;
    new.updated_by := auth.uid();
  end if;

  if new.approval_status = '確認済み' then
    new.reviewed_by := auth.uid();
    new.reviewer_name := actor_name;
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.locked_at := now();
  elsif new.approval_status = '要修正' then
    new.reviewed_by := auth.uid();
    new.reviewer_name := actor_name;
    new.reviewed_at := now();
    new.locked_at := null;
  else
    new.locked_at := null;
  end if;
  return new;
end;
$$;

drop policy if exists staff_schedule_items_insert on public.staff_schedule_items;
create policy staff_schedule_items_insert on public.staff_schedule_items for insert
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_shifts'));
drop policy if exists staff_schedule_items_update on public.staff_schedule_items;
create policy staff_schedule_items_update on public.staff_schedule_items for update
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_shifts'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_shifts'));
drop policy if exists staff_schedule_items_delete on public.staff_schedule_items;
create policy staff_schedule_items_delete on public.staff_schedule_items for delete
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_shifts'));

drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events for select
  using (
    organization_id = public.current_organization_id()
    and (visibility <> '管理者のみ' or public.current_user_has_permission('manage_calendar'))
  );

drop policy if exists transport_route_settings_write on public.transport_route_settings;
create policy transport_route_settings_write on public.transport_route_settings for all
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'));
drop policy if exists transport_plan_days_write on public.transport_plan_days;
create policy transport_plan_days_write on public.transport_plan_days for all
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'));
drop policy if exists daily_transport_requirements_write on public.daily_transport_requirements;
create policy daily_transport_requirements_write on public.daily_transport_requirements for all
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'));
drop policy if exists daily_child_plans_insert on public.daily_child_plans;
create policy daily_child_plans_insert on public.daily_child_plans for insert
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'));
drop policy if exists daily_child_plans_update on public.daily_child_plans;
create policy daily_child_plans_update on public.daily_child_plans for update
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'));
drop policy if exists daily_child_plans_delete on public.daily_child_plans;
create policy daily_child_plans_delete on public.daily_child_plans for delete
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'));
drop policy if exists transport_map_locations_write on public.transport_map_locations;
create policy transport_map_locations_write on public.transport_map_locations for all
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'));
drop policy if exists transport_area_zones_write on public.transport_area_zones;
create policy transport_area_zones_write on public.transport_area_zones for all
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'));
drop policy if exists schools_write on public.schools;
create policy schools_write on public.schools for all
  using (
    organization_id = public.current_organization_id()
    and (public.current_user_has_permission('manage_children') or public.current_user_has_permission('manage_transport'))
  )
  with check (
    organization_id = public.current_organization_id()
    and (public.current_user_has_permission('manage_children') or public.current_user_has_permission('manage_transport'))
  );

drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements for insert
  with check (
    organization_id = public.current_organization_id()
    and (
      public.current_user_has_permission('manage_communications')
      or (
        created_by_recorder_profile_id is not null
        and exists (
          select 1 from public.recorder_profiles
          where organization_id = public.current_organization_id()
            and id = created_by_recorder_profile_id and active = true
        )
      )
    )
  );
drop policy if exists announcements_update on public.announcements;
create policy announcements_update on public.announcements for update
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_communications'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_communications'));
drop policy if exists morning_meeting_templates_insert on public.morning_meeting_templates;
create policy morning_meeting_templates_insert on public.morning_meeting_templates for insert
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_communications'));
drop policy if exists morning_meeting_templates_update on public.morning_meeting_templates;
create policy morning_meeting_templates_update on public.morning_meeting_templates for update
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_communications'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_communications'));

create table if not exists public.staff_shift_requests (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid primary key default gen_random_uuid(),
  recorder_profile_id uuid not null references public.recorder_profiles(id) on delete restrict,
  requested_date date not null,
  requested_start_time time,
  requested_end_time time,
  note text,
  status text not null default '申請中' check (status in ('申請中', '承認', '却下')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, recorder_profile_id, requested_date)
);

drop trigger if exists staff_shift_requests_updated_at on public.staff_shift_requests;
create trigger staff_shift_requests_updated_at
  before update on public.staff_shift_requests
  for each row execute function public.set_updated_at();
drop trigger if exists audit_staff_shift_requests_after on public.staff_shift_requests;
create trigger audit_staff_shift_requests_after
  after insert or update or delete on public.staff_shift_requests
  for each row execute function public.write_audit_log();

alter table public.staff_shift_requests enable row level security;
drop policy if exists staff_shift_requests_select on public.staff_shift_requests;
create policy staff_shift_requests_select on public.staff_shift_requests for select
  using (
    organization_id = public.current_organization_id()
    and (created_by = auth.uid() or public.current_user_has_permission('manage_shifts'))
  );
drop policy if exists staff_shift_requests_insert on public.staff_shift_requests;
create policy staff_shift_requests_insert on public.staff_shift_requests for insert
  with check (organization_id = public.current_organization_id() and created_by = auth.uid());
drop policy if exists staff_shift_requests_update on public.staff_shift_requests;
create policy staff_shift_requests_update on public.staff_shift_requests for update
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_shifts'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_shifts'));
grant select, insert, update on public.staff_shift_requests to authenticated;

-- Apply delegated permissions at the database boundary for the screens covered by this release.
drop policy if exists attendance_records_write on public.attendance_records;
create policy attendance_records_write on public.attendance_records for all
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_shifts'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_shifts'));

drop policy if exists calendar_events_write on public.calendar_events;
create policy calendar_events_write on public.calendar_events for all
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_calendar'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_calendar'));

drop policy if exists vehicles_write on public.vehicles;
create policy vehicles_write on public.vehicles for all
  using (organization_id = public.current_organization_id() and public.current_user_role() = 'admin')
  with check (organization_id = public.current_organization_id() and public.current_user_role() = 'admin');

drop policy if exists transport_runs_write on public.transport_runs;
create policy transport_runs_write on public.transport_runs for all
  using (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'))
  with check (organization_id = public.current_organization_id() and public.current_user_has_permission('manage_transport'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_shift_requests'
  ) then
    alter publication supabase_realtime add table public.staff_shift_requests;
  end if;
end $$;
