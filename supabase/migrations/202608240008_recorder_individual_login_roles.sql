-- Allow email-free staff-ID accounts to carry operational roles while keeping
-- administrator recovery accounts on the email/MFA login path.

alter table public.recorder_profiles
  add column if not exists individual_login_role text not null default 'staff';

alter table public.recorder_profiles
  drop constraint if exists recorder_profiles_individual_login_role_check;
alter table public.recorder_profiles
  add constraint recorder_profiles_individual_login_role_check
  check (individual_login_role in ('staff', 'manager', 'classroom_manager'));

update public.recorder_profiles recorder
set individual_login_role = case
  when profile.role in ('manager', 'classroom_manager') then profile.role
  else 'staff'
end
from public.profiles profile
where recorder.auth_user_id = profile.id;

-- recorder_profiles uses column-level SELECT grants so auth_user_id and
-- pin_hash remain unavailable to browsers.
grant select (individual_login_role) on public.recorder_profiles to authenticated;

create or replace function public.protect_recorder_individual_login_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' and new.individual_login_role <> 'staff' then
      raise exception using errcode = '42501', message = 'INDIVIDUAL_LOGIN_ROLE_REQUIRES_SERVER';
    elsif tg_op = 'UPDATE'
      and new.individual_login_role is distinct from old.individual_login_role then
      raise exception using errcode = '42501', message = 'INDIVIDUAL_LOGIN_ROLE_REQUIRES_SERVER';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_recorder_individual_login_role_before on public.recorder_profiles;
create trigger protect_recorder_individual_login_role_before
  before insert or update on public.recorder_profiles
  for each row execute function public.protect_recorder_individual_login_role();

-- A staff-ID account is already linked through recorder_profiles.auth_user_id.
-- Avoid creating a second recorder identity when its profile role changes.
create or replace function public.ensure_login_recorder_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_recorder_id uuid;
begin
  if new.role not in ('manager', 'classroom_manager', 'admin') or not new.active then
    return new;
  end if;

  if exists (
    select 1 from public.recorder_profiles recorder
    where recorder.organization_id = new.organization_id
      and recorder.auth_user_id = new.id
      and recorder.active = true
  ) then
    return new;
  end if;

  select recorder.id into matched_recorder_id
  from public.recorder_profiles recorder
  where recorder.organization_id = new.organization_id
    and lower(btrim(recorder.display_name)) = lower(btrim(new.display_name))
    and recorder.active = true
    and recorder.auth_user_id is null
    and not exists (
      select 1 from public.profiles linked
      where linked.organization_id = new.organization_id
        and linked.recorder_profile_id = recorder.id
        and linked.id <> new.id
    )
  limit 1;

  if matched_recorder_id is null then
    if exists (
      select 1 from public.recorder_profiles recorder
      where recorder.organization_id = new.organization_id
        and lower(btrim(recorder.display_name)) = lower(btrim(new.display_name))
        and recorder.active = true
    ) then
      return new;
    end if;

    insert into public.recorder_profiles (organization_id, display_name, created_by)
    values (new.organization_id, new.display_name, new.id)
    returning id into matched_recorder_id;
  end if;

  update public.profiles
  set recorder_profile_id = matched_recorder_id
  where id = new.id and recorder_profile_id is null;
  return new;
end;
$$;
