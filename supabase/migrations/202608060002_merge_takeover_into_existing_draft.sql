-- Merge selected children into an existing draft owned by the current account.
-- The existing bulk-transfer function first creates a staging draft; this
-- function then merges it into the requested target and removes the staging row
-- in the same transaction.

create or replace function public.take_over_record_draft_children_into_existing(
  p_organization_id uuid,
  p_items jsonb,
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
  staging_draft_key text := 'record-' || gen_random_uuid()::text;
  incoming_payload jsonb;
  target_payload jsonb;
  target_row public.record_drafts%rowtype;
  saved_row public.record_drafts%rowtype;
  target_child_ids jsonb;
  incoming_child_ids jsonb;
  target_child_drafts jsonb;
  incoming_child_drafts jsonb;
  target_child_step_ids jsonb;
  incoming_child_step_ids jsonb;
begin
  if p_organization_id is distinct from public.current_organization_id()
     or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Draft access denied.';
  end if;

  if p_target_draft_key not like 'record-%'
     or exists (
       select 1
       from jsonb_array_elements(p_items) as incoming(value)
       where incoming.value ->> 'sourceDraftKey' = p_target_draft_key
     ) then
    raise exception using errcode = '22023', message = 'A valid, separate target draft is required.';
  end if;

  -- The called function validates and removes the selected children from every
  -- source. Any later failure rolls this work back together with this function.
  select transferred.draft_payload
  into incoming_payload
  from public.take_over_record_draft_children(
    p_organization_id,
    p_items,
    staging_draft_key,
    p_recorder_profile_id
  ) as transferred;

  select *
  into target_row
  from public.record_drafts
  where organization_id = p_organization_id
    and draft_key = p_target_draft_key
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'The existing target draft was not found.';
  end if;

  if target_row.user_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'The existing target draft belongs to another account.';
  end if;

  if target_row.recorder_profile_id is not null
     and p_recorder_profile_id is distinct from target_row.recorder_profile_id then
    raise exception using errcode = '42501', message = 'The existing target draft belongs to another recorder.';
  end if;

  if target_row.payload ->> 'date' is distinct from incoming_payload ->> 'date'
     or target_row.payload ->> 'selectedTemplateId' is distinct from incoming_payload ->> 'selectedTemplateId' then
    raise exception using
      errcode = '22023',
      message = 'The existing draft uses a different date or record format.';
  end if;

  target_child_ids := case
    when jsonb_typeof(target_row.payload -> 'selectedChildIds') = 'array'
      then target_row.payload -> 'selectedChildIds'
    else '[]'::jsonb
  end;
  incoming_child_ids := case
    when jsonb_typeof(incoming_payload -> 'selectedChildIds') = 'array'
      then incoming_payload -> 'selectedChildIds'
    else '[]'::jsonb
  end;

  if exists (
    select 1
    from jsonb_array_elements_text(target_child_ids) as target_child(value)
    join jsonb_array_elements_text(incoming_child_ids) as incoming_child(value)
      on incoming_child.value = target_child.value
  ) then
    raise exception using errcode = '22023', message = 'A selected child already exists in the target draft.';
  end if;

  target_child_drafts := case
    when jsonb_typeof(target_row.payload -> 'childDrafts') = 'object'
      then target_row.payload -> 'childDrafts'
    else '{}'::jsonb
  end;
  incoming_child_drafts := case
    when jsonb_typeof(incoming_payload -> 'childDrafts') = 'object'
      then incoming_payload -> 'childDrafts'
    else '{}'::jsonb
  end;
  target_child_step_ids := case
    when jsonb_typeof(target_row.payload -> 'childStepIds') = 'object'
      then target_row.payload -> 'childStepIds'
    else '{}'::jsonb
  end;
  incoming_child_step_ids := case
    when jsonb_typeof(incoming_payload -> 'childStepIds') = 'object'
      then incoming_payload -> 'childStepIds'
    else '{}'::jsonb
  end;

  target_payload := coalesce(target_row.payload, '{}'::jsonb) || jsonb_build_object(
    'selectedChildIds', target_child_ids || incoming_child_ids,
    'activeChildId', coalesce(
      nullif(target_row.payload ->> 'activeChildId', ''),
      (target_child_ids || incoming_child_ids) ->> 0
    ),
    'childDrafts', target_child_drafts || incoming_child_drafts,
    'childStepIds', target_child_step_ids || incoming_child_step_ids,
    'updatedAt', now()::text,
    'takenOverAt', incoming_payload ->> 'takenOverAt',
    'takenOverFromDraftKeys',
      case
        when jsonb_typeof(target_row.payload -> 'takenOverFromDraftKeys') = 'array'
          then target_row.payload -> 'takenOverFromDraftKeys'
        else '[]'::jsonb
      end
      || case
        when jsonb_typeof(incoming_payload -> 'takenOverFromDraftKeys') = 'array'
          then incoming_payload -> 'takenOverFromDraftKeys'
        else '[]'::jsonb
      end
  );

  update public.record_drafts
  set payload = target_payload,
      recorder_profile_id = coalesce(target_row.recorder_profile_id, p_recorder_profile_id),
      revision = revision + 1
  where organization_id = p_organization_id
    and draft_key = p_target_draft_key
  returning * into saved_row;

  delete from public.record_drafts
  where organization_id = p_organization_id
    and draft_key = staging_draft_key;

  return query
    select saved_row.revision, saved_row.updated_at, saved_row.payload;
end;
$$;

revoke all on function public.take_over_record_draft_children_into_existing(uuid, jsonb, text, uuid) from public;
grant execute on function public.take_over_record_draft_children_into_existing(uuid, jsonb, text, uuid) to authenticated;
