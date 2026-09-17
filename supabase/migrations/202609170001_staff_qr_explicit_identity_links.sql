-- The personal QR already carries the authenticated issuer's user_id. Do not
-- infer that user from recorder_profiles.auth_user_id: an operational recorder
-- can also have an explicitly linked email login. Match the normal profile
-- link precedence, without changing links, roles or device approvals.
create or replace function public.validate_staff_qr_identity(p_user_id uuid, p_recorder_id uuid, p_issuer_id uuid)
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
    or recorder_value.organization_id is distinct from profile_value.organization_id then
    raise exception 'STAFF_QR_ACCOUNT_UNAVAILABLE';
  end if;

  if profile_value.recorder_profile_id is not null then
    -- Use this login's explicit operational identity, not another account that
    -- happens to have staff-ID credentials for the same member of the roster.
    if profile_value.recorder_profile_id <> p_recorder_id then
      raise exception 'STAFF_QR_ACCOUNT_UNAVAILABLE';
    end if;
    -- An explicitly linked staff-ID account still cannot bypass its own stop.
    if recorder_value.auth_user_id = p_user_id and recorder_value.individual_login_enabled is not true then
      raise exception 'STAFF_QR_ACCOUNT_UNAVAILABLE';
    end if;
  elsif recorder_value.auth_user_id is distinct from p_user_id or recorder_value.individual_login_enabled is not true then
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

notify pgrst, 'reload schema';
