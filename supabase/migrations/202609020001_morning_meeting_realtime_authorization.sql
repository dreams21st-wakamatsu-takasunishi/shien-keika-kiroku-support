-- Restrict morning-meeting Broadcast and Presence topics to the signed-in
-- user's organization. Topic format:
-- organization:<organization_id>:morning-meeting:<yyyy-mm-dd>

drop policy if exists morning_meeting_realtime_receive on realtime.messages;
create policy morning_meeting_realtime_receive
  on realtime.messages
  for select
  to authenticated
  using (
    extension in ('broadcast', 'presence')
    and split_part(realtime.topic(), ':', 1) = 'organization'
    and split_part(realtime.topic(), ':', 2) = public.current_organization_id()::text
    and split_part(realtime.topic(), ':', 3) = 'morning-meeting'
  );

drop policy if exists morning_meeting_realtime_send on realtime.messages;
create policy morning_meeting_realtime_send
  on realtime.messages
  for insert
  to authenticated
  with check (
    extension in ('broadcast', 'presence')
    and split_part(realtime.topic(), ':', 1) = 'organization'
    and split_part(realtime.topic(), ':', 2) = public.current_organization_id()::text
    and split_part(realtime.topic(), ':', 3) = 'morning-meeting'
  );
