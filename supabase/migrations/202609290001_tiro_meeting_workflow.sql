-- One child per meeting. Meeting material is separate from daily service records.
create table public.meeting_cases (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  child_id text not null,
  calendar_event_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 160),
  meeting_type text not null check (meeting_type in ('担当者会議', '保護者面談', 'ケース会議', 'その他')),
  meeting_date date not null,
  status text not null default '準備中' check (status in ('準備中', '開催中', '文字起こし待ち', '照合中', '結果確認済み', '中止')),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  editor_user_ids uuid[] not null default '{}',
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, child_id) references public.children(organization_id, id) on delete restrict,
  foreign key (organization_id, calendar_event_id) references public.calendar_events(organization_id, id) on delete set null (calendar_event_id),
  check (pg_column_size(content) <= 200000)
);
create index meeting_cases_child_date_idx on public.meeting_cases (organization_id, child_id, meeting_date desc);
create index meeting_cases_creator_idx on public.meeting_cases (organization_id, created_by, meeting_date desc);

create or replace function public.can_read_meeting(p_organization_id uuid, p_meeting_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.meeting_cases m
    where m.organization_id = p_organization_id
      and m.id = p_meeting_id
      and p_organization_id = public.current_organization_id()
      and (m.created_by = auth.uid() or auth.uid() = any(m.editor_user_ids)
        or public.current_user_has_permission('review_records'))
      and (public.current_user_role() in ('manager', 'admin')
        or public.current_recorder_profile_id() is null
        or public.current_request_device_kind() = 'facility_shared')
  );
$$;
revoke all on function public.can_read_meeting(uuid, uuid) from public;
grant execute on function public.can_read_meeting(uuid, uuid) to authenticated;

create or replace function public.prepare_meeting_case()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.revision := 1;
  else
    if new.organization_id is distinct from old.organization_id
       or new.id is distinct from old.id
       or new.child_id is distinct from old.child_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Meeting identity cannot be changed';
    end if;
    if new.revision <> old.revision + 1 then
      raise exception 'MEETING_CONFLICT: reload the meeting before saving';
    end if;
    if new.meeting_date is distinct from old.meeting_date
       and exists (select 1 from public.meeting_progress_records p
         where p.organization_id = old.organization_id and p.meeting_id = old.id) then
      raise exception 'Meeting date is locked after creating a progress record';
    end if;
    if exists (select 1 from public.meeting_progress_records p
      where p.organization_id = old.organization_id and p.meeting_id = old.id
        and p.approval_status = '確認済み') then
      raise exception 'Approved meetings are locked';
    end if;
    if new.editor_user_ids is distinct from old.editor_user_ids
       and auth.uid() <> old.created_by
       and not public.current_user_has_permission('review_records') then
      raise exception 'Only the meeting owner or reviewer can change editors';
    end if;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger meeting_case_prepare before insert or update on public.meeting_cases
  for each row execute function public.prepare_meeting_case();
create trigger meeting_case_device before insert or update on public.meeting_cases
  for each row execute function public.prevent_personal_device_record_mutation();
create trigger meeting_case_audit after insert or update on public.meeting_cases
  for each row execute function public.write_audit_log();

alter table public.meeting_cases enable row level security;
create policy meeting_case_read on public.meeting_cases for select to authenticated
  using (public.can_read_meeting(organization_id, id));
create policy meeting_case_insert on public.meeting_cases for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and created_by = auth.uid()
    and (public.current_user_role() in ('manager', 'admin')
      or public.current_recorder_profile_id() is null
      or public.current_request_device_kind() = 'facility_shared')
  );
create policy meeting_case_update on public.meeting_cases for update to authenticated
  using (public.can_read_meeting(organization_id, id)
    and (created_by = auth.uid() or auth.uid() = any(editor_user_ids)
      or public.current_user_has_permission('review_records')))
  with check (public.can_read_meeting(organization_id, id));
grant select, insert, update on public.meeting_cases to authenticated;

-- Imports are append-only. A correction creates a new version, preserving the source.
create table public.meeting_transcripts (
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(),
  meeting_id uuid not null,
  version integer not null check (version > 0),
  source_kind text not null check (source_kind in ('スクリプト', '要約のみ')),
  source_name text,
  raw_text text not null check (char_length(trim(raw_text)) between 1 and 200000),
  corrected_text text,
  imported_by uuid not null references public.profiles(id) on delete restrict,
  imported_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, meeting_id, version),
  foreign key (organization_id, meeting_id) references public.meeting_cases(organization_id, id) on delete restrict
);
create index meeting_transcripts_case_idx on public.meeting_transcripts (organization_id, meeting_id, version desc);
create or replace function public.prepare_meeting_transcript()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.meeting_progress_records p
    where p.organization_id = new.organization_id and p.meeting_id = new.meeting_id
      and p.approval_status = '確認済み') then
    raise exception 'Approved meetings are locked';
  end if;
  new.imported_by := auth.uid();
  if new.version <> coalesce((select max(t.version) + 1 from public.meeting_transcripts t
    where t.organization_id = new.organization_id and t.meeting_id = new.meeting_id), 1) then
    raise exception 'TRANSCRIPT_CONFLICT: reload before importing another version';
  end if;
  return new;
