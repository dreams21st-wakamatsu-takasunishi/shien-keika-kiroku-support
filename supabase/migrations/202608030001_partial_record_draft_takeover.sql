-- Split one child's record from a shared multi-child draft and transfer only
-- that child to the authenticated coworker. The source and target changes are
-- performed in one transaction to prevent duplicate ownership.

create or replace function public.take_over_record_draft_child(
  p_organization_id uuid,
  p_source_draft_key text,
  p_child_id text,
  p_target_draft_key text,
  p_recorder_profile_id uuid default null
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
declare
  source_row public.record_drafts%rowtype;
  saved_row public.record_drafts%rowtype;
  target_recorder_name text;
  remaining_child_ids jsonb;
  source_payload jsonb;
  target_payload jsonb;
begin
  if p_organization_id is distinct from public.current_organization_id()
     or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Draft access denied.';
  end if;

  if p_source_draft_key not like 'record-%'
     or p_target_draft_key not like 'record-%'
     or p_source_draft_key = p_target_draft_key
     or nullif(trim(coalesce(p_child_id, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Valid source, target, and child identifiers are required.';
  end if;

  select *
  into source_row
  from public.record_drafts
  where organization_id = p_organization_id
    and draft_key = p_source_draft_key
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Draft not found.';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(source_row.payload -> 'selectedChildIds') = 'array'
          then source_row.payload -> 'selectedChildIds'
        else '[]'::jsonb
      end
    ) as selected_child(child_id)
    where selected_child.child_id = p_child_id
  ) then
    raise exception using errcode = '22023', message = 'The selected child is not in this draft.';
  end if;

  if coalesce(jsonb_typeof(source_row.payload -> 'childDrafts'), '') <> 'object'
     or not coalesce((source_row.payload -> 'childDrafts') ? p_child_id, false) then
    raise exception using errcode = '22023', message = 'The selected child draft payload is missing.';
  end if;

  if p_recorder_profile_id is not null then
    select display_name
    into target_recorder_name
    from public.recorder_profiles
    where organization_id = p_organization_id
      and id = p_recorder_profile_id
      and active = true;

    if target_recorder_name is null then
      raise exception using errcode = '22023', message = 'The selected recorder profile is not available.';
    end if;
  else
    select display_name
    into target_recorder_name
    from public.profiles
    where id = auth.uid()
      and organization_id = p_organization_id
      and active = true;
  end if;

  if target_recorder_name is null then
    raise exception using errcode = '42501', message = 'Active user profile not found.';
  end if;

  select coalesce(jsonb_agg(selected_child.child_id), '[]'::jsonb)
  into remaining_child_ids
  from jsonb_array_elements_text(source_row.payload -> 'selectedChildIds')
    as selected_child(child_id)
  where selected_child.child_id <> p_child_id;

  target_payload := coalesce(source_row.payload, '{}'::jsonb)
    || jsonb_build_object(
      'selectedChildIds', jsonb_build_array(p_child_id),
      'activeChildId', p_child_id,
      'childDrafts', jsonb_build_object(
        p_child_id,
        source_row.payload -> 'childDrafts' -> p_child_id
      ),
      'childStepIds', case
        when jsonb_typeof(source_row.payload -> 'childStepIds') = 'object'
             and (source_row.payload -> 'childStepIds') ? p_child_id
          then jsonb_build_object(
            p_child_id,
            source_row.payload -> 'childStepIds' -> p_child_id
          )
        else '{}'::jsonb
      end,
      'recorderId', coalesce(p_recorder_profile_id::text, ''),
      'recorderName', target_recorder_name,
      'updatedAt', now()::text,
      'takenOverAt', now()::text,
      'takenOverFromUserId', source_row.user_id::text,
      'takenOverFromDraftKey', p_source_draft_key
    );

  if jsonb_array_length(remaining_child_ids) = 0 then
    delete from public.record_drafts
    where organization_id = p_organization_id
      and draft_key = p_source_draft_key;
  else
    source_payload := coalesce(source_row.payload, '{}'::jsonb)
      || jsonb_build_object(
        'selectedChildIds', remaining_child_ids,
        'activeChildId', remaining_child_ids ->> 0,
        'childDrafts', coalesce(source_row.payload -> 'childDrafts', '{}'::jsonb) - p_child_id,
        'childStepIds', coalesce(source_row.payload -> 'childStepIds', '{}'::jsonb) - p_child_id,
        'updatedAt', now()::text
      );

    update public.record_drafts
    set payload = source_payload,
        revision = revision + 1
    where organization_id = p_organization_id
      and draft_key = p_source_draft_key;
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
    p_target_draft_key,
    target_payload,
    null,
    p_recorder_profile_id,
    1
  )
  returning * into saved_row;

  return query
    select saved_row.revision, saved_row.updated_at, saved_row.payload;
end;
$$;

revoke all on function public.take_over_record_draft_child(uuid, text, text, text, uuid) from public;
grant execute on function public.take_over_record_draft_child(uuid, text, text, text, uuid) to authenticated;
