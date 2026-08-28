-- Managers may remove completed part-time shift decisions. For an approved
-- request, remove its still-unclocked attendance schedule in the same
-- transaction so the calendar and attendance plan cannot diverge.

create or replace function public.delete_reviewed_part_time_shift_request(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id_value uuid;
  request_value public.staff_shift_requests%rowtype;
  attendance_value public.attendance_records%rowtype;
  deleted_attendance_id uuid;
begin
  organization_id_value := public.current_organization_id();
  if organization_id_value is null or not public.current_user_has_permission('manage_shifts') then
    raise exception using errcode = '42501', message = 'SHIFT_REQUEST_DELETE_FORBIDDEN';
  end if;

  select request.* into request_value
  from public.staff_shift_requests request
  join public.recorder_profiles recorder
    on recorder.organization_id = request.organization_id
   and recorder.id = request.recorder_profile_id
  where request.organization_id = organization_id_value
    and request.id = p_request_id
    and recorder.employment_type = 'part_time'
  for update of request;

  if not found then
    raise exception using errcode = 'P0002', message = 'PART_TIME_SHIFT_REQUEST_NOT_FOUND';
  end if;
  if request_value.status not in ('承認', '却下') then
    raise exception using errcode = '22023', message = 'SHIFT_REQUEST_REVIEW_REQUIRED';
  end if;

  if request_value.status = '承認' then
    select attendance.* into attendance_value
    from public.attendance_records attendance
    where attendance.organization_id = organization_id_value
      and attendance.recorder_profile_id = request_value.recorder_profile_id
      and attendance.work_date = request_value.requested_date
    for update;

    if found then
      if attendance_value.clock_in_at is not null or attendance_value.clock_out_at is not null then
        raise exception using errcode = '22023', message = 'CLOCKED_SHIFT_CANNOT_BE_DELETED';
      end if;
      deleted_attendance_id := attendance_value.id;
      delete from public.attendance_records
      where organization_id = organization_id_value
        and id = attendance_value.id;
    end if;
  end if;

  delete from public.staff_shift_requests
  where organization_id = organization_id_value
    and id = request_value.id;

  return jsonb_build_object(
    'requestId', request_value.id,
    'deletedAttendanceId', deleted_attendance_id
  );
end;
$$;

revoke all on function public.delete_reviewed_part_time_shift_request(uuid) from public;
grant execute on function public.delete_reviewed_part_time_shift_request(uuid) to authenticated;
