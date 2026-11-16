-- Optional roster fields may be supplied independently of transportation.
alter table public.children
  add column sex text check (char_length(sex) <= 40),
  add column school_class text check (char_length(school_class) <= 160);

-- Visit reports are separate from daily records and planning/entitlement tables.
create table public.visiting_support_reports (
  id uuid primary key,
  organization_id uuid not null,
  child_id text not null,
  revision integer not null default 1 check (revision > 0),
  visit_date date not null check (visit_date between '1900-01-01' and '2100-12-31'),
  report_date date not null check (report_date between '1900-01-01' and '2100-12-31'),
  author text not null check (char_length(btrim(author)) between 1 and 120),
  destination text not null check (char_length(btrim(destination)) between 1 and 160),
  content jsonb not null,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, child_id) references public.children(organization_id, id) on delete restrict
);
create index visiting_support_reports_child_date_idx
  on public.visiting_support_reports (organization_id, child_id, visit_date desc, id desc);

alter table public.visiting_support_reports enable row level security;
revoke all on public.visiting_support_reports from public, anon, authenticated;
grant select on public.visiting_support_reports to authenticated;
create policy visiting_support_reports_read on public.visiting_support_reports
  for select to authenticated using (
    organization_id = (select public.current_organization_id())
    and (select public.can_manage_child_documents())
  );

create function public.save_visiting_support_report(
  p_id uuid, p_child_id text, p_expected_revision integer,
  p_visit_date date, p_report_date date, p_author text, p_destination text, p_content jsonb
)
returns public.visiting_support_reports
language plpgsql security definer set search_path = public
as $$
declare
  org uuid := public.current_organization_id();
  actor uuid := auth.uid();
  saved public.visiting_support_reports;
  row_data jsonb;
  key text;
begin
  if org is null or not coalesce(public.can_manage_child_documents(), false) then
    raise exception '訪問支援報告書を操作する権限がありません。' using errcode = '42501';
  end if;
  perform 1 from public.children
    where organization_id = org and id = p_child_id and deleted_at is null
      and (visiting_support_enabled or care_type = '保育所等訪問支援') for share;
  if not found then
    raise exception '訪問支援を利用している児童を選択してください。' using errcode = '22023';
  end if;
  if p_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_visit_date is null or p_visit_date not between '1900-01-01' and '2100-12-31'
    or p_report_date is null or p_report_date not between p_visit_date and '2100-12-31'
    or coalesce(char_length(btrim(p_author)), 0) not between 1 and 120
    or coalesce(char_length(btrim(p_destination)), 0) not between 1 and 160
    or jsonb_typeof(p_content) is distinct from 'object'
    or octet_length(p_content::text) > 1500000 then
    raise exception '訪問日・作成日・作成者・訪問先と入力内容を確認してください。' using errcode = '22023';
  end if;
  foreach key in array array['childName','sex','affiliation','summary','nextSupport'] loop
    if jsonb_typeof(p_content->key) is distinct from 'string'
       or char_length(p_content->>key) > (case when key in ('summary','nextSupport') then 4000 when key='sex' then 40 else 160 end) then
      raise exception '基本情報またはまとめの入力内容を確認してください。' using errcode = '22023';
    end if;
  end loop;
  if btrim(p_content->>'childName') = ''
    or jsonb_typeof(p_content->'timeline') is distinct from 'array' then
    raise exception '児童名と活動の記録を確認してください。' using errcode = '22023';
  end if;
  -- Save only the report fields; roster birth dates must not be stored here.
  p_content := jsonb_build_object(
    'childName', p_content->'childName', 'sex', p_content->'sex', 'affiliation', p_content->'affiliation',
    'summary', p_content->'summary', 'nextSupport', p_content->'nextSupport', 'timeline', p_content->'timeline'
  );
  if jsonb_array_length(p_content->'timeline') not between 1 and 30 then
    raise exception '活動の記録は1～30件入力してください。' using errcode = '22023';
  end if;
  for row_data in select value from jsonb_array_elements(p_content->'timeline') loop
    foreach key in array array['startTime','endTime','activity','observation','notes'] loop
      if jsonb_typeof(row_data->key) is distinct from 'string' or char_length(row_data->>key) > 4000 then
        raise exception '活動の入力内容を確認してください。' using errcode = '22023';
      end if;
    end loop;
    if row_data->>'startTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (row_data->>'endTime' <> '' and (row_data->>'endTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or row_data->>'endTime' < row_data->>'startTime'))
      or btrim(row_data->>'activity') = '' then
      raise exception '活動ごとの開始時刻・終了時刻・活動内容を確認してください。' using errcode = '22023';
    end if;
  end loop;
  if p_expected_revision = 0 then
    insert into public.visiting_support_reports
      (id,organization_id,child_id,visit_date,report_date,author,destination,content,created_by,updated_by)
      values (p_id,org,p_child_id,p_visit_date,p_report_date,btrim(p_author),btrim(p_destination),p_content,actor,actor)
      on conflict (id) do nothing returning * into saved;
  else
    update public.visiting_support_reports
      set visit_date=p_visit_date, report_date=p_report_date, author=btrim(p_author),
          destination=btrim(p_destination), content=p_content, revision=revision+1,
          updated_by=actor, updated_at=now()
      where id=p_id and organization_id=org and child_id=p_child_id and revision=p_expected_revision
      returning * into saved;
  end if;
  if saved.id is null then
    -- A retry after a lost response can acknowledge the exact same save.
    select * into saved from public.visiting_support_reports as r
      where r.id=p_id and r.organization_id=org and r.child_id=p_child_id
        and r.revision=p_expected_revision+1 and r.updated_by=actor
        and r.visit_date=p_visit_date and r.report_date=p_report_date and r.author=btrim(p_author)
        and r.destination=btrim(p_destination) and r.content=p_content;
  end if;
  if saved.id is null then
    raise exception 'VISITING_REPORT_CONFLICT' using errcode = '40001';
  end if;
  return saved;
end;
$$;
revoke all on function public.save_visiting_support_report(uuid,text,integer,date,date,text,text,jsonb)
  from public, anon;
grant execute on function public.save_visiting_support_report(uuid,text,integer,date,date,text,text,jsonb)
  to authenticated;
notify pgrst, 'reload schema';
