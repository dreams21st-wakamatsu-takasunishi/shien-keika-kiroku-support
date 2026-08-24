-- The recorder roster intentionally uses column-level SELECT privileges so
-- sensitive values such as pin_hash and auth_user_id are never exposed to the
-- browser. Add only the newly introduced part-time schedule fields to the
-- authenticated roster view.

grant select (
  part_time_weekday_work_days,
  part_time_weekday_start_time,
  part_time_weekday_end_time,
  part_time_holiday_work_days,
  part_time_holiday_start_time,
  part_time_holiday_end_time
) on public.recorder_profiles to authenticated;
