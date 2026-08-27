-- Allow staff leave to be the single source of truth in the business calendar.
-- Attendance and transport Gantt views project this event as unavailable time;
-- ordinary work schedules remain in attendance_records and are not duplicated.

alter table public.calendar_events
  drop constraint if exists calendar_events_event_type_check;

alter table public.calendar_events
  add constraint calendar_events_event_type_check
  check (event_type in (
    '通常利用', '追加利用', '欠席', '勤務予定', '職員休み', '会議', '外出',
    '朝礼', '研修', '保護者面談', '学校行事', '事業所行事',
    '送迎予定', '提出期限', 'その他'
  ));