end;
$$;
create trigger meeting_transcript_prepare before insert on public.meeting_transcripts
  for each row execute function public.prepare_meeting_transcript();
create trigger meeting_transcript_device before insert on public.meeting_transcripts
  for each row execute function public.prevent_personal_device_record_mutation();
create or replace function public.audit_meeting_transcript_import()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (organization_id, actor_id, table_name, row_id, action, new_data)
  values (new.organization_id, auth.uid(), 'meeting_transcripts', new.id::text, 'INSERT',
    jsonb_build_object('meeting_id', new.meeting_id, 'version', new.version,
      'source_kind', new.source_kind, 'source_name', new.source_name,
      'character_count', char_length(new.raw_text)));
  return new;
end;
$$;
create trigger meeting_transcript_audit after insert on public.meeting_transcripts
  for each row execute function public.audit_meeting_transcript_import();
alter table public.meeting_transcripts enable row level security;
create policy meeting_transcript_read on public.meeting_transcripts for select to authenticated
  using (public.can_read_meeting(organization_id, meeting_id));
create policy meeting_transcript_insert on public.meeting_transcripts for insert to authenticated
  with check (public.can_read_meeting(organization_id, meeting_id)
    and exists (select 1 from public.meeting_cases m where m.organization_id = meeting_transcripts.organization_id
      and m.id = meeting_transcripts.meeting_id
      and (m.created_by = auth.uid() or auth.uid() = any(m.editor_user_ids))));
grant select, insert on public.meeting_transcripts to authenticated;

create table public.meeting_export_events (
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(),
  meeting_id uuid not null,
  output_kind text not null check (output_kind in ('context_copy', 'sheet_copy', 'sheet_download')),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, meeting_id) references public.meeting_cases(organization_id, id) on delete restrict
);
create or replace function public.prepare_meeting_export()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.actor_id := auth.uid();
  return new;
end;
$$;
create trigger meeting_export_prepare before insert on public.meeting_export_events
  for each row execute function public.prepare_meeting_export();
create trigger meeting_export_device before insert on public.meeting_export_events
  for each row execute function public.prevent_personal_device_record_mutation();
create trigger meeting_export_audit after insert on public.meeting_export_events
  for each row execute function public.write_audit_log();
alter table public.meeting_export_events enable row level security;
create policy meeting_export_read on public.meeting_export_events for select to authenticated
  using (public.can_read_meeting(organization_id, meeting_id));
create policy meeting_export_insert on public.meeting_export_events for insert to authenticated
  with check (public.can_read_meeting(organization_id, meeting_id)
    and actor_id = auth.uid());
grant select, insert on public.meeting_export_events to authenticated;

-- Meeting-derived progress uses no attendance, snack, or service-time fields.
create table public.meeting_progress_records (
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(),
  meeting_id uuid not null,
  child_id text not null,
  record_date date not null,
  body text not null default '' check (char_length(body) <= 20000),
  approval_status text not null default '下書き' check (approval_status in ('下書き', '未確認', '要修正', '確認済み')),
  review_comment text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, meeting_id),
  foreign key (organization_id, meeting_id) references public.meeting_cases(organization_id, id) on delete restrict,
  foreign key (organization_id, child_id) references public.children(organization_id, id) on delete restrict
);
create index meeting_progress_child_date_idx on public.meeting_progress_records (organization_id, child_id, record_date desc);
create or replace function public.prepare_meeting_progress_record()
returns trigger language plpgsql security definer set search_path = public as $$
declare meeting_child text; meeting_day date; meeting_status text;
begin
  select m.child_id, m.meeting_date, m.status into meeting_child, meeting_day, meeting_status from public.meeting_cases m
    where m.organization_id = new.organization_id and m.id = new.meeting_id;
  if meeting_child is null or meeting_child <> new.child_id or meeting_day <> new.record_date then
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
create trigger meeting_progress_prepare before insert or update on public.meeting_progress_records
  for each row execute function public.prepare_meeting_progress_record();
create trigger meeting_progress_device before insert or update on public.meeting_progress_records
  for each row execute function public.prevent_personal_device_record_mutation();
create trigger meeting_progress_audit after insert or update on public.meeting_progress_records
  for each row execute function public.write_audit_log();
alter table public.meeting_progress_records enable row level security;
create policy meeting_progress_read on public.meeting_progress_records for select to authenticated
  using (public.can_read_meeting(organization_id, meeting_id));
create policy meeting_progress_insert on public.meeting_progress_records for insert to authenticated
  with check (public.can_read_meeting(organization_id, meeting_id)
    and exists (select 1 from public.meeting_cases m where m.organization_id = meeting_progress_records.organization_id
      and m.id = meeting_progress_records.meeting_id
      and (m.created_by = auth.uid() or auth.uid() = any(m.editor_user_ids))));
create policy meeting_progress_update on public.meeting_progress_records for update to authenticated
  using (public.can_read_meeting(organization_id, meeting_id)
    and (created_by = auth.uid() or public.current_user_has_permission('review_records')))
  with check (public.can_read_meeting(organization_id, meeting_id));
grant select, insert, update on public.meeting_progress_records to authenticated;
