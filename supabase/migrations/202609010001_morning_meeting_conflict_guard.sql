-- Prevent silent lost updates when multiple staff edit the same morning meeting note.

alter table public.morning_meeting_records
  add column if not exists revision bigint not null default 1;

alter table public.morning_meeting_records
  drop constraint if exists morning_meeting_records_revision_check;

alter table public.morning_meeting_records
  add constraint morning_meeting_records_revision_check check (revision >= 1);

-- Keep revision monotonic even while an older cached frontend still uses a
-- direct upsert instead of the guarded RPC.
create or replace function public.prepare_morning_meeting_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then
    new.revision := old.revision + 1;
  else
    new.revision := greatest(1, coalesce(new.revision, 1));
  end if;
  return new;
end;
$$;

create table if not exists public.morning_meeting_record_revisions (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_date date not null,
  revision bigint not null,
  content text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_by_recorder_profile_id uuid,
  updated_by_name text,
  changed_at timestamptz not null default now(),
  unique (organization_id, meeting_date, revision),
  foreign key (organization_id, updated_by_recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete restrict
);

create index if not exists morning_meeting_record_revisions_lookup_idx
  on public.morning_meeting_record_revisions(organization_id, meeting_date, revision desc);

create or replace function public.capture_morning_meeting_record_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.morning_meeting_record_revisions (
    organization_id,
    meeting_date,
    revision,
    content,
    updated_by,
    updated_by_recorder_profile_id,
    updated_by_name,
    changed_at
  ) values (
    old.organization_id,
    old.meeting_date,
    old.revision,
    old.content,
    old.updated_by,
    old.updated_by_recorder_profile_id,
    old.updated_by_name,
    now()
  )
  on conflict (organization_id, meeting_date, revision) do nothing;
  return new;
end;
$$;

drop trigger if exists capture_morning_meeting_revision_before on public.morning_meeting_records;
create trigger capture_morning_meeting_revision_before
  before update on public.morning_meeting_records
  for each row execute function public.capture_morning_meeting_record_revision();

alter table public.morning_meeting_record_revisions enable row level security;

drop policy if exists morning_meeting_record_revisions_select on public.morning_meeting_record_revisions;
create policy morning_meeting_record_revisions_select
  on public.morning_meeting_record_revisions for select
  using (organization_id = public.current_organization_id());

grant select on public.morning_meeting_record_revisions to authenticated;
grant all on public.morning_meeting_record_revisions to service_role;

create or replace function public.save_morning_meeting_record_guarded(
  p_organization_id uuid,
  p_meeting_date date,
  p_content text,
  p_updated_by_recorder_profile_id uuid default null,
  p_updated_by_name text default null,
  p_expected_revision bigint default 0
)
returns table(new_revision bigint, saved_at timestamptz, record_created_at timestamptz)
language plpgsql
set search_path = public
as $$
declare
  saved_row public.morning_meeting_records%rowtype;
begin
  if p_content is null or char_length(p_content) > 20000 then
    raise exception using
      errcode = '22001',
      message = 'MORNING_MEETING_CONTENT_TOO_LONG';
  end if;

  if coalesce(p_expected_revision, 0) <= 0 then
    insert into public.morning_meeting_records (
      organization_id,
      meeting_date,
      content,
      updated_by_recorder_profile_id,
      updated_by_name,
      revision
    )
    values (
      p_organization_id,
      p_meeting_date,
      p_content,
      p_updated_by_recorder_profile_id,
      nullif(btrim(p_updated_by_name), ''),
      1
    )
    on conflict (organization_id, meeting_date) do nothing
    returning * into saved_row;
  else
    update public.morning_meeting_records
    set
      content = p_content,
      updated_by_recorder_profile_id = p_updated_by_recorder_profile_id,
      updated_by_name = nullif(btrim(p_updated_by_name), '')
    where organization_id = p_organization_id
      and meeting_date = p_meeting_date
      and revision = p_expected_revision
    returning * into saved_row;
  end if;

  if saved_row.organization_id is null then
    raise exception using
      errcode = '40001',
      message = 'MORNING_MEETING_CONFLICT',
      detail = 'The morning meeting record was updated by another editor.';
  end if;

  return query
  select saved_row.revision, saved_row.updated_at, saved_row.created_at;
end;
$$;

revoke all on function public.save_morning_meeting_record_guarded(
  uuid, date, text, uuid, text, bigint
) from public;
grant execute on function public.save_morning_meeting_record_guarded(
  uuid, date, text, uuid, text, bigint
) to authenticated, service_role;
