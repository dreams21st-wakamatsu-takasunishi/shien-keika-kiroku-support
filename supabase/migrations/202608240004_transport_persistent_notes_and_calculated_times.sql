-- Persist child-level transport reminders and route-calculated daily times.

alter table public.children
  add column if not exists transport_permanent_note text;

comment on column public.children.transport_permanent_note is
  'Always-visible transport reminder, for example a required child seat or contact instruction.';

alter table public.daily_transport_requirements
  add column if not exists pickup_planned_time time,
  add column if not exists dropoff_planned_time time,
  add column if not exists planned_time_updated_at timestamptz;

comment on column public.daily_transport_requirements.pickup_planned_time is
  'Pickup or boarding time calculated and confirmed in the daily dispatch planner.';
comment on column public.daily_transport_requirements.dropoff_planned_time is
  'Drop-off time calculated and confirmed in the daily dispatch planner.';
comment on column public.daily_transport_requirements.planned_time_updated_at is
  'Timestamp associated with the last reflected dispatch calculation.';
