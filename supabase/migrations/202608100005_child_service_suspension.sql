-- Keep suspended children in the roster while excluding them from current and future transport planning.

alter table public.children
  add column if not exists service_suspended boolean not null default false;

create index if not exists children_transport_available_idx
  on public.children(organization_id, name)
  where deleted_at is null and service_suspended = false;

create or replace function public.remove_suspended_child_from_future_transport()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  should_remove boolean := false;
begin
  if new.service_suspended = true then
    if tg_op = 'INSERT' then
      should_remove := true;
    elsif old.service_suspended = false then
      should_remove := true;
    end if;
  end if;

  if should_remove then
    delete from public.daily_transport_requirements
    where organization_id = new.organization_id
      and child_id = new.id
      and service_date >= current_date;

    update public.transport_runs as run
    set stops = (
          select coalesce(jsonb_agg(entry.item order by entry.position), '[]'::jsonb)
          from jsonb_array_elements(coalesce(run.stops, '[]'::jsonb))
            with ordinality as entry(item, position)
          where entry.item ->> 'childId' is distinct from new.id
        ),
        updated_at = now()
    where run.organization_id = new.organization_id
      and run.service_date >= current_date
      and exists (
        select 1
        from jsonb_array_elements(coalesce(run.stops, '[]'::jsonb)) as entry(item)
        where entry.item ->> 'childId' = new.id
      );
  end if;

  return new;
end;
$$;

revoke all on function public.remove_suspended_child_from_future_transport() from public;

drop trigger if exists remove_suspended_child_from_future_transport_after
  on public.children;
create trigger remove_suspended_child_from_future_transport_after
  after insert or update of service_suspended on public.children
  for each row execute function public.remove_suspended_child_from_future_transport();

comment on column public.children.service_suspended is
  'Keeps the child registered while excluding them from current and future transport planning.';
