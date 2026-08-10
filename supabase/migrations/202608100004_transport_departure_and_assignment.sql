-- Default departure-time rules and auditable in-operation transport handoff.

alter table public.children
  add column if not exists transport_program text
    check (transport_program is null or transport_program in ('小学部', 'キャリアズ'));

update public.children
set transport_program = case
  when grade = '未就学' or grade like '小学%' then '小学部'
  when grade like '中学%' or grade like '高校%' then 'キャリアズ'
  else transport_program
end
where transport_program is null
  and (grade = '未就学' or grade like '小学%' or grade like '中学%' or grade like '高校%');

alter table public.transport_route_settings
  add column if not exists weekday_elementary_departure_time time not null default '17:45',
  add column if not exists weekday_careers_departure_time time not null default '19:20',
  add column if not exists holiday_departure_time time not null default '16:00';

create table if not exists public.transport_assignment_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transport_run_id uuid not null,
  actor_recorder_profile_id uuid not null,
  previous_driver_recorder_profile_id uuid,
  new_driver_recorder_profile_id uuid,
  previous_assistant_recorder_profile_ids jsonb not null default '[]'::jsonb,
  new_assistant_recorder_profile_ids jsonb not null default '[]'::jsonb,
  reason text not null check (char_length(reason) between 1 and 500),
  changed_at timestamptz not null default now(),
  foreign key (organization_id, transport_run_id)
    references public.transport_runs(organization_id, id) on delete cascade,
  foreign key (organization_id, actor_recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete restrict,
  foreign key (organization_id, previous_driver_recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete restrict,
  foreign key (organization_id, new_driver_recorder_profile_id)
    references public.recorder_profiles(organization_id, id) on delete restrict
);

create index if not exists transport_assignment_changes_run_idx
  on public.transport_assignment_changes(organization_id, transport_run_id, changed_at desc);

drop trigger if exists audit_transport_assignment_changes_after on public.transport_assignment_changes;
create trigger audit_transport_assignment_changes_after
  after insert on public.transport_assignment_changes
  for each row execute function public.write_audit_log();

alter table public.transport_assignment_changes enable row level security;
drop policy if exists transport_assignment_changes_select on public.transport_assignment_changes;
create policy transport_assignment_changes_select on public.transport_assignment_changes for select
  using (organization_id = public.current_organization_id());

grant select on public.transport_assignment_changes to authenticated;
grant all on public.transport_assignment_changes to service_role;

create or replace function public.change_transport_assignment(
  p_organization_id uuid,
  p_transport_run_id uuid,
  p_actor_recorder_profile_id uuid,
  p_actor_pin text,
  p_driver_recorder_profile_id uuid,
  p_assistant_recorder_profile_ids jsonb,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  run_value public.transport_runs%rowtype;
  change_id uuid;
  assistants jsonb := coalesce(p_assistant_recorder_profile_ids, '[]'::jsonb);
begin
  if auth.uid() is null
     or p_organization_id is distinct from public.current_organization_id() then
    raise exception using errcode = '42501', message = 'Transport access denied.';
  end if;
  if jsonb_typeof(assistants) is distinct from 'array' then
    raise exception using errcode = '22023', message = '添乗職員の指定が不正です。';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '22023', message = '変更理由を入力してください。';
  end if;
  if char_length(trim(p_reason)) > 500 then
    raise exception using errcode = '22023', message = '変更理由は500文字以内で入力してください。';
  end if;
  if not exists (
    select 1 from public.recorder_profiles
    where organization_id = p_organization_id
      and id = p_actor_recorder_profile_id
      and active = true
      and pin_configured = true
      and pin_hash = crypt(coalesce(p_actor_pin, ''), pin_hash)
  ) then
    raise exception using errcode = '42501', message = '個人PINを確認してください。';
  end if;

  select * into run_value from public.transport_runs
  where organization_id = p_organization_id and id = p_transport_run_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = '変更対象の送迎便が見つかりません。';
  end if;
  if run_value.status in ('帰着', '事業所到着') then
    raise exception using errcode = '22023', message = '運行完了後は担当を変更できません。';
  end if;
  if public.current_user_role() = 'staff'
     and run_value.driver_recorder_profile_id is distinct from p_actor_recorder_profile_id
     and not (run_value.assistant_recorder_profile_ids ? p_actor_recorder_profile_id::text)
     and not exists (
       select 1 from public.transport_run_covers cover
       where cover.organization_id = p_organization_id
         and cover.transport_run_id = p_transport_run_id
         and cover.recorder_profile_id = p_actor_recorder_profile_id
         and cover.ended_at is null
     ) then
    raise exception using errcode = '42501', message = '現在の担当職員または応援職員だけが交代できます。';
  end if;

  if p_driver_recorder_profile_id is not null and not exists (
    select 1 from public.recorder_profiles
    where organization_id = p_organization_id
      and id = p_driver_recorder_profile_id
      and active = true
  ) then
    raise exception using errcode = '22023', message = '変更後の運転担当者を確認してください。';
  end if;
  if p_driver_recorder_profile_id is not null and assistants ? p_driver_recorder_profile_id::text then
    raise exception using errcode = '22023', message = '運転担当者を添乗職員へ重複設定できません。';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(assistants) selected(id)
    where not exists (
      select 1 from public.recorder_profiles profile
      where profile.organization_id = p_organization_id
        and profile.id::text = selected.id
        and profile.active = true
    )
  ) then
    raise exception using errcode = '22023', message = '添乗職員の指定を確認してください。';
  end if;

  insert into public.transport_assignment_changes (
    organization_id,
    transport_run_id,
    actor_recorder_profile_id,
    previous_driver_recorder_profile_id,
    new_driver_recorder_profile_id,
    previous_assistant_recorder_profile_ids,
    new_assistant_recorder_profile_ids,
    reason
  ) values (
    p_organization_id,
    p_transport_run_id,
    p_actor_recorder_profile_id,
    run_value.driver_recorder_profile_id,
    p_driver_recorder_profile_id,
    run_value.assistant_recorder_profile_ids,
    assistants,
    trim(p_reason)
  ) returning id into change_id;

  update public.transport_runs
  set driver_recorder_profile_id = p_driver_recorder_profile_id,
      assistant_recorder_profile_ids = assistants,
      updated_at = now()
  where organization_id = p_organization_id and id = p_transport_run_id;

  return change_id;
end;
$$;

revoke all on function public.change_transport_assignment(uuid, uuid, uuid, text, uuid, jsonb, text) from public;
grant execute on function public.change_transport_assignment(uuid, uuid, uuid, text, uuid, jsonb, text) to authenticated;

comment on table public.transport_assignment_changes is
  'Auditable driver and assistant handoffs made without resetting route progress.';
