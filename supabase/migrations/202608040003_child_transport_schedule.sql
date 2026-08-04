-- Child-specific facts used by the daily drag-and-drop transport board.
-- Times are stored per weekday so school timetables can differ by day.

alter table public.children
  add column if not exists school_name text,
  add column if not exists sibling_group text,
  add column if not exists transport_schedule jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'children_transport_schedule_array_check'
      and conrelid = 'public.children'::regclass
  ) then
    alter table public.children
      add constraint children_transport_schedule_array_check
      check (jsonb_typeof(transport_schedule) = 'array');
  end if;
end $$;

comment on column public.children.school_name is
  'School or main pickup facility name used for transport grouping.';
comment on column public.children.sibling_group is
  'Shared family label used to keep siblings in the same transport run where capacity permits.';
comment on column public.children.transport_schedule is
  'Per-weekday school end, pickup and drop-off target times for daily transport planning.';
