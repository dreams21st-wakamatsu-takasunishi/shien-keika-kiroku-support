alter table public.children
  add column if not exists birth_date date;

alter table public.record_templates
  add column if not exists wizard_questions jsonb not null default '{}'::jsonb;

comment on column public.children.birth_date is
  '児童の生年月日。画面表示時の学年自動計算に使用する。';

comment on column public.record_templates.wizard_questions is
  '記録ウィザードの固定質問文、補足文、選択肢および備考欄設定。';
