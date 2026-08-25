-- Multi-day shift request defaults and monthly school schedule confirmation.

alter table public.recorder_profiles
  add column if not exists shift_request_default_start_time time,
  add column if not exists shift_request_default_end_time time;

update public.recorder_profiles
set shift_request_default_start_time = coalesce(shift_request_default_start_time, part_time_weekday_start_time, '09:00'::time),
    shift_request_default_end_time = coalesce(shift_request_default_end_time, part_time_weekday_end_time, '18:00'::time)
where shift_request_default_start_time is null
   or shift_request_default_end_time is null;

alter table public.recorder_profiles
  drop constraint if exists recorder_profiles_shift_request_default_time_check;
alter table public.recorder_profiles
  add constraint recorder_profiles_shift_request_default_time_check
  check (
    shift_request_default_start_time is null
    or shift_request_default_end_time is null
    or shift_request_default_start_time < shift_request_default_end_time
  );

grant select (
  shift_request_default_start_time,
  shift_request_default_end_time
) on public.recorder_profiles to authenticated;

create or replace function public.update_shift_request_defaults(
  p_recorder_profile_id uuid,
  p_start_time time,
  p_end_time time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_org uuid;
begin
  actor_org := public.current_organization_id();
  if actor_org is null then
    raise exception using errcode = '42501', message = 'ORGANIZATION_REQUIRED';
  end if;
  if p_start_time is null or p_end_time is null or p_start_time >= p_end_time then
    raise exception using errcode = '22023', message = 'INVALID_SHIFT_REQUEST_DEFAULT_TIME';
  end if;
  if not exists (
    select 1 from public.recorder_profiles
    where organization_id = actor_org and id = p_recorder_profile_id and active = true
  ) then
    raise exception using errcode = '42501', message = 'RECORDER_NOT_AVAILABLE';
  end if;

  update public.recorder_profiles
  set shift_request_default_start_time = p_start_time,
      shift_request_default_end_time = p_end_time
  where organization_id = actor_org and id = p_recorder_profile_id;
end;
$$;

revoke all on function public.update_shift_request_defaults(uuid, time, time) from public;
grant execute on function public.update_shift_request_defaults(uuid, time, time) to authenticated;

alter table public.schools
  add column if not exists dismissal_schedule_confirmations jsonb not null default '[]'::jsonb;

alter table public.schools
  drop constraint if exists schools_dismissal_schedule_confirmations_array_check;
alter table public.schools
  add constraint schools_dismissal_schedule_confirmations_array_check
  check (jsonb_typeof(dismissal_schedule_confirmations) = 'array');

comment on column public.schools.dismissal_schedule_confirmations is
  'Monthly confirmations that the school dismissal timetable and events were reviewed.';
