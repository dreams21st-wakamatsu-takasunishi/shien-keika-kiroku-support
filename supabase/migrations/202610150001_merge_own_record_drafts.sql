-- Explicitly consolidate this account's unsaved input. No saved records are touched.
create or replace function public.merge_own_record_drafts(
  p_organization_id uuid,
  p_target_draft_key text,
  p_drafts jsonb,
  p_recorder_profile_id uuid default null,
  p_device_token text default null
)
returns table(new_revision bigint, saved_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_value public.record_drafts%rowtype;
  target_row public.record_drafts%rowtype;
  incoming jsonb;
  next_payload jsonb;
  date_value text;
  template_value text;
  ids jsonb := '[]'::jsonb;
  drafts_map jsonb := '{}'::jsonb;
  templates_map jsonb := '{}'::jsonb;
  steps_map jsonb := '{}'::jsonb;
  source_keys jsonb := '[]'::jsonb;
  expected_count integer;
  found_count integer := 0;
begin
  if auth.uid() is null or p_organization_id is distinct from public.current_organization_id()
     or not exists(select 1 from public.profiles where id=auth.uid() and organization_id=p_organization_id and active) then
    raise exception using errcode='42501', message='DRAFT_MERGE_DENIED: 本人の入力中記録のみまとめられます。';
  end if;
  perform set_config('app.support_device_token',coalesce(p_device_token,''),true);
  if public.current_recorder_profile_id() is not null
     and p_recorder_profile_id is distinct from public.current_recorder_profile_id() then
    raise exception using errcode='42501', message='DRAFT_MERGE_DENIED: 記録者の紐づきを確認してください。';
  end if;
  if jsonb_typeof(p_drafts) is distinct from 'array' then
    raise exception using errcode='22023', message='DRAFT_MERGE_INVALID: 対象を確認してください。';
  end if;
  expected_count:=jsonb_array_length(p_drafts);
  if expected_count<2 or expected_count>100
     or exists(select 1 from jsonb_array_elements(p_drafts) item where coalesce(item->>'draftKey','') not like 'record-%'
       or item->>'draftKey' like 'record-edit-%' or item->>'draftKey' like 'record-correction-%'
       or coalesce(item->>'revision','') !~ '^[1-9][0-9]{0,17}$')
     or (select count(distinct item->>'draftKey') from jsonb_array_elements(p_drafts) item)<>expected_count
     or not exists(select 1 from jsonb_array_elements(p_drafts) item where item->>'draftKey'=p_target_draft_key) then
    raise exception using errcode='22023', message='DRAFT_MERGE_INVALID: 新規入力の下書きを2件以上選択してください。';
  end if;
  -- Stable row-lock ordering and exact expected revisions prevent stale merges.
  for row_value in
    select d.* from public.record_drafts d where d.organization_id=p_organization_id
      and d.draft_key in (select item->>'draftKey' from jsonb_array_elements(p_drafts) item)
    order by d.draft_key for update
  loop
    found_count:=found_count+1;
    if row_value.user_id is distinct from auth.uid()
       or row_value.recorder_profile_id is distinct from p_recorder_profile_id then
      raise exception using errcode='42501', message='DRAFT_MERGE_DENIED: 別の職員の記録はまとめられません。';
    end if;
    if row_value.revision is distinct from (select (item->>'revision')::bigint from jsonb_array_elements(p_drafts) item where item->>'draftKey'=row_value.draft_key) then
      raise exception using errcode='40001', message='DRAFT_MERGE_CHANGED: 入力内容が更新されました。一覧を確認し直してください。';
    end if;
    incoming:=row_value.payload;
    if nullif(incoming->>'date','') is null or nullif(incoming->>'selectedTemplateId','') is null
       or jsonb_typeof(incoming->'selectedChildIds') is distinct from 'array'
       or jsonb_array_length(incoming->'selectedChildIds')=0
       or jsonb_typeof(incoming->'childDrafts') is distinct from 'object'
       or (incoming ? 'childTemplateIds' and jsonb_typeof(incoming->'childTemplateIds') is distinct from 'object')
       or (incoming ? 'childStepIds' and jsonb_typeof(incoming->'childStepIds') is distinct from 'object') then
      raise exception using errcode='22023', message='DRAFT_MERGE_INVALID: 下書きの形式を確認してください。';
    end if;
    if found_count=1 then date_value:=incoming->>'date';template_value:=incoming->>'selectedTemplateId';end if;
    if incoming->>'date' is distinct from date_value or incoming->>'selectedTemplateId' is distinct from template_value then
      raise exception using errcode='22023', message='DRAFT_MERGE_DIFFERENT: 別の日付・記録形式はまとめられません。';
    end if;
    if exists(select 1 from jsonb_array_elements(incoming->'selectedChildIds') child
       where jsonb_typeof(child)<>'string' or nullif(child#>>'{}','') is null
         or not ((incoming->'childDrafts') ? (child#>>'{}')) or ids @> jsonb_build_array(child))
       or (select count(distinct child) from jsonb_array_elements(incoming->'selectedChildIds') child)<>jsonb_array_length(incoming->'selectedChildIds')
       or exists(select 1 from jsonb_each(incoming->'childDrafts') child where drafts_map ? child.key and drafts_map->child.key is distinct from child.value)
       or exists(select 1 from jsonb_each(coalesce(incoming->'childTemplateIds','{}')) child where templates_map ? child.key and templates_map->child.key is distinct from child.value)
       or exists(select 1 from jsonb_each(coalesce(incoming->'childStepIds','{}')) child where steps_map ? child.key and steps_map->child.key is distinct from child.value) then
      raise exception using errcode='22023', message='DRAFT_MERGE_OVERLAP: 重なる児童の内容があります。上書きせず処理を停止しました。';
    end if;
    ids:=ids||(incoming->'selectedChildIds');
    drafts_map:=drafts_map||(incoming->'childDrafts');
    templates_map:=templates_map||coalesce(incoming->'childTemplateIds','{}');
    steps_map:=steps_map||coalesce(incoming->'childStepIds','{}');
    if row_value.draft_key=p_target_draft_key then target_row:=row_value;
    else source_keys:=source_keys||jsonb_build_array(row_value.draft_key);end if;
  end loop;
  if found_count<>expected_count then
    raise exception using errcode='40001', message='DRAFT_MERGE_CHANGED: 対象の記録が移動・保存されました。一覧を確認し直してください。';
  end if;
  -- Keep the target's child order and cursor, then append selected sources.
  select (target_row.payload->'selectedChildIds')||coalesce(jsonb_agg(child),'[]'::jsonb) into ids
    from jsonb_array_elements(ids) child where not ((target_row.payload->'selectedChildIds') @> jsonb_build_array(child));
  next_payload:=target_row.payload||jsonb_build_object('selectedChildIds',ids,'childDrafts',drafts_map,
    'childTemplateIds',templates_map,'childStepIds',steps_map,'updatedAt',now()::text,
    'takenOverAt',now()::text,'takenOverFromDraftKeys',coalesce(target_row.payload->'takenOverFromDraftKeys','[]'::jsonb)||source_keys);
  update public.record_drafts set payload=next_payload,revision=revision+1
    where organization_id=p_organization_id and draft_key=p_target_draft_key;
  -- Existing device-scope triggers remain active for both UPDATE and DELETE.
  delete from public.record_drafts where organization_id=p_organization_id and draft_key in(select jsonb_array_elements_text(source_keys));
  return query select d.revision,d.updated_at from public.record_drafts d where d.organization_id=p_organization_id and d.draft_key=p_target_draft_key;
end;
$$;
revoke all on function public.merge_own_record_drafts(uuid,text,jsonb,uuid,text) from public,anon;
grant execute on function public.merge_own_record_drafts(uuid,text,jsonb,uuid,text) to authenticated;
