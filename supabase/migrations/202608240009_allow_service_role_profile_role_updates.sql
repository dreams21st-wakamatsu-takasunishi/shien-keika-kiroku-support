-- Role changes are performed by audited Edge Functions with the service-role
-- client after those functions verify the caller is an organization admin.
-- The original trigger treated that server context as an anonymous user and
-- rejected legitimate staff-ID role changes.

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.organization_id is distinct from old.organization_id or new.role is distinct from old.role)
     and coalesce(auth.role(), '') <> 'service_role'
     and coalesce(public.current_user_role(), '') <> 'admin' then
    raise exception using
      errcode = '42501',
      message = 'Only organization administrators can change roles or organization membership';
  end if;
  return new;
end;
$$;
