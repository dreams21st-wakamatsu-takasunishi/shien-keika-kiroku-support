-- Preserve original document rows and edit/void history.
alter table public.child_document_entries add column plan_start_date date
 check(plan_start_date is null or (document_type='plan_final' and plan_start_date between '1900-01-01' and '2100-12-31'));

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
 if p_entry ? 'planStartDate' then
  if next_row.document_type is distinct from 'plan_final'
    or jsonb_typeof(p_entry->'planStartDate') is distinct from 'string'
    or (p_entry->>'planStartDate' <> '' and (p_entry->>'planStartDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
   raise exception using errcode='22023',message='DOCUMENT_PLAN_START_INVALID: 個支本案の開始日を確認してください。';end if;
  next_row.plan_start_date:=nullif(p_entry->>'planStartDate','')::date;
 elsif next_row.document_type='plan_final' and next_row.replaces_id is not null then
  -- Older clients must not erase a start date when editing other fields.
  select plan_start_date into next_row.plan_start_date from public.child_document_entries
   where id=next_row.replaces_id and organization_id=org and child_id=p_child_id and document_type='plan_final';
 end if;
 if next_row.plan_start_date is not null and next_row.plan_start_date not between '1900-01-01' and '2100-12-31' then
  raise exception using errcode='22023',message='DOCUMENT_PLAN_START_INVALID: 個支本案の開始日を確認してください。';end if;
 if p_entry ? 'entitlements' then
  if next_row.document_type is distinct from 'benefit' or not public.valid_child_benefit_entitlements(p_entry->'entitlements') then
   raise exception using errcode='22023',message='DOCUMENT_ENTITLEMENTS_INVALID: 支給量と個別サポートの区分を確認してください。';end if;
  next_row.entitlements:=p_entry->'entitlements';
 elsif next_row.document_type='benefit' and next_row.replaces_id is not null then
  select entitlements into next_row.entitlements from public.child_document_entries
   where id=next_row.replaces_id and organization_id=org and child_id=p_child_id and document_type='benefit';
 end if;
 if next_row.cycle_key ~ '^(initial|plan|extra):visit-' then
  if next_row.document_type not in ('contract','important','portrait','privacy','visiting_consent','plan_draft','plan_meeting','plan_final','monitoring')
   or (next_row.replaces_id is null and not exists(select 1 from public.children c where c.organization_id=org and c.id=p_child_id
    and (c.visiting_support_enabled or c.care_type='保育所等訪問支援'))) then
   raise exception 'DOCUMENT_VISITING_SCOPE_INVALID' using errcode='22023';end if;
 elsif next_row.document_type='visiting_consent' then
  raise exception 'DOCUMENT_VISITING_SCOPE_REQUIRED' using errcode='22023';
 end if;
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
 if next_row.document_type not in ('certificate','contract','important','portrait','privacy','visiting_consent','additional') and next_row.operation='record' and next_row.document_date is null then
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

-- A new RPC prevents a new client from appearing to save on an older database.
create function public.save_child_document_entry_v4(p_child_id text,p_entry jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
begin
 if not coalesce(public.can_manage_child_documents(),false) then raise exception using errcode='42501',message='DOCUMENT_ACCESS_DENIED: 管理者・児発管のみ利用できます。';end if;
 if p_entry->>'type'='plan_final' and p_entry->>'cycleKey' ~ '^(initial|plan|extra):visit-'
  and p_entry->>'operation'='record' and coalesce(p_entry->>'planStartDate','')='' then
  raise exception using errcode='22023',message='DOCUMENT_PLAN_START_REQUIRED: 訪問支援の個支本案の開始日を入力してください。';
 end if;
 return public.save_child_document_entry(p_child_id,p_entry);
end;$$;

-- One versioned exception per organization; never changes document entries.
create table public.child_document_visiting_exceptions (
 organization_id uuid not null,
 revision bigint not null check(revision>0),
 starts_on date not null check(starts_on between '1900-01-01' and '2100-12-31'),
 ends_on date not null check(ends_on between starts_on and '2100-12-31'),
 reason text not null check(length(btrim(reason)) between 1 and 300),
 enabled boolean not null,
 created_by uuid,
 created_via text not null default 'app'
  check((created_via='app' and created_by is not null) or (created_via='maintenance' and created_by is null)),
 created_at timestamptz not null default now(),
 primary key(organization_id,revision)
);
alter table public.child_document_visiting_exceptions enable row level security;
revoke all on public.child_document_visiting_exceptions from public,anon,authenticated;
create trigger child_document_visiting_exceptions_immutable before update or delete
 on public.child_document_visiting_exceptions for each row execute function public.protect_child_document_history();

create function public.save_child_document_visiting_exception(p_expected_revision bigint,p_from date,p_through date,p_reason text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_organization_id(); previous public.child_document_visiting_exceptions%rowtype;
 next_row public.child_document_visiting_exceptions%rowtype; clean_reason text:=btrim(p_reason);
begin
 if org is null or not coalesce(public.can_manage_child_documents(),false) then
  raise exception using errcode='42501',message='DOCUMENT_ACCESS_DENIED: 管理者・児発管のみ利用できます。';end if;
 if p_expected_revision is null or p_expected_revision<0 or p_from is null or p_through is null
  or p_from<'1900-01-01' or p_through>'2100-12-31' or p_from>p_through
  or p_through>=(now() at time zone 'Asia/Tokyo')::date
  or clean_reason is null or length(clean_reason) not between 1 and 300 or p_enabled is null then
  raise exception using errcode='22023',message='DOCUMENT_VISITING_EXCEPTION_INVALID: 過去の対象期間と理由を確認してください。';end if;
 perform pg_advisory_xact_lock(hashtextextended('child-document-visiting-exception:'||org::text,0));
 select * into previous from public.child_document_visiting_exceptions where organization_id=org order by revision desc limit 1;
 if previous.revision=p_expected_revision+1 and previous.starts_on=p_from and previous.ends_on=p_through and previous.reason=clean_reason and previous.enabled=p_enabled then
  return to_jsonb(previous);
 end if;
 if coalesce(previous.revision,0)<>p_expected_revision then
  raise exception using errcode='40001',message='DOCUMENT_CONFLICT: 例外設定が更新されました。再読込してください。';end if;
 insert into public.child_document_visiting_exceptions(organization_id,revision,starts_on,ends_on,reason,enabled,created_by)
 values(org,p_expected_revision+1,p_from,p_through,clean_reason,p_enabled,auth.uid()) returning * into next_row;
 return to_jsonb(next_row);
end;$$;

create or replace function public.get_child_document_register()
returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_organization_id();begin
 if not coalesce(public.can_manage_child_documents(),false) then raise exception using errcode='42501',message='DOCUMENT_ACCESS_DENIED: 管理者・児発管のみ利用できます。';end if;
 return jsonb_build_object('settings',coalesce((select jsonb_agg(s order by s.child_id,s.revision) from public.child_document_settings s where s.organization_id=org),'[]'),
  'entries',coalesce((select jsonb_agg(e order by e.created_at,e.id) from public.child_document_entries e where e.organization_id=org),'[]'),
  'visiting_review_exception',(select to_jsonb(e)-array['organization_id','created_by','created_via'] from public.child_document_visiting_exceptions e where e.organization_id=org order by e.revision desc limit 1));
end;$$;

revoke all on function public.save_child_document_entry_v4(text,jsonb),public.save_child_document_visiting_exception(bigint,date,date,text,boolean) from public,anon;
grant execute on function public.save_child_document_entry_v4(text,jsonb),public.save_child_document_visiting_exception(bigint,date,date,text,boolean) to authenticated;
