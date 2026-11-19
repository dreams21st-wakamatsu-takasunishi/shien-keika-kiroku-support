-- Visit reports are separate from protected contract and document registers.
create or replace function public.can_use_visiting_support_reports()
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null
    and public.current_request_device_kind() in ('unmanaged', 'facility_shared')
    and exists (select 1 from public.profiles p where p.id=auth.uid()
      and p.active and p.organization_id=public.current_organization_id());
$$;
revoke all on function public.can_use_visiting_support_reports() from public, anon;
grant execute on function public.can_use_visiting_support_reports() to authenticated;

alter policy visiting_support_reports_read on public.visiting_support_reports using (
  organization_id = (select public.current_organization_id())
  and (select public.can_use_visiting_support_reports())
  and (created_by = (select auth.uid()) or (select public.can_manage_child_documents()))
);

create or replace function public.save_visiting_support_report(
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
  if org is null or not coalesce(public.can_use_visiting_support_reports(), false) then
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
        and (created_by=actor or public.can_manage_child_documents())
      returning * into saved;
  end if;
  if saved.id is null then
    -- A retry after a lost response can acknowledge the exact same save.
    select * into saved from public.visiting_support_reports as r
      where r.id=p_id and r.organization_id=org and r.child_id=p_child_id
        and r.revision=p_expected_revision+1 and r.updated_by=actor
        and (created_by=actor or public.can_manage_child_documents())
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
create or replace function public.set_recorder_menu_preferences(p_organization_id uuid,p_recorder_profile_id uuid,p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_allowed constant text[]:=array['home','dailyChanges','todayWork','attendance','calendar','monthlySchedule','trafficCost','activityPlans','facilityWork','legalTraining','visitingReports','operations','communication','assistant','form','records','meetings','learning','children','templates','team'];
 v_order jsonb;v_hidden jsonb;v_preferences jsonb;
begin
 if p_organization_id is distinct from public.current_organization_id() then raise exception 'Recorder menu settings require organization access.' using errcode='42501';end if;
 if jsonb_typeof(coalesce(p_preferences,'{}'::jsonb))<>'object' then raise exception 'Menu preferences must be an object.' using errcode='22023';end if;
 v_order:=coalesce(p_preferences->'order','[]'::jsonb);v_hidden:=coalesce(p_preferences->'hidden','[]'::jsonb);
 if jsonb_typeof(v_order)<>'array' or jsonb_typeof(v_hidden)<>'array' then raise exception 'Menu order and hidden values must be arrays.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements_text(v_order) v(value) where not(v.value=any(v_allowed))) or exists(select 1 from jsonb_array_elements_text(v_hidden) v(value) where not(v.value=any(v_allowed))) then raise exception 'Menu preferences contain an unknown item.' using errcode='22023';end if;
 select jsonb_build_object('order',coalesce((select jsonb_agg(value order by first_position) from(select value,min(position) first_position from jsonb_array_elements_text(v_order) with ordinality as ordered(value,position) group by value)x),'[]'::jsonb),'hidden',coalesce((select jsonb_agg(value order by first_position) from(select value,min(position) first_position from jsonb_array_elements_text(v_hidden) with ordinality as hidden(value,position) where value<>'home' group by value)x),'[]'::jsonb)) into v_preferences;
 update public.recorder_profiles set menu_preferences=v_preferences where organization_id=p_organization_id and id=p_recorder_profile_id and active;
 if not found then raise exception 'Active recorder profile was not found.' using errcode='P0002';end if;return v_preferences;
end; $$;
revoke all on function public.set_recorder_menu_preferences(uuid,uuid,jsonb) from public,anon;
grant execute on function public.set_recorder_menu_preferences(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
