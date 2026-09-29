-- A meeting may concern siblings or several children. Keep child_id as the
-- immutable primary child for older clients; child_ids is the complete list.
-- An INSERT ... RETURNING checks SELECT RLS before a STABLE helper can see its
-- newly inserted row. Evaluate the new row directly instead.
drop policy meeting_case_read on public.meeting_cases;
create policy meeting_case_read on public.meeting_cases for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and (created_by = auth.uid() or auth.uid() = any(editor_user_ids)
      or public.current_user_has_permission('review_records'))
    and (public.current_user_role() in ('manager', 'admin')
      or public.current_recorder_profile_id() is null
      or public.current_request_device_kind() = 'facility_shared')
  );

alter table public.meeting_cases
  add column child_ids text[] not null default '{}';

alter table public.meeting_cases disable trigger meeting_case_prepare;
alter table public.meeting_cases disable trigger meeting_case_device;
alter table public.meeting_cases disable trigger meeting_case_audit;
update public.meeting_cases set child_ids = array[child_id];
alter table public.meeting_cases enable trigger meeting_case_prepare;
alter table public.meeting_cases enable trigger meeting_case_device;
alter table public.meeting_cases enable trigger meeting_case_audit;

alter table public.meeting_cases
  add constraint meeting_cases_child_ids_valid
    check (cardinality(child_ids) between 1 and 30 and child_ids[1] = child_id);

create or replace function public.validate_meeting_case_children()
returns trigger language plpgsql security definer set search_path = public as $$
declare valid_count integer;
begin
  if tg_op = 'INSERT' and cardinality(new.child_ids) = 0 then
    new.child_ids := array[new.child_id];
  end if;
  if tg_op = 'UPDATE' and new.child_ids is not distinct from old.child_ids then
    return new;
  end if;
  if cardinality(new.child_ids) not between 1 and 30
     or new.child_ids[1] is distinct from new.child_id then
    raise exception 'MEETING_CHILDREN_INVALID: select 1 to 30 children, retaining the first child';
  end if;
  if tg_op = 'UPDATE' and exists (
    select 1 from public.meeting_progress_records p
    where p.organization_id = old.organization_id and p.meeting_id = old.id
  ) then
    raise exception 'MEETING_CHILDREN_LOCKED: progress records already exist';
  end if;
  select count(distinct c.id) into valid_count
  from unnest(new.child_ids) as selected(id)
  join public.children c on c.organization_id = new.organization_id
    and c.id = selected.id and c.deleted_at is null;
  if valid_count <> cardinality(new.child_ids) then
    raise exception 'MEETING_CHILDREN_INVALID: missing, duplicate or inactive child';
  end if;
  return new;
end;
$$;

create trigger meeting_case_children_validate
  before insert or update of child_ids on public.meeting_cases
  for each row execute function public.validate_meeting_case_children();

create or replace function public.prevent_meeting_child_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.meeting_cases m
    where m.organization_id = old.organization_id and old.id = any(m.child_ids)
  ) then
    raise exception 'Meeting cases reference this child';
  end if;
  return old;
end;
$$;

create trigger meeting_child_delete_guard before delete on public.children
  for each row execute function public.prevent_meeting_child_delete();

-- Each child receives their own progress record from the shared meeting.
alter table public.meeting_progress_records
  drop constraint meeting_progress_records_organization_id_meeting_id_key;
alter table public.meeting_progress_records
  add constraint meeting_progress_records_case_child_key
    unique (organization_id, meeting_id, child_id);

create or replace function public.prepare_meeting_progress_record()
returns trigger language plpgsql security definer set search_path = public as $$
declare meeting_children text[]; meeting_day date; meeting_status text;
begin
  select m.child_ids, m.meeting_date, m.status
    into meeting_children, meeting_day, meeting_status
  from public.meeting_cases m
  where m.organization_id = new.organization_id and m.id = new.meeting_id;
  if meeting_children is null
     or not coalesce(new.child_id = any(meeting_children), false)
     or meeting_day is distinct from new.record_date then
    raise exception 'Meeting and progress record must refer to the same child and date';
  end if;
  if new.approval_status = '未確認' and meeting_status <> '結果確認済み' then
    raise exception 'Confirm the meeting result before submitting progress';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.revision := 1;
    if new.approval_status not in ('下書き', '未確認') then
      raise exception 'A new progress record cannot be approved';
    end if;
    new.reviewed_by := null;
    new.reviewed_at := null;
  else
    if new.organization_id is distinct from old.organization_id or new.id is distinct from old.id
       or new.meeting_id is distinct from old.meeting_id or new.child_id is distinct from old.child_id
       or new.created_by is distinct from old.created_by then
      raise exception 'Progress record identity cannot be changed';
    end if;
    if new.revision <> old.revision + 1 then
      raise exception 'MEETING_CONFLICT: reload the progress record before saving';
    end if;
    if old.approval_status = '確認済み' then
      raise exception 'Approved progress records are locked';
    end if;
    if new.approval_status in ('確認済み', '要修正') then
      if old.approval_status <> '未確認' then
        raise exception 'Only submitted progress records can be reviewed';
      end if;
      if not public.current_user_has_permission('review_records') then
        raise exception 'Review permission required';
      end if;
      if new.body is distinct from old.body then
        raise exception 'Reviewer cannot change the submitted body';
      end if;
      if new.approval_status = '要修正' and nullif(trim(new.review_comment), '') is null then
        raise exception 'A correction reason is required';
      end if;
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
      if new.approval_status = '確認済み' then new.review_comment := null; end if;
    else
      if auth.uid() <> old.created_by then
        raise exception 'Only the author can edit the progress body';
      end if;
      if old.approval_status = '未確認' then
        raise exception 'Submitted progress records must be reviewed first';
      end if;
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_comment := null;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
