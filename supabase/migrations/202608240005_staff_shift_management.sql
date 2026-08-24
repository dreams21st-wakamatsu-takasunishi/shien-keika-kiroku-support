-- Staff employment settings, reusable work templates, and monthly shift planning.

alter table public.recorder_profiles
  add column if not exists employment_type text not null default 'full_time',
  add column if not exists contracted_weekly_hours numeric(5,2);

alter table public.recorder_profiles
  drop constraint if exists recorder_profiles_employment_type_check;
alter table public.recorder_profiles
  add constraint recorder_profiles_employment_type_check
  check (employment_type in ('full_time', 'part_time'));

alter table public.recorder_profiles
  drop constraint if exists recorder_profiles_contracted_weekly_hours_check;
alter table public.recorder_profiles
  add constraint recorder_profiles_contracted_weekly_hours_check
  check (contracted_weekly_hours is null or contracted_weekly_hours between 0 and 80);

create or replace function public.protect_recorder_employment_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and coalesce(public.current_user_role(), '') <> 'admin' then
    if tg_op = 'INSERT' then
      if new.employment_type <> 'full_time' or new.contracted_weekly_hours is not null then
        raise exception using errcode = '42501', message = 'ADMIN_REQUIRED_FOR_EMPLOYMENT_SETTINGS';
      end if;
    elsif new.employment_type is distinct from old.employment_type
       or new.contracted_weekly_hours is distinct from old.contracted_weekly_hours then
      raise exception using errcode = '42501', message = 'ADMIN_REQUIRED_FOR_EMPLOYMENT_SETTINGS';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_recorder_employment_settings_before on public.recorder_profiles;
create trigger protect_recorder_employment_settings_before
  before insert or update on public.recorder_profiles
  for each row execute function public.protect_recorder_employment_settings();

grant select (employment_type, contracted_weekly_hours) on public.recorder_profiles to authenticated;

create table if not exists public.staff_shift_templates (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  target_employment_type text not null default 'all'
    check (target_employment_type in ('all', 'full_time', 'part_time')),
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 60 check (break_minutes between 0 and 480),
  weekdays jsonb not null default '[1,2,3,4,5]'::jsonb
    check (jsonb_typeof(weekdays) = 'array'),
  note text check (note is null or char_length(note) <= 1000),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  check (start_time < end_time)
);

create unique index if not exists staff_shift_templates_active_name_idx
  on public.staff_shift_templates (organization_id, lower(name))
  where active = true;

drop trigger if exists staff_shift_templates_updated_at on public.staff_shift_templates;
create trigger staff_shift_templates_updated_at
  before update on public.staff_shift_templates
  for each row execute function public.set_updated_at();

drop trigger if exists audit_staff_shift_templates_after on public.staff_shift_templates;
create trigger audit_staff_shift_templates_after
  after insert or update or delete on public.staff_shift_templates
  for each row execute function public.write_audit_log();

alter table public.staff_shift_templates enable row level security;

drop policy if exists staff_shift_templates_select on public.staff_shift_templates;
create policy staff_shift_templates_select on public.staff_shift_templates for select
  using (organization_id = public.current_organization_id());

drop policy if exists staff_shift_templates_write on public.staff_shift_templates;
create policy staff_shift_templates_write on public.staff_shift_templates for all
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() = 'admin'
  )
  with check (
    organization_id = public.current_organization_id()
    and public.current_user_role() = 'admin'
  );

grant select, insert, update, delete on public.staff_shift_templates to authenticated;
grant all on public.staff_shift_templates to service_role;

alter table public.attendance_records
  add column if not exists scheduled_break_minutes integer not null default 0
    check (scheduled_break_minutes between 0 and 480);

alter table public.attendance_records
  drop constraint if exists attendance_records_status_check;
alter table public.attendance_records
  add constraint attendance_records_status_check check (status in (
    '勤務予定', '出勤中', '休憩中', '退勤済み', '遅刻', '早退',
    '欠勤', '有給', '公休', '特別休暇', '研修'
  ));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'staff_shift_templates'
     ) then
    alter publication supabase_realtime add table public.staff_shift_templates;
  end if;
end;
$$;
