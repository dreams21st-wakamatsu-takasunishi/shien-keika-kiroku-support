-- Transfer selected children from one or more shared drafts into one new draft.
-- Every source update and the target insert run in the same transaction so a
-- partial takeover cannot leave children split across unexpected drafts.

create or replace function public.take_over_record_draft_children(
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
  item jsonb;
  source_key text;
  child_id text;
  source_row public.record_drafts%rowtype;
  saved_row public.record_drafts%rowtype;
  target_recorder_name text;
  base_payload jsonb;
  base_date text;
  base_template_id text;
  target_payload jsonb;
  target_child_ids jsonb := '[]'::jsonb;
  target_child_drafts jsonb := '{}'::jsonb;
  target_child_step_ids jsonb := '{}'::jsonb;
  remaining_child_ids jsonb;
  remaining_child_drafts jsonb;
  remaining_child_step_ids jsonb;
begin
  if p_organization_id is distinct from public.current_organization_id()
     or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Draft access denied.';
  end if;

  if coalesce(jsonb_typeof(p_items), '') <> 'array' then
    raise exception using errcode = '22023', message = 'Takeover items must be an array.';
  end if;

  if jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 100
     or p_target_draft_key not like 'record-%' then
    raise exception using errcode = '22023', message = 'Valid takeover items and target draft key are required.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as incoming(value)
    where nullif(trim(coalesce(incoming.value ->> 'sourceDraftKey', '')), '') is null
       or nullif(trim(coalesce(incoming.value ->> 'childId', '')), '') is null
       or incoming.value ->> 'sourceDraftKey' = p_target_draft_key
  ) then
    raise exception using errcode = '22023', message = 'Every takeover item requires valid source and child identifiers.';
  end if;

  if exists (
    select incoming.value ->> 'childId'
    from jsonb_array_elements(p_items) as incoming(value)
    group by incoming.value ->> 'childId'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'The same child cannot be transferred more than once.';
  end if;

  if exists (
    select 1
    from public.record_drafts
    where organization_id = p_organization_id
      and draft_key = p_target_draft_key
  ) then
    raise exception using errcode = '23505', message = 'The target draft already exists.';
  end if;

  -- Lock every source in a stable order before validating or changing any row.
  for source_key in
    select distinct incoming.value ->> 'sourceDraftKey'
    from jsonb_array_elements(p_items) as incoming(value)
    order by 1
  loop
    select *
    into source_row
    from public.record_drafts
    where organization_id = p_organization_id
      and draft_key = source_key
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'A source draft was not found.';
    end if;
  end loop;

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

  for item in select value from jsonb_array_elements(p_items)
  loop
    source_key := item ->> 'sourceDraftKey';
    child_id := item ->> 'childId';

    select *
    into source_row
    from public.record_drafts
    where organization_id = p_organization_id
      and draft_key = source_key;

    if not exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(source_row.payload -> 'selectedChildIds') = 'array'
            then source_row.payload -> 'selectedChildIds'
          else '[]'::jsonb
        end
      ) as selected_child(value)
      where selected_child.value = child_id
    ) then
      raise exception using errcode = '22023', message = 'A selected child is not in its source draft.';
    end if;

    if coalesce(jsonb_typeof(source_row.payload -> 'childDrafts'), '') <> 'object'
       or not coalesce((source_row.payload -> 'childDrafts') ? child_id, false) then
      raise exception using errcode = '22023', message = 'A selected child draft payload is missing.';
    end if;

    if base_payload is null then
      base_payload := coalesce(source_row.payload, '{}'::jsonb);
      base_date := source_row.payload ->> 'date';
      base_template_id := source_row.payload ->> 'selectedTemplateId';
    elsif source_row.payload ->> 'date' is distinct from base_date
       or source_row.payload ->> 'selectedTemplateId' is distinct from base_template_id then
      raise exception using
        errcode = '22023',
        message = 'Selected records use different dates or record formats and cannot be combined.';
    end if;

    target_child_ids := target_child_ids || jsonb_build_array(child_id);
    target_child_drafts := target_child_drafts || jsonb_build_object(
      child_id,
      source_row.payload -> 'childDrafts' -> child_id
    );

    if jsonb_typeof(source_row.payload -> 'childStepIds') = 'object'
       and (source_row.payload -> 'childStepIds') ? child_id then
      target_child_step_ids := target_child_step_ids || jsonb_build_object(
        child_id,
        source_row.payload -> 'childStepIds' -> child_id
      );
    end if;
  end loop;

  -- Remove only the selected children from each source draft.
  for source_key in
    select distinct incoming.value ->> 'sourceDraftKey'
    from jsonb_array_elements(p_items) as incoming(value)
    order by 1
  loop
    select *
    into source_row
    from public.record_drafts
    where organization_id = p_organization_id
      and draft_key = source_key;

    select coalesce(jsonb_agg(selected_child.value order by selected_child.position), '[]'::jsonb)
    into remaining_child_ids
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(source_row.payload -> 'selectedChildIds') = 'array'
          then source_row.payload -> 'selectedChildIds'
        else '[]'::jsonb
      end
    ) with ordinality as selected_child(value, position)
    where not exists (
      select 1
      from jsonb_array_elements(p_items) as incoming(value)
      where incoming.value ->> 'sourceDraftKey' = source_key
        and incoming.value ->> 'childId' = selected_child.value
    );

    remaining_child_drafts := case
      when jsonb_typeof(source_row.payload -> 'childDrafts') = 'object'
        then source_row.payload -> 'childDrafts'
      else '{}'::jsonb
    end;
    remaining_child_step_ids := case
      when jsonb_typeof(source_row.payload -> 'childStepIds') = 'object'
        then source_row.payload -> 'childStepIds'
      else '{}'::jsonb
    end;

    for item in
      select value
      from jsonb_array_elements(p_items)
      where value ->> 'sourceDraftKey' = source_key
    loop
      child_id := item ->> 'childId';
      remaining_child_drafts := remaining_child_drafts - child_id;
      remaining_child_step_ids := remaining_child_step_ids - child_id;
    end loop;

    if jsonb_array_length(remaining_child_ids) = 0 then
      delete from public.record_drafts
      where organization_id = p_organization_id
        and draft_key = source_key;
    else
      update public.record_drafts
      set payload = coalesce(source_row.payload, '{}'::jsonb) || jsonb_build_object(
            'selectedChildIds', remaining_child_ids,
            'activeChildId', remaining_child_ids ->> 0,
            'childDrafts', remaining_child_drafts,
            'childStepIds', remaining_child_step_ids,
            'updatedAt', now()::text
          ),
          revision = revision + 1,
          updated_at = now()
      where organization_id = p_organization_id
        and draft_key = source_key;
    end if;
  end loop;

  target_payload := base_payload || jsonb_build_object(
    'selectedChildIds', target_child_ids,
    'activeChildId', target_child_ids ->> 0,
    'childDrafts', target_child_drafts,
    'childStepIds', target_child_step_ids,
    'recorderId', coalesce(p_recorder_profile_id::text, ''),
    'recorderName', target_recorder_name,
    'updatedAt', now()::text,
    'takenOverAt', now()::text,
    'takenOverFromDraftKeys', (
      select jsonb_agg(source.source_key order by source.source_key)
      from (
        select distinct incoming.value ->> 'sourceDraftKey' as source_key
        from jsonb_array_elements(p_items) as incoming(value)
      ) as source
    )
  );

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

revoke all on function public.take_over_record_draft_children(uuid, jsonb, text, uuid) from public;
grant execute on function public.take_over_record_draft_children(uuid, jsonb, text, uuid) to authenticated;
