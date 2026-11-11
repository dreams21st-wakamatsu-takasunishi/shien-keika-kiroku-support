-- Per-certificate monitoring schedule. NULL marks an older record; {} is an explicit empty selection.
-- No historical rows, privileges, or existing RLS policies are changed.
alter table public.child_document_entries
 add column if not exists monitoring_months integer[]
 check(monitoring_months is null or (document_type='benefit' and public.valid_child_document_months(monitoring_months)));

create or replace function public.save_child_document_entry(p_child_id text,p_entry jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_organization_id();next_row public.child_document_entries%rowtype;old_row public.child_document_entries%rowtype;existing public.child_document_entries%rowtype;today date:=(now() at time zone 'Asia/Tokyo')::date;begin
 if not coalesce(public.can_manage_child_documents(),false) then raise exception using errcode='42501',message='DOCUMENT_ACCESS_DENIED: 管理者・児発管のみ利用できます。';end if;
 perform 1 from public.children where organization_id=org and id=p_child_id and deleted_at is null for update;
 if not found then raise exception using errcode='22023',message='DOCUMENT_CHILD_INVALID: 対象児童を確認してください。';end if;
 if jsonb_typeof(p_entry) is distinct from 'object' or jsonb_typeof(p_entry->'confirmed') is distinct from 'boolean' then raise exception using errcode='22023',message='DOCUMENT_ENTRY_INVALID: 入力内容を確認してください。';end if;
 next_row.id:=(p_entry->>'id')::uuid;next_row.organization_id:=org;next_row.child_id:=p_child_id;
 next_row.document_type:=p_entry->>'type';next_row.cycle_key:=p_entry->>'cycleKey';
 next_row.document_date:=nullif(p_entry->>'documentDate','')::date;next_row.title:=btrim(coalesce(p_entry->>'title',''));
 next_row.confirmed:=(p_entry->>'confirmed')::boolean;next_row.note:=btrim(coalesce(p_entry->>'note',''));
 next_row.valid_until:=nullif(p_entry->>'validUntil','')::date;next_row.consent_date:=nullif(p_entry->>'consentDate','')::date;
 next_row.guardian_delivery_date:=nullif(p_entry->>'guardianDeliveryDate','')::date;next_row.consultation_delivery_date:=nullif(p_entry->>'consultationDeliveryDate','')::date;
 next_row.operation:=p_entry->>'operation';next_row.replaces_id:=nullif(p_entry->>'replacesId','')::uuid;
 if p_entry ? 'monitoringMonths' then
  if next_row.document_type is distinct from 'benefit' or jsonb_typeof(p_entry->'monitoringMonths') is distinct from 'array' then
   raise exception using errcode='22023',message='DOCUMENT_MONTHS_INVALID: 受給者証のモニタリング時期を確認してください。';end if;
  if jsonb_array_length(p_entry->'monitoringMonths')>12 or exists(
   select 1 from jsonb_array_elements(p_entry->'monitoringMonths') as item(value)
   where jsonb_typeof(value)<>'number' or (value #>> '{}') !~ '^([1-9]|1[0-2])$'
  ) then raise exception using errcode='22023',message='DOCUMENT_MONTHS_INVALID: 1～12月から選択してください。';end if;
  select coalesce(array_agg(month::integer order by month::integer),'{}'::integer[])
   into next_row.monitoring_months from jsonb_array_elements_text(p_entry->'monitoringMonths') as item(month);
  if not public.valid_child_document_months(next_row.monitoring_months) then
   raise exception using errcode='22023',message='DOCUMENT_MONTHS_INVALID: 同じ月が重複しています。';end if;
 elsif next_row.document_type='benefit' and next_row.replaces_id is not null then
  -- An older client can correct other fields without removing registered months.
  select monitoring_months into next_row.monitoring_months from public.child_document_entries
   where id=next_row.replaces_id and organization_id=org and child_id=p_child_id and document_type='benefit';
 end if;
 next_row.created_by:=auth.uid();next_row.created_by_name:=(select display_name from public.profiles where id=auth.uid());next_row.created_at:=now();
 if next_row.document_type not in ('certificate','contract','important','portrait','privacy','additional') and next_row.operation='record' and next_row.document_date is null then
  raise exception using errcode='22023',message='DOCUMENT_DATE_REQUIRED: 作成日を入力してください。';end if;
 if next_row.document_type='certificate' and (next_row.title='' or next_row.document_date is not null) then raise exception using errcode='22023',message='DOCUMENT_TITLE_REQUIRED: 証明書名を入力してください（日付入力は不要です）。';end if;
 if next_row.document_type='additional' and next_row.title='' then raise exception using errcode='22023',message='DOCUMENT_TITLE_REQUIRED: 書類名を入力してください。';end if;
 if exists(select 1 from unnest(array[next_row.document_date,next_row.consent_date,next_row.guardian_delivery_date,next_row.consultation_delivery_date]) d where d<'1900-01-01' or d>today)
 or (next_row.valid_until is not null and (next_row.document_type<>'benefit' or next_row.valid_until<'1900-01-01' or next_row.valid_until>'2100-12-31'))
 or (next_row.document_type<>'plan_final' and coalesce(next_row.consent_date,next_row.guardian_delivery_date,next_row.consultation_delivery_date) is not null)
 or next_row.cycle_key !~ '^(initial:|annual:|plan:|extra:)[A-Za-z0-9-]+$' then
  raise exception using errcode='22023',message='DOCUMENT_ENTRY_INVALID: 日付・更新枠・書類の種類を確認してください。';end if;
 select * into existing from public.child_document_entries where id=next_row.id;
 if found then
  if (to_jsonb(existing)-array['created_by','created_by_name','created_at'])=(to_jsonb(next_row)-array['created_by','created_by_name','created_at']) then return to_jsonb(existing);end if;
  raise exception using errcode='40001',message='DOCUMENT_CONFLICT: 同じ登録IDの内容が変わっています。';end if;
 if next_row.replaces_id is not null then
  select * into old_row from public.child_document_entries where id=next_row.replaces_id and organization_id=org and child_id=p_child_id for update;
  if not found or old_row.operation<>'record' or old_row.document_type<>next_row.document_type or old_row.cycle_key<>next_row.cycle_key
   or exists(select 1 from public.child_document_entries where replaces_id=old_row.id) then raise exception using errcode='40001',message='DOCUMENT_CONFLICT: この書類は訂正・取消済みです。再読込してください。';end if;
 elsif next_row.operation='void' or exists(select 1 from public.child_document_entries e where e.organization_id=org and e.child_id=p_child_id and e.document_type=next_row.document_type and e.cycle_key=next_row.cycle_key and e.operation='record' and not exists(select 1 from public.child_document_entries r where r.replaces_id=e.id)) then
  raise exception using errcode='40001',message='DOCUMENT_CONFLICT: 同じ枠に登録済みの書類があります。訂正から操作してください。';end if;
 insert into public.child_document_entries select next_row.*;
 return to_jsonb(next_row);
end;$$;

-- The new UI uses this entry point when months are supplied, so an old DB
-- cannot accept the save while silently ignoring them.
create or replace function public.save_child_document_entry_v2(p_child_id text,p_entry jsonb)
returns jsonb language sql security invoker set search_path=public as $$
 select public.save_child_document_entry(p_child_id,p_entry);
$$;
revoke all on function public.save_child_document_entry_v2(text,jsonb) from public,anon;
grant execute on function public.save_child_document_entry_v2(text,jsonb) to authenticated;
