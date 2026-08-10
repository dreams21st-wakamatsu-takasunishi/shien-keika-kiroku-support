-- Allow the approval-gated home assistant to update one child's daily
-- pickup/drop-off requirement. The action remains auditable in assistant_actions.

alter table public.assistant_actions
  drop constraint if exists assistant_actions_action_type_check;

alter table public.assistant_actions
  add constraint assistant_actions_action_type_check
  check (
    action_type in (
      'schedule_regular_days',
      'update_child_profile',
      'update_child_notes',
      'update_daily_transport',
      'start_support_record',
      'open_child_records',
      'summarize_recent_records'
    )
  );
