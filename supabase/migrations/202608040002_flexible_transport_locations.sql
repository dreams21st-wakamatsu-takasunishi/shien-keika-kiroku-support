alter table public.children
  add column if not exists transport_locations jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'children_transport_locations_array_check'
      and conrelid = 'public.children'::regclass
  ) then
    alter table public.children
      add constraint children_transport_locations_array_check
      check (jsonb_typeof(transport_locations) = 'array');
  end if;
end
$$;

comment on column public.children.transport_locations is
  'Additional pickup/drop-off locations with direction, weekday, effective period, and automatic suggestion settings.';
