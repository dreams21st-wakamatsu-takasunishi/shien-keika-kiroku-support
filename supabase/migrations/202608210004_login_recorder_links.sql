-- Link authenticated members to the operational recorder roster. This lets
-- managers and administrators use attendance and transport operations under
-- the same staff identity without creating a second login.

-- Older projects already have this column, but keep the migration repeatable.
alter table public.profiles
  add column if not exists recorder_profile_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_recorder_profile_fk'
  ) then
    alter table public.profiles
      add constraint profiles_recorder_profile_fk
      foreign key (organization_id, recorder_profile_id)
      references public.recorder_profiles(organization_id, id)
      on delete restrict;
  end if;
end $$;

-- Administrators and managers are operational staff as well. Create their
-- roster identity when it does not exist so future attendance/transport use
-- does not require a second manual registration.
insert into public.recorder_profiles (organization_id, display_name, created_by)
select profile.organization_id, profile.display_name, profile.id
from public.profiles profile
where profile.active = true
  and profile.role in ('manager', 'admin')
  and nullif(btrim(profile.display_name), '') is not null
  and not exists (
    select 1
    from public.recorder_profiles recorder
    where recorder.organization_id = profile.organization_id
      and lower(btrim(recorder.display_name)) = lower(btrim(profile.display_name))
      and recorder.active = true
  )
on conflict do nothing;

-- Backfill only unambiguous same-name pairs for managers/admins. Shared staff
-- logins deliberately remain unbound so the actual recorder is still selected
-- from the roster at the start of recording.
with candidates as (
  select profile.id as profile_id, recorder.id as recorder_id
  from public.profiles profile
  join public.recorder_profiles recorder
    on recorder.organization_id = profile.organization_id
   and lower(btrim(recorder.display_name)) = lower(btrim(profile.display_name))
   and recorder.active = true
  where profile.recorder_profile_id is null
    and profile.role in ('manager', 'admin')
    and (recorder.auth_user_id is null or recorder.auth_user_id = profile.id)
), unique_profiles as (
  select profile_id, min(recorder_id) as recorder_id
  from candidates
  group by profile_id
  having count(*) = 1
), unique_pairs as (
  select candidate.profile_id, candidate.recorder_id
  from unique_profiles candidate
  where not exists (
    select 1
    from unique_profiles duplicate
    where duplicate.recorder_id = candidate.recorder_id
      and duplicate.profile_id <> candidate.profile_id
  )
    and not exists (
      select 1
      from public.profiles linked
      where linked.recorder_profile_id = candidate.recorder_id
    )
)
update public.profiles profile
set recorder_profile_id = pair.recorder_id
from unique_pairs pair
where profile.id = pair.profile_id;

-- One operational identity must not be shared by multiple login members.
with duplicates as (
  select id,
    row_number() over (
      partition by organization_id, recorder_profile_id
      order by created_at, id
    ) as duplicate_number
  from public.profiles
  where recorder_profile_id is not null
)
update public.profiles profile
set recorder_profile_id = null
from duplicates duplicate
where profile.id = duplicate.id
  and duplicate.duplicate_number > 1;

create unique index if not exists profiles_recorder_profile_unique_idx
  on public.profiles(organization_id, recorder_profile_id)
  where recorder_profile_id is not null;

-- Prefer the explicit login-member link, while retaining staff-ID bindings.
create or replace function public.current_recorder_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select recorder.id
  from public.profiles profile
  join public.recorder_profiles recorder
    on recorder.organization_id = profile.organization_id
   and recorder.active = true
   and (
     recorder.id = profile.recorder_profile_id
     or (
       recorder.auth_user_id = profile.id
       and recorder.individual_login_enabled = true
     )
   )
  where profile.id = auth.uid()
    and profile.active = true
  order by (recorder.id = profile.recorder_profile_id) desc
  limit 1
$$;

revoke all on function public.current_recorder_profile_id() from public;
grant execute on function public.current_recorder_profile_id() to authenticated;

-- Management screens can identify the browser currently in use even for
-- email-based manager/admin sessions, which otherwise remain unmanaged.
create or replace function public.current_organization_device_id(p_device_token text)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select device.id
  from public.organization_devices device
  where device.organization_id = public.current_organization_id()
    and coalesce(p_device_token, '') ~ '^[A-Fa-f0-9]{64}$'
    and device.token_hash = encode(digest(p_device_token, 'sha256'), 'hex')
  limit 1
$$;

revoke all on function public.current_organization_device_id(text) from public;
grant execute on function public.current_organization_device_id(text) to authenticated;

-- Apply the same automatic identity creation to future manager/admin profiles
-- created after an invitation is accepted.
create or replace function public.ensure_login_recorder_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_recorder_id uuid;
begin
  if new.role not in ('manager', 'admin') or not new.active then
    return new;
  end if;

  select recorder.id into matched_recorder_id
  from public.recorder_profiles recorder
  where recorder.organization_id = new.organization_id
    and lower(btrim(recorder.display_name)) = lower(btrim(new.display_name))
    and recorder.active = true
    and (recorder.auth_user_id is null or recorder.auth_user_id = new.id)
  limit 1;

  if matched_recorder_id is null then
    insert into public.recorder_profiles (organization_id, display_name, created_by)
    values (new.organization_id, new.display_name, new.id)
    returning id into matched_recorder_id;
  end if;

  update public.profiles
  set recorder_profile_id = matched_recorder_id
  where id = new.id
    and recorder_profile_id is null;
  return new;
end;
$$;

drop trigger if exists ensure_login_recorder_profile_after_insert on public.profiles;
create trigger ensure_login_recorder_profile_after_insert
  after insert on public.profiles
  for each row execute function public.ensure_login_recorder_profile();
