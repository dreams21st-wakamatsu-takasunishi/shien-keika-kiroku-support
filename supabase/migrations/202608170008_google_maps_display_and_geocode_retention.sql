-- Google Maps display support and compliant refresh of cached geocodes.

alter table public.transport_map_locations
  add column if not exists google_place_id text;

alter table public.transport_map_locations
  alter column latitude drop not null,
  alter column longitude drop not null;

comment on column public.transport_map_locations.google_place_id is
  'Google Place ID retained to identify a location when refreshing an expired geocode.';

create or replace function public.purge_expired_google_geocodes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  update public.transport_map_locations
  set latitude = null,
      longitude = null
  where geocode_source = 'google'
    and geocoded_at < now() - interval '30 days'
    and (latitude is not null or longitude is not null);

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.purge_expired_google_geocodes() from public, anon, authenticated;
grant execute on function public.purge_expired_google_geocodes() to service_role;

select public.purge_expired_google_geocodes();

do $schedule$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron')
     and not exists (
       select 1 from cron.job
       where jobname = 'purge-expired-google-geocodes-daily'
     ) then
    perform cron.schedule(
      'purge-expired-google-geocodes-daily',
      '17 18 * * *',
      'select public.purge_expired_google_geocodes();'
    );
  end if;
end;
$schedule$;

comment on function public.purge_expired_google_geocodes() is
  'Clears Google-derived latitude and longitude after 30 days so the app refreshes them before reuse.';
