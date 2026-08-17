-- Keep a trace of edits to sensitive transport coordinates and dispatch zones.

drop trigger if exists audit_transport_map_locations_after on public.transport_map_locations;
create trigger audit_transport_map_locations_after
  after insert or update or delete on public.transport_map_locations
  for each row execute function public.write_audit_log();

drop trigger if exists audit_transport_area_zones_after on public.transport_area_zones;
create trigger audit_transport_area_zones_after
  after insert or update or delete on public.transport_area_zones
  for each row execute function public.write_audit_log();
