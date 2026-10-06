-- Email logins do not run the staff-ID device enrollment. Allow the same
-- authenticated operational identity to request a personal device, never to
-- approve it, change its owner, or convert a facility scanner.
create or replace function public.personal_staff_qr_registration_identity()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  profile_value public.profiles%rowtype;
  recorder_value public.recorder_profiles%rowtype;
  recorder_id uuid := public.current_recorder_profile_id();
begin
  select * into profile_value from public.profiles where id = auth.uid() for share;
  select * into recorder_value from public.recorder_profiles where id = recorder_id for share;
  if auth.uid() is null or profile_value.active is not true or recorder_value.active is not true
    or profile_value.organization_id is distinct from recorder_value.organization_id then
    raise exception 'STAFF_QR_ACCOUNT_UNAVAILABLE' using errcode = '42501';
  end if;
  if profile_value.recorder_profile_id is not null then
    if profile_value.recorder_profile_id <> recorder_id
      or (recorder_value.auth_user_id = auth.uid() and recorder_value.individual_login_enabled is not true) then
      raise exception 'STAFF_QR_ACCOUNT_UNAVAILABLE' using errcode = '42501';
    end if;
  elsif recorder_value.auth_user_id is distinct from auth.uid() or recorder_value.individual_login_enabled is not true then
    raise exception 'STAFF_QR_ACCOUNT_UNAVAILABLE' using errcode = '42501';
  end if;
  return jsonb_build_object('organizationId', profile_value.organization_id,
    'recorderProfileId', recorder_id, 'displayName', recorder_value.display_name);
end;
$$;
revoke all on function public.personal_staff_qr_registration_identity() from public, anon, authenticated;

create or replace function public.get_personal_staff_qr_device(p_device_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  identity_value jsonb := public.personal_staff_qr_registration_identity();
  device_value public.organization_devices%rowtype;
  state_value text;
begin
  if p_device_token is null or p_device_token !~* '^[a-f0-9]{64}$' then
    raise exception 'STAFF_QR_DEVICE_TOKEN_INVALID' using errcode = '22023';
  end if;
  select * into device_value from public.organization_devices
    where organization_id = (identity_value->>'organizationId')::uuid
      and token_hash = encode(extensions.digest(p_device_token, 'sha256'), 'hex');
  state_value := case
    when device_value.id is null then 'unregistered'
    when device_value.device_kind = 'facility_shared' then 'facility_shared'
    when device_value.owner_recorder_profile_id is distinct from (identity_value->>'recorderProfileId')::uuid then 'other_owner'
    else device_value.status end;
  -- Do not reveal another staff member's label or device identity.
  return jsonb_build_object('state', state_value, 'displayName', identity_value->>'displayName')
    || case when state_value in ('pending', 'approved', 'revoked')
      then jsonb_build_object('label', device_value.label) else '{}'::jsonb end;
end;
$$;
revoke all on function public.get_personal_staff_qr_device(text) from public, anon;
grant execute on function public.get_personal_staff_qr_device(text) to authenticated;

create or replace function public.request_personal_staff_qr_device(p_device_token text, p_label text, p_platform text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  identity_value jsonb := public.personal_staff_qr_registration_identity();
  organization_id_value uuid := (identity_value->>'organizationId')::uuid;
  recorder_id_value uuid := (identity_value->>'recorderProfileId')::uuid;
  token_hash_value text;
  label_value text := btrim(p_label);
  device_value public.organization_devices%rowtype;
begin
  if p_device_token is null or p_device_token !~* '^[a-f0-9]{64}$' then
    raise exception 'STAFF_QR_DEVICE_TOKEN_INVALID' using errcode = '22023';
  end if;
  if label_value is null or char_length(label_value) not between 1 and 160 then
    raise exception '端末名は1〜160文字で入力してください。' using errcode = '22023';
  end if;
  token_hash_value := encode(extensions.digest(p_device_token, 'sha256'), 'hex');
  -- Serialize duplicate requests for this browser, including the first insert.
  perform pg_advisory_xact_lock(hashtextextended(organization_id_value::text || token_hash_value, 0));
  select * into device_value from public.organization_devices
    where organization_id = organization_id_value and token_hash = token_hash_value for update;
  if device_value.id is not null then
    if device_value.device_kind = 'facility_shared' then
      raise exception 'STAFF_QR_DEVICE_SHARED' using errcode = '42501';
    end if;
    if device_value.owner_recorder_profile_id is distinct from recorder_id_value then
      raise exception 'STAFF_QR_DEVICE_OTHER_OWNER' using errcode = '42501';
    end if;
    if device_value.status = 'revoked' then
      raise exception 'STAFF_QR_DEVICE_REVOKED' using errcode = '42501';
    end if;
    -- Repeated submissions preserve approval, name, and ownership.
    return public.get_personal_staff_qr_device(p_device_token);
  end if;
  begin
    insert into public.organization_devices(organization_id, token_hash, label, platform,
      device_kind, owner_recorder_profile_id, status, transport_mode_only)
    values(organization_id_value, token_hash_value, label_value, left(p_platform, 500),
      'personal', recorder_id_value, 'pending', true);
  exception when unique_violation then
    raise exception 'DEVICE_LABEL_DUPLICATE' using errcode = '23505';
  end;
  return public.get_personal_staff_qr_device(p_device_token);
end;
$$;
revoke all on function public.request_personal_staff_qr_device(text, text, text) from public, anon;
grant execute on function public.request_personal_staff_qr_device(text, text, text) to authenticated;
notify pgrst, 'reload schema';
