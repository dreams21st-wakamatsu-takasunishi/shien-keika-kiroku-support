-- Individual staff-ID authentication without requiring a personal email address.
-- Existing shared staff accounts and recorder PIN flows remain available.

alter table public.organizations
  add column if not exists staff_login_code text;

update public.organizations
set staff_login_code = upper(encode(extensions.gen_random_bytes(5), 'hex'))
where staff_login_code is null;

alter table public.organizations
  alter column staff_login_code set not null,
  alter column staff_login_code set default upper(encode(extensions.gen_random_bytes(5), 'hex'));

alter table public.organizations
  drop constraint if exists organizations_staff_login_code_format;
alter table public.organizations
  add constraint organizations_staff_login_code_format
  check (staff_login_code ~ '^[A-Z0-9]{8,16}$');

create unique index if not exists organizations_staff_login_code_idx
  on public.organizations(lower(staff_login_code));

alter table public.recorder_profiles
  add column if not exists employee_code text,
  add column if not exists job_title text,
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists individual_login_enabled boolean not null default false;

alter table public.recorder_profiles
  drop constraint if exists recorder_profiles_employee_code_format;
alter table public.recorder_profiles
  add constraint recorder_profiles_employee_code_format
  check (
    employee_code is null
    or employee_code ~ '^[A-Za-z0-9._-]{3,32}$'
  );

alter table public.recorder_profiles
  drop constraint if exists recorder_profiles_job_title_length;
alter table public.recorder_profiles
  add constraint recorder_profiles_job_title_length
  check (job_title is null or char_length(trim(job_title)) between 1 and 100);

create unique index if not exists recorder_profiles_employee_code_idx
  on public.recorder_profiles(organization_id, lower(employee_code))
  where employee_code is not null;

create unique index if not exists recorder_profiles_auth_user_idx
  on public.recorder_profiles(auth_user_id)
  where auth_user_id is not null;

create or replace function public.current_recorder_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select recorder.id
  from public.recorder_profiles as recorder
  where recorder.organization_id = public.current_organization_id()
    and recorder.auth_user_id = auth.uid()
    and recorder.active = true
    and recorder.individual_login_enabled = true
  limit 1
$$;

revoke all on function public.current_recorder_profile_id() from public;
grant execute on function public.current_recorder_profile_id() to authenticated;

-- pin_hash and the internal auth-user binding must never be exposed through
-- the shared recorder roster. Re-apply the explicit selectable column list.
revoke select on public.recorder_profiles from authenticated;
grant select (
  id,
  organization_id,
  display_name,
  active,
  created_by,
  created_at,
  updated_at,
  pin_configured,
  menu_preferences,
  employee_code,
  job_title,
  individual_login_enabled
) on public.recorder_profiles to authenticated;
