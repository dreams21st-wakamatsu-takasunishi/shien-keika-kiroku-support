-- Expand the approved home assistant with additional low-risk operational actions.

alter table public.assistant_actions
  drop constraint if exists assistant_actions_action_type_check;

alter table public.assistant_actions
  add constraint assistant_actions_action_type_check
  check (
    action_type in (
      'schedule_regular_days',
      'update_child_profile',
      'update_child_notes',
      'start_support_record',
      'open_child_records',
      'summarize_recent_records'
    )
  );

comment on table public.assistant_actions is
  'AIが作成した実行案、承認状態、実行結果を保持する監査ログ。許可リスト外の操作は保存・実行しない。';
