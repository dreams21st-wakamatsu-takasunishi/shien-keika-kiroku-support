-- Prevent duplicate daily records and stale-device overwrites.

create or replace function public.prevent_duplicate_support_record_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.child_id = new.child_id
     and old.record_date = new.record_date then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      new.organization_id::text || ':' || new.child_id || ':' || new.record_date::text,
      0
    )
  );

  if exists (
    select 1
    from public.support_records as existing
    where existing.organization_id = new.organization_id
      and existing.child_id = new.child_id
      and existing.record_date = new.record_date
      and existing.id <> new.id
      and existing.deleted_at is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'RECORD_DUPLICATE_DAY: an active record already exists for this child and date';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_support_record_day_before on public.support_records;
create trigger prevent_duplicate_support_record_day_before
  before insert or update on public.support_records
  for each row execute function public.prevent_duplicate_support_record_day();

create or replace function public.save_support_records_guarded(
  p_organization_id uuid,
  p_records jsonb
)
returns table(record_id text, new_version integer, outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  incoming_id text;
  incoming_child_id text;
  incoming_date date;
  expected_version integer;
  existing_record public.support_records%rowtype;
  saved_record public.support_records%rowtype;
begin
  if auth.uid() is null
     or p_organization_id is distinct from public.current_organization_id() then
    raise exception using errcode = '42501', message = 'Unauthorized organization';
  end if;

  if jsonb_typeof(p_records) <> 'array' then
    raise exception using errcode = '22023', message = 'p_records must be a JSON array';
  end if;

  for item in
    select records.value
    from jsonb_array_elements(p_records) as records(value)
    order by records.value->>'record_date', records.value->>'child_id', records.value->>'id'
  loop
    incoming_id := nullif(item->>'id', '');
    incoming_child_id := nullif(item->>'child_id', '');
    incoming_date := nullif(item->>'record_date', '')::date;
    expected_version := coalesce(nullif(item->>'expected_version', '')::integer, 0);

    if incoming_id is null or incoming_child_id is null or incoming_date is null then
      raise exception using errcode = '22023', message = 'Record id, child id, and record date are required';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        p_organization_id::text || ':' || incoming_child_id || ':' || incoming_date::text,
        0
      )
    );

    select existing.*
      into existing_record
    from public.support_records as existing
    where existing.organization_id = p_organization_id
      and existing.id = incoming_id;

    if found then
      -- A second device retrying the same newly-created record must never
      -- overwrite the first successful save.
      if expected_version = 0 then
        record_id := existing_record.id;
        new_version := existing_record.version;
        outcome := 'already_saved';
        return next;
        continue;
      end if;

      if existing_record.version <> expected_version then
        raise exception using
          errcode = 'P0001',
          message = format(
            'RECORD_CONFLICT: record %s expected version %s but current version is %s',
            incoming_id,
            expected_version,
            existing_record.version
          );
      end if;

      if exists (
        select 1
        from public.support_records as duplicate_record
        where duplicate_record.organization_id = p_organization_id
          and duplicate_record.child_id = incoming_child_id
          and duplicate_record.record_date = incoming_date
          and duplicate_record.id <> incoming_id
          and duplicate_record.deleted_at is null
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'RECORD_DUPLICATE_DAY: an active record already exists for this child and date';
      end if;

      update public.support_records
      set template_id = item->>'template_id',
          template_name = item->>'template_name',
          template_type = item->>'template_type',
          template_snapshot = coalesce(item->'template_snapshot', '{}'::jsonb),
          child_id = incoming_child_id,
          child_name = item->>'child_name',
          support_plan_id = nullif(item->>'support_plan_id', ''),
          record_date = incoming_date,
          attendance = coalesce(item->>'attendance', ''),
          attendance_note = nullif(item->>'attendance_note', ''),
          expression = coalesce(item->>'expression', ''),
          expression_note = nullif(item->>'expression_note', ''),
          snack = coalesce(item->>'snack', ''),
          snack_note = nullif(item->>'snack_note', ''),
          recorder_profile_id = nullif(item->>'recorder_profile_id', '')::uuid,
          recorder_name = item->>'recorder_name',
          service_start_time = nullif(item->>'service_start_time', '')::time,
          service_end_time = nullif(item->>'service_end_time', '')::time,
          transportation = nullif(item->>'transportation', ''),
          five_domains = coalesce(
            array(select jsonb_array_elements_text(coalesce(item->'five_domains', '[]'::jsonb))),
            array[]::text[]
          ),
          goal_progress = coalesce(item->'goal_progress', '[]'::jsonb),
          section_answers = coalesce(item->'section_answers', '{}'::jsonb),
          skipped_question_ids = coalesce(
            array(select jsonb_array_elements_text(coalesce(item->'skipped_question_ids', '[]'::jsonb))),
            array[]::text[]
          ),
          synthesized_summary = nullif(item->>'synthesized_summary', ''),
          approval_status = coalesce(item->>'approval_status', '未確認'),
          review_comment = nullif(item->>'review_comment', ''),
          review_issues = coalesce(item->'review_issues', '[]'::jsonb),
          reviewer_name = nullif(item->>'reviewer_name', ''),
          reviewed_at = nullif(item->>'reviewed_at', '')::timestamptz,
          deleted_at = null
      where organization_id = p_organization_id
        and id = incoming_id
        and version = expected_version
      returning * into saved_record;

      if not found then
        raise exception using errcode = 'P0001', message = 'RECORD_CONFLICT: record changed during save';
      end if;

      record_id := saved_record.id;
      new_version := saved_record.version;
      outcome := 'updated';
      return next;
      continue;
    end if;

    if exists (
      select 1
      from public.support_records as duplicate_record
      where duplicate_record.organization_id = p_organization_id
        and duplicate_record.child_id = incoming_child_id
        and duplicate_record.record_date = incoming_date
        and duplicate_record.deleted_at is null
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'RECORD_DUPLICATE_DAY: an active record already exists for this child and date';
    end if;

    insert into public.support_records (
      organization_id, id, template_id, template_name, template_type, template_snapshot,
      child_id, child_name, support_plan_id, record_date, attendance, attendance_note,
      expression, expression_note, snack, snack_note, recorder_profile_id, recorder_name,
      service_start_time, service_end_time, transportation, five_domains, goal_progress,
      section_answers, skipped_question_ids, synthesized_summary, approval_status,
      review_comment, review_issues, reviewer_name, reviewed_at, deleted_at
    ) values (
      p_organization_id,
      incoming_id,
      item->>'template_id',
      item->>'template_name',
      item->>'template_type',
      coalesce(item->'template_snapshot', '{}'::jsonb),
      incoming_child_id,
      item->>'child_name',
      nullif(item->>'support_plan_id', ''),
      incoming_date,
      coalesce(item->>'attendance', ''),
      nullif(item->>'attendance_note', ''),
      coalesce(item->>'expression', ''),
      nullif(item->>'expression_note', ''),
      coalesce(item->>'snack', ''),
      nullif(item->>'snack_note', ''),
      nullif(item->>'recorder_profile_id', '')::uuid,
      item->>'recorder_name',
      nullif(item->>'service_start_time', '')::time,
      nullif(item->>'service_end_time', '')::time,
      nullif(item->>'transportation', ''),
      coalesce(
        array(select jsonb_array_elements_text(coalesce(item->'five_domains', '[]'::jsonb))),
        array[]::text[]
      ),
      coalesce(item->'goal_progress', '[]'::jsonb),
      coalesce(item->'section_answers', '{}'::jsonb),
      coalesce(
        array(select jsonb_array_elements_text(coalesce(item->'skipped_question_ids', '[]'::jsonb))),
        array[]::text[]
      ),
      nullif(item->>'synthesized_summary', ''),
      coalesce(item->>'approval_status', '未確認'),
      nullif(item->>'review_comment', ''),
      coalesce(item->'review_issues', '[]'::jsonb),
      nullif(item->>'reviewer_name', ''),
      nullif(item->>'reviewed_at', '')::timestamptz,
      null
    )
    returning * into saved_record;

    record_id := saved_record.id;
    new_version := saved_record.version;
    outcome := 'inserted';
    return next;
  end loop;
end;
$$;

revoke all on function public.save_support_records_guarded(uuid, jsonb) from public;
grant execute on function public.save_support_records_guarded(uuid, jsonb) to authenticated;
