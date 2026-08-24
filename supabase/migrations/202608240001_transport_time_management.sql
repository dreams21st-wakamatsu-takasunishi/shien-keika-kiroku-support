-- Separate operational transport times from destination details and keep an
-- append-only reason/history whenever a saved pickup or drop-off anchor changes.

alter table public.daily_transport_requirements
  add column if not exists time_change_note text;

create table if not exists public.transport_time_change_history (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  child_id text not null,
  service_date date not null,
  time_field text not null
    check (time_field in ('pickup_target_time', 'dropoff_target_time')),
  previous_time time,
  new_time time,
  previous_mode text check (previous_mode is null or previous_mode in ('fixed', 'arrival_backward', 'departure_forward')),
  new_mode text check (new_mode is null or new_mode in ('fixed', 'arrival_backward', 'departure_forward')),
  change_note text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_by_name text,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, child_id)
    references public.children(organization_id, id) on delete cascade
);

create index if not exists transport_time_change_history_child_date_idx
  on public.transport_time_change_history(organization_id, child_id, service_date desc, created_at desc);

create or replace function public.capture_transport_time_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  reason text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  select profile.display_name into actor_name
  from public.profiles profile
  where profile.id = auth.uid();

  reason := nullif(btrim(coalesce(new.time_change_note, '')), '');
  if reason is null then
    reason := case
      when new.source = 'assistant' then 'AIアシスタントによる変更'
      when new.source = 'baseline' then '基本情報の再反映'
      else '変更理由未入力（既存処理による更新）'
    end;
  end if;

  if old.pickup_target_time is distinct from new.pickup_target_time
     or old.pickup_time_mode is distinct from new.pickup_time_mode then
    insert into public.transport_time_change_history (
      organization_id, child_id, service_date, time_field,
      previous_time, new_time, previous_mode, new_mode,
      change_note, changed_by, changed_by_name
    ) values (
      new.organization_id, new.child_id, new.service_date, 'pickup_target_time',
      old.pickup_target_time, new.pickup_target_time, old.pickup_time_mode, new.pickup_time_mode,
      reason, auth.uid(), actor_name
    );
  end if;

  if old.dropoff_target_time is distinct from new.dropoff_target_time
     or old.dropoff_time_mode is distinct from new.dropoff_time_mode then
    insert into public.transport_time_change_history (
      organization_id, child_id, service_date, time_field,
      previous_time, new_time, previous_mode, new_mode,
      change_note, changed_by, changed_by_name
    ) values (
      new.organization_id, new.child_id, new.service_date, 'dropoff_target_time',
      old.dropoff_target_time, new.dropoff_target_time, old.dropoff_time_mode, new.dropoff_time_mode,
      reason, auth.uid(), actor_name
    );
  end if;

  return new;
end;
$$;

drop trigger if exists capture_transport_time_change_after on public.daily_transport_requirements;
create trigger capture_transport_time_change_after
  after update of pickup_target_time, dropoff_target_time, pickup_time_mode, dropoff_time_mode on public.daily_transport_requirements
  for each row execute function public.capture_transport_time_change();

alter table public.transport_time_change_history enable row level security;

drop policy if exists transport_time_change_history_select on public.transport_time_change_history;
create policy transport_time_change_history_select on public.transport_time_change_history
  for select using (organization_id = public.current_organization_id());

grant select on public.transport_time_change_history to authenticated;
grant all on public.transport_time_change_history to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'transport_time_change_history'
     ) then
    alter publication supabase_realtime add table public.transport_time_change_history;
  end if;
end $$;

comment on column public.daily_transport_requirements.time_change_note is
  'Reason supplied for the current pickup/drop-off time edit. Copied into append-only history by trigger.';
comment on table public.transport_time_change_history is
  'Append-only audit trail for saved pickup/dismissal and facility departure time changes.';
