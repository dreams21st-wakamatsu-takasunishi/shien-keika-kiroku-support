-- Editable, organization-unique device names. Administrator logins bypass
-- approval in the staff-login Edge Function; explicit revocation still wins.

with ranked_names as (
  select
    id,
    row_number() over (
      partition by organization_id, lower(btrim(label))
      order by
        case status when 'approved' then 0 when 'pending' then 1 else 2 end,
        updated_at desc,
        id
    ) as duplicate_number
  from public.organization_devices
)
update public.organization_devices device
set label = left(btrim(device.label), 117) || '・' || device.id::text
from ranked_names ranked
where device.id = ranked.id
  and ranked.duplicate_number > 1;

create unique index if not exists organization_devices_org_label_unique_idx
  on public.organization_devices(organization_id, lower(btrim(label)));

create or replace function public.rename_organization_device(
  p_device_id uuid,
  p_label text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id_value uuid := public.current_organization_id();
  normalized_label text := btrim(coalesce(p_label, ''));
begin
  if auth.uid() is null
     or organization_id_value is null
     or public.current_user_role() not in ('manager', 'admin') then
    raise exception using errcode = '42501', message = 'DEVICE_MANAGE_REQUIRED';
  end if;
  if char_length(normalized_label) < 1 or char_length(normalized_label) > 160 then
    raise exception using errcode = '22023', message = 'DEVICE_LABEL_INVALID';
  end if;
  if not exists (
    select 1 from public.organization_devices
    where organization_id = organization_id_value and id = p_device_id
  ) then
    raise exception using errcode = 'P0002', message = 'DEVICE_NOT_FOUND';
  end if;
  if exists (
    select 1 from public.organization_devices
    where organization_id = organization_id_value
      and id <> p_device_id
      and lower(btrim(label)) = lower(normalized_label)
  ) then
    raise exception using errcode = '23505', message = 'DEVICE_LABEL_DUPLICATE';
  end if;

  update public.organization_devices
  set label = normalized_label, updated_at = now()
  where organization_id = organization_id_value and id = p_device_id;
end;
$$;

revoke all on function public.rename_organization_device(uuid, text) from public;
grant execute on function public.rename_organization_device(uuid, text) to authenticated;
