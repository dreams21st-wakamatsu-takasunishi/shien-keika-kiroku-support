-- Keep holiday auto-dispatch departures within facility operating hours while
-- still allowing an explicitly confirmed earlier manual departure.

alter table public.transport_route_settings
  add column if not exists holiday_opening_time time not null default '09:00';

comment on column public.transport_route_settings.holiday_opening_time is
  'Earliest automatic departure time for holiday/home pickup routes.';
