alter table public.schools
  add column if not exists holiday_periods jsonb not null default '[]'::jsonb;

alter table public.schools
  drop constraint if exists schools_holiday_periods_array_check;

alter table public.schools
  add constraint schools_holiday_periods_array_check
  check (jsonb_typeof(holiday_periods) = 'array');

comment on column public.schools.holiday_periods is
  'School-specific vacation periods used to select holiday service schedules.';
