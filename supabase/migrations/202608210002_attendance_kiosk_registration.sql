-- Allow an administrator or manager physically operating the entrance tablet
-- to register that browser as the approved facility attendance kiosk.

create or replace function public.register_attendance_kiosk_device(
  p_device_token text,
  p_label text,
  p_platform text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  organization_id_value uuid := public.current_organization_id();
  device_id_value uuid;
  token_digest text;
begin
  if auth.uid() is null
     or organization_id_value is null
     or public.current_user_role() not in ('manager', 'admin') then
    raise exception using errcode = '42501', message = 'ATTENDANCE_KIOSK_MANAGE_REQUIRED';
  end if;
  if coalesce(p_device_token, '') !~ '^[A-Fa-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'ATTENDANCE_DEVICE_TOKEN_INVALID';
  end if;

  token_digest := encode(digest(p_device_token, 'sha256'), 'hex');
  select id into device_id_value
  from public.organization_devices
  where organization_id = organization_id_value
    and token_hash = token_digest
  for update;

  if device_id_value is null then
    insert into public.organization_devices (
      organization_id, token_hash, label, platform, device_kind,
      owner_recorder_profile_id, status, transport_mode_only,
      approved_by, approved_at, last_seen_at
    ) values (
      organization_id_value,
      token_digest,
      left(coalesce(nullif(trim(p_label), ''), '玄関QR端末'), 160),
      nullif(trim(coalesce(p_platform, '')), ''),
      'facility_shared', null, 'approved', false,
      auth.uid(), now(), now()
    ) returning id into device_id_value;
  else
    update public.organization_devices
    set label = left(coalesce(nullif(trim(p_label), ''), label), 160),
        platform = coalesce(nullif(trim(coalesce(p_platform, '')), ''), platform),
        device_kind = 'facility_shared',
        owner_recorder_profile_id = null,
        status = 'approved',
        transport_mode_only = false,
        approved_by = auth.uid(),
        approved_at = now(),
        revoked_by = null,
        revoked_at = null,
        last_seen_at = now(),
        updated_at = now()
    where id = device_id_value;
  end if;

  return device_id_value;
end;
$$;

revoke all on function public.register_attendance_kiosk_device(text, text, text) from public;
grant execute on function public.register_attendance_kiosk_device(text, text, text) to authenticated;
