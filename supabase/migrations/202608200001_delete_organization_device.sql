-- Managers may remove obsolete device registrations. Historical transport
-- events keep their audit data because their device foreign keys use SET NULL.
create or replace function public.delete_organization_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.organization_devices%rowtype;
begin
  if public.current_user_role() not in ('manager', 'admin') then
    raise exception using errcode = '42501', message = 'Manager access is required.';
  end if;

  select * into target
  from public.organization_devices
  where id = p_device_id
    and organization_id = public.current_organization_id()
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Device was not found.';
  end if;

  delete from public.organization_devices
  where id = target.id
    and organization_id = target.organization_id;
end;
$$;

revoke all on function public.delete_organization_device(uuid) from public;
grant execute on function public.delete_organization_device(uuid) to authenticated;
