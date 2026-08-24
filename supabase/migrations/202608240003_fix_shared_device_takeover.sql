-- Make record-draft takeover use the same approved-device token that the
-- frontend uses for normal record writes. PostgREST does not guarantee that a
-- custom HTTP header remains visible after a nested SECURITY DEFINER call, so
-- the takeover RPC also passes the token explicitly for trigger validation.

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
  -- Email-based management sessions keep the normal facility workflow even
  -- when their login profile is linked to a recorder profile.
  if public.current_user_role() in ('manager', 'admin') then
    return 'unmanaged';
  end if;

  -- The legacy shared staff login is not bound to one recorder. Individual
  -- staff-ID sessions must use an approved physical device.
  if public.current_recorder_profile_id() is null then
    return 'unmanaged';
  end if;

  begin
    request_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    request_headers := '{}'::jsonb;
  end;

  raw_token := request_headers ->> 'x-support-device-token';

  -- Bulk takeover passes the token through a transaction-local setting. This
  -- is a fallback only; the database still verifies the token hash, approval
  -- status, organization and device kind below.
  if coalesce(raw_token, '') !~ '^[A-Fa-f0-9]{64}$' then
    raw_token := current_setting('app.support_device_token', true);
  end if;

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

-- Linking manager/admin accounts to recorder_profiles must not accidentally
-- apply the individual-staff personal-device write restriction to them.
create or replace function public.prevent_personal_device_record_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() not in ('manager', 'admin')
     and public.current_recorder_profile_id() is not null
     and public.current_request_device_kind() <> 'facility_shared' then
    raise exception using
      errcode = '42501',
      message = 'PERSONAL_TRANSPORT_ONLY: 個人端末では支援経過記録を入力・変更できません。事業所共有端末を使用してください。';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.prevent_personal_device_record_mutation() from public;

-- Five-argument overload used by current clients. The established four-
-- argument function continues to contain the transactional transfer logic.
create or replace function public.take_over_record_draft_children(
  p_organization_id uuid,
  p_items jsonb,
  p_target_draft_key text,
  p_recorder_profile_id uuid,
  p_device_token text
)
returns table(
  new_revision bigint,
  saved_at timestamptz,
  draft_payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.support_device_token', coalesce(p_device_token, ''), true);

  return query
    select transferred.new_revision, transferred.saved_at, transferred.draft_payload
    from public.take_over_record_draft_children(
      p_organization_id,
      p_items,
      p_target_draft_key,
      p_recorder_profile_id
    ) as transferred;
end;
$$;

revoke all on function public.take_over_record_draft_children(uuid, jsonb, text, uuid, text) from public;
grant execute on function public.take_over_record_draft_children(uuid, jsonb, text, uuid, text) to authenticated;

create or replace function public.take_over_record_draft_children_into_existing(
  p_organization_id uuid,
  p_items jsonb,
  p_target_draft_key text,
  p_recorder_profile_id uuid,
  p_device_token text
)
returns table(
  new_revision bigint,
  saved_at timestamptz,
  draft_payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.support_device_token', coalesce(p_device_token, ''), true);

  return query
    select transferred.new_revision, transferred.saved_at, transferred.draft_payload
    from public.take_over_record_draft_children_into_existing(
      p_organization_id,
      p_items,
      p_target_draft_key,
      p_recorder_profile_id
    ) as transferred;
end;
$$;

revoke all on function public.take_over_record_draft_children_into_existing(uuid, jsonb, text, uuid, text) from public;
grant execute on function public.take_over_record_draft_children_into_existing(uuid, jsonb, text, uuid, text) to authenticated;
