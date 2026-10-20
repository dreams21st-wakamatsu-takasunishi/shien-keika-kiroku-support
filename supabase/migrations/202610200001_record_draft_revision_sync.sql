-- Compare revisions for support-record drafts on every device, including tabs
-- sharing a physical device ID. Preserve memo behavior, authorization, child
-- reservations, recorder ownership and all existing records.
begin;
create or replace function public.save_record_draft_guarded(
  p_organization_id uuid,
  p_draft_key text,
  p_payload jsonb,
  p_device_id text,
  p_expected_revision bigint default null,
  p_recorder_profile_id uuid default null
)
returns table(new_revision bigint, saved_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_row public.record_drafts%rowtype;
  current_row public.record_drafts%rowtype;
  cycle_started_at timestamptz;
  conflicting_recorder_name text;
  local_now timestamp;
begin
  if p_organization_id is distinct from public.current_organization_id()
     or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Draft access denied.';
  end if;

  if nullif(trim(coalesce(p_draft_key, '')), '') is null
     or nullif(trim(coalesce(p_device_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'Draft key and device id are required.';
  end if;

  -- One transaction at a time may reserve children for the same organization
  -- and service date. This closes the short race where two accounts select the
  -- same child before Realtime has delivered the other draft.
  if p_draft_key like 'record-%'
     and nullif(trim(coalesce(p_payload ->> 'date', '')), '') is not null
     and jsonb_typeof(p_payload -> 'selectedChildIds') = 'array' then
    perform pg_advisory_xact_lock(
      hashtextextended(
        p_organization_id::text || ':' || (p_payload ->> 'date'),
        0
      )
    );

    local_now := timezone('Asia/Tokyo', now());
    cycle_started_at := (
      case
        when local_now::time < time '03:00'
          then date_trunc('day', local_now) - interval '1 day' + interval '3 hours'
        else date_trunc('day', local_now) + interval '3 hours'
      end
    ) at time zone 'Asia/Tokyo';

    select coalesce(
      nullif(trim(existing.payload ->> 'recorderName'), ''),
      '別の職員'
    )
    into conflicting_recorder_name
    from public.record_drafts as existing
    where existing.organization_id = p_organization_id
      and existing.draft_key <> p_draft_key
      and existing.draft_key like 'record-%'
      and existing.updated_at >= cycle_started_at
      and existing.payload ->> 'date' = p_payload ->> 'date'
      and exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(existing.payload -> 'selectedChildIds') = 'array'
              then existing.payload -> 'selectedChildIds'
            else '[]'::jsonb
          end
        ) as existing_child(child_id)
        join jsonb_array_elements_text(p_payload -> 'selectedChildIds')
          as incoming_child(child_id)
          on incoming_child.child_id = existing_child.child_id
      )
    order by existing.updated_at desc
    limit 1;

    if conflicting_recorder_name is not null then
      raise exception using
        errcode = 'P0001',
        message = 'DRAFT_CHILD_LOCKED: ' || conflicting_recorder_name
          || ' is already editing one of the selected children.';
    end if;
  end if;

  select *
  into current_row
  from public.record_drafts
  where organization_id = p_organization_id
    and draft_key = p_draft_key
    and (
      p_draft_key like 'record-%'
      or user_id = auth.uid()
    )
  for update;

  if found then
    if current_row.user_id <> auth.uid() then
      raise exception using
        errcode = '42501',
        message = 'DRAFT_TAKEN_OVER: This draft is now owned by another account.';
    end if;

    if public.current_user_role() = 'staff'
       and current_row.recorder_profile_id is not null
       and p_recorder_profile_id is distinct from current_row.recorder_profile_id then
      raise exception using
        errcode = '42501',
        message = 'DRAFT_OWNED_BY_ANOTHER_RECORDER: This draft is being edited by another recorder.';
    end if;

    if (p_draft_key like 'record-%'
        or (current_row.device_id is not null and current_row.device_id <> p_device_id))
       and (p_expected_revision is null or current_row.revision <> p_expected_revision) then
      raise exception using
        errcode = 'P0001',
        message = 'DRAFT_CONFLICT: This draft was updated on another device.';
    end if;

    update public.record_drafts
    set payload = p_payload,
        device_id = p_device_id,
        recorder_profile_id = coalesce(current_row.recorder_profile_id, p_recorder_profile_id),
        revision = revision + 1
    where organization_id = p_organization_id
      and draft_key = p_draft_key
      and (
        p_draft_key like 'record-%'
        or user_id = auth.uid()
      )
    returning * into saved_row;

    return query select saved_row.revision, saved_row.updated_at;
    return;
  end if;

  -- A removed/saved draft must not be silently recreated by a stale tablet.
  if p_draft_key like 'record-%' and p_expected_revision is not null then
    raise exception using errcode = 'P0001',
      message = 'DRAFT_CONFLICT: The shared draft no longer exists. Keep local input and review record status.';
  end if;

  insert into public.record_drafts (
    organization_id,
    user_id,
    draft_key,
    payload,
    device_id,
    recorder_profile_id,
    revision
  ) values (
    p_organization_id,
    auth.uid(),
    p_draft_key,
    p_payload,
    p_device_id,
    p_recorder_profile_id,
    1
  )
  returning * into saved_row;

  return query select saved_row.revision, saved_row.updated_at;
end;
$$;
revoke all on function public.save_record_draft_guarded(uuid,text,jsonb,text,bigint,uuid) from public, anon;
grant execute on function public.save_record_draft_guarded(uuid,text,jsonb,text,bigint,uuid) to authenticated;
commit;

