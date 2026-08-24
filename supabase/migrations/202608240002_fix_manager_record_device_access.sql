-- Manager/admin accounts may be linked to recorder_profiles so they can work as
-- transport drivers and record authors. That link must not make an email-based
-- management session look like an individual staff-ID/personal-device session.
create or replace function public.current_request_device_kind()
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  request_headers jsonb;
  raw_token text;
  resolved_kind text;
begin
  -- Manager and child-development-support-manager accounts use the normal
  -- facility workflow even when their login profile is linked to a recorder.
  -- This matches get_current_staff_device_access(), where these roles do not
  -- require an organization_devices approval row.
  if public.current_user_role() in ('manager', 'admin') then
    return 'unmanaged';
  end if;

  -- The legacy shared staff login is not bound to one recorder and continues to
  -- be treated as a facility workflow. Individual staff-ID sessions must present
  -- the physical device token on every write request.
  if public.current_recorder_profile_id() is null then
    return 'unmanaged';
  end if;

  begin
    request_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return 'unverified';
  end;

  raw_token := request_headers->>'x-support-device-token';
  if coalesce(raw_token, '') !~ '^[A-Fa-f0-9]{64}$' then
    return 'unverified';
  end if;

  select device.device_kind into resolved_kind
  from public.organization_devices device
  where device.organization_id = public.current_organization_id()
    and device.token_hash = encode(digest(raw_token, 'sha256'), 'hex')
    and device.status = 'approved';

  return coalesce(resolved_kind, 'unverified');
end;
$$;

revoke all on function public.current_request_device_kind() from public;
