-- Restore only the append-only audit needed by manual Tiro copy/file export.
-- Existing meeting RLS and device/actor/audit triggers remain unchanged.
-- No AI policy/RPC/API/key or automatic external transfer is re-enabled.
grant insert on public.meeting_export_events to authenticated;
