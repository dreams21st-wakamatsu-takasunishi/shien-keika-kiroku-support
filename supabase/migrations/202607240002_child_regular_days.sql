alter table public.children
  add column if not exists regular_days text[] not null default '{}';

comment on column public.children.regular_days is
  '児童の定期利用曜日。月・火・水・木・金・土・日の配列。';
