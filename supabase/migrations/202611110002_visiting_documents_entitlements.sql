-- Additive, append-only document metadata; no existing row is rewritten.
create or replace function public.valid_child_benefit_entitlements(v jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
begin
 if jsonb_typeof(v) is distinct from 'object' then return false;end if;
 if (select count(*) from jsonb_object_keys(v))<>5
  or not (v ?& array['dayServiceDays','visitingDays','visitingEnabled','individualSupportEnabled','individualSupportTypes'])
  or jsonb_typeof(v->'visitingEnabled')<>'boolean' or jsonb_typeof(v->'individualSupportEnabled')<>'boolean'
  or jsonb_typeof(v->'individualSupportTypes')<>'array' then return false;end if;
 if exists(select 1 from unnest(array[v->'dayServiceDays',v->'visitingDays']) days
   where days<>'null'::jsonb and (jsonb_typeof(days)<>'number' or (days #>> '{}') !~ '^(0|[1-9]|[12][0-9]|3[01])$'))
  or ((v->>'visitingEnabled')='false' and v->'visitingDays'<>'null'::jsonb) then return false;end if;
 return jsonb_array_length(v->'individualSupportTypes')<=3
  and not exists(select 1 from jsonb_array_elements(v->'individualSupportTypes') item where item not in ('"I"'::jsonb,'"II"'::jsonb,'"III"'::jsonb))
  and jsonb_array_length(v->'individualSupportTypes')=(select count(distinct item) from jsonb_array_elements(v->'individualSupportTypes') item)
  and ((v->>'individualSupportEnabled')='true')=(jsonb_array_length(v->'individualSupportTypes')>0);
end;$$;

alter table public.child_document_settings add column visiting_contract_date date
 check(visiting_contract_date between '1900-01-01' and '2100-12-31');
alter table public.child_document_entries add column entitlements jsonb
 check(entitlements is null or (document_type='benefit' and public.valid_child_benefit_entitlements(entitlements)));
alter table public.child_document_entries drop constraint child_document_entries_document_type_check;
alter table public.child_document_entries add constraint child_document_entries_document_type_check
 check(document_type in ('face','assessment','benefit','usage_plan','annex','plan_draft','plan_meeting','plan_final','monitoring','certificate','contract','important','portrait','privacy','additional','visiting_consent'));

create or replace function public.save_child_document_settings_v2(p_child_id text,p_expected_revision bigint,p_contract_date date,p_monitoring_months integer[],p_effective_from date,p_visiting_contract_date text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_organization_id();last_row public.child_document_settings%rowtype;next_row public.child_document_settings%rowtype;visit_date date;begin
 if not coalesce(public.can_manage_child_documents(),false) then raise exception using errcode='42501',message='DOCUMENT_ACCESS_DENIED: 管理者・児発管のみ利用できます。';end if;
 perform 1 from public.children where organization_id=org and id=p_child_id and deleted_at is null for update;
 if not found then raise exception using errcode='22023',message='DOCUMENT_CHILD_INVALID: 対象児童を確認してください。';end if;
 if p_contract_date is null or p_contract_date not between '1900-01-01' and '2100-12-31' or p_effective_from is null or p_effective_from not between '1900-01-01' and '2100-12-31' or not public.valid_child_document_months(p_monitoring_months) then
  raise exception using errcode='22023',message='DOCUMENT_SETTINGS_INVALID: 契約日と更新月・適用日を確認してください。';end if;
 select * into last_row from public.child_document_settings where organization_id=org and child_id=p_child_id order by revision desc limit 1;
 visit_date:=case when p_visiting_contract_date is null then last_row.visiting_contract_date else nullif(p_visiting_contract_date,'')::date end;
 if visit_date is not null and visit_date not between '1900-01-01' and '2100-12-31' then
  raise exception 'DOCUMENT_VISITING_DATE_INVALID' using errcode='22023';end if;
 if coalesce(last_row.revision,0)<>p_expected_revision or p_expected_revision is null then
  if last_row.revision=p_expected_revision+1 and last_row.contract_date=p_contract_date and last_row.monitoring_months=p_monitoring_months and last_row.effective_from=p_effective_from and last_row.visiting_contract_date is not distinct from visit_date then return to_jsonb(last_row);end if;
  raise exception using errcode='40001',message='DOCUMENT_CONFLICT: 設定が他の画面で更新されました。再読込して確認してください。';end if;
 if last_row.revision is null and p_effective_from<>p_contract_date then raise exception using errcode='22023',message='DOCUMENT_SETTINGS_INVALID: 初回の適用日は契約日としてください。';end if;
 if last_row.revision is not null and p_effective_from<greatest(last_row.effective_from,(now() at time zone 'Asia/Tokyo')::date) then raise exception using errcode='22023',message='DOCUMENT_SETTINGS_INVALID: 過去の更新月を消さないよう、本日以降かつ直前の適用日以降を指定してください。';end if;
 insert into public.child_document_settings(organization_id,child_id,revision,contract_date,monitoring_months,effective_from,visiting_contract_date,created_by,created_by_name)
 values(org,p_child_id,p_expected_revision+1,p_contract_date,p_monitoring_months,p_effective_from,visit_date,auth.uid(),(select display_name from public.profiles where id=auth.uid())) returning * into next_row;
 return to_jsonb(next_row);
end;$$;

create or replace function public.save_child_document_settings(p_child_id text,p_expected_revision bigint,p_contract_date date,p_monitoring_months integer[],p_effective_from date)
returns jsonb language sql security invoker set search_path=public as $$
 select public.save_child_document_settings_v2(p_child_id,p_expected_revision,p_contract_date,p_monitoring_months,p_effective_from,null);
$$;
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
create or replace function public.save_child_document_entry_v3(p_child_id text,p_entry jsonb)
returns jsonb language sql security invoker set search_path=public as $$
 select public.save_child_document_entry(p_child_id,p_entry);
$$;
revoke all on function public.save_child_document_settings_v2(text,bigint,date,integer[],date,text),public.save_child_document_entry_v3(text,jsonb) from public,anon;
grant execute on function public.save_child_document_settings_v2(text,bigint,date,integer[],date,text),public.save_child_document_entry_v3(text,jsonb) to authenticated;

-- Visiting schedules are deliberately separate from transport and attendance plans.
create table public.child_visiting_plans(
 organization_id uuid not null,
 child_id text not null,
 plan_date date not null check(plan_date between '1900-01-01' and '2100-12-31'),
 scheduled boolean not null default true,
 updated_by uuid not null,
 updated_at timestamptz not null default now(),
 primary key(organization_id,child_id,plan_date),
 foreign key(organization_id,child_id) references public.children(organization_id,id) on delete restrict
);
alter table public.child_visiting_plans enable row level security;
revoke all on public.child_visiting_plans from public,anon,authenticated;
create index child_visiting_plans_month_idx on public.child_visiting_plans(organization_id,plan_date) where scheduled;

create function public.child_service_view_org(p_purpose text) returns uuid
language plpgsql stable security definer set search_path=public as $$
declare org uuid:=public.current_organization_id();begin
 if auth.uid() is null or org is null or p_purpose is null or p_purpose not in ('record','schedule')
  or not coalesce(public.current_request_device_kind() in ('facility_shared','unmanaged'),false)
  or not exists(select 1 from public.profiles where id=auth.uid() and organization_id=org and active)
  or (p_purpose='schedule' and not coalesce(public.current_user_has_permission('manage_transport'),false))
 then raise exception 'CHILD_SERVICE_ACCESS_DENIED' using errcode='42501';end if;
 return org;
end;$$;
revoke all on function public.child_service_view_org(text) from public,anon,authenticated;

create function public.get_child_service_entitlements(p_date date,p_child_ids text[],p_purpose text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare org uuid:=public.child_service_view_org(p_purpose);result jsonb;visits jsonb:='[]';begin
 if p_date is null or p_date not between '1900-01-01' and '2100-12-31' or p_child_ids is null or cardinality(p_child_ids)>1000
 then raise exception 'CHILD_SERVICE_QUERY_INVALID' using errcode='22023';end if;
 select coalesce(jsonb_agg(case when p_purpose='record' then jsonb_build_object(
   'childId',c.id,'individualSupportTypes',coalesce(e.entitlements->'individualSupportTypes','[]'::jsonb))
  else jsonb_build_object('childId',c.id,'dayServiceDays',case when c.care_type is distinct from '保育所等訪問支援' then e.entitlements->'dayServiceDays' end,
   'visitingDays',case when c.visiting_support_enabled or c.care_type='保育所等訪問支援' then e.entitlements->'visitingDays' end) end),'[]'::jsonb)
 into result
 from public.children c
 join lateral (
  select b.entitlements,b.valid_until from public.child_document_entries b
  where b.organization_id=org and b.child_id=c.id and b.document_type='benefit' and b.operation='record'
   and b.document_date<=p_date
   and (b.cycle_key !~ '^extra:benefit-renewal-[0-9]{4}-[0-9]{2}-[0-9]{2}$' or right(b.cycle_key,10)<p_date::text)
   and not exists(select 1 from public.child_document_entries r where r.replaces_id=b.id)
  order by greatest(b.document_date::text,case when b.cycle_key ~ '^extra:benefit-renewal-[0-9]{4}-[0-9]{2}-[0-9]{2}$' then right(b.cycle_key,10) else b.document_date::text end) desc,
   b.document_date desc,b.created_at desc,b.id desc limit 1
 ) e on e.entitlements is not null and (e.valid_until is null or e.valid_until>=p_date)
 where c.organization_id=org and c.deleted_at is null and c.id=any(p_child_ids);
 if p_purpose='schedule' then
  select coalesce(jsonb_agg(jsonb_build_object('childId',v.child_id,'date',v.plan_date) order by v.plan_date,v.child_id),'[]'::jsonb)
   into visits from public.child_visiting_plans v join public.children c on c.organization_id=v.organization_id and c.id=v.child_id
   where v.organization_id=org and v.child_id=any(p_child_ids) and c.deleted_at is null
    and (c.visiting_support_enabled or c.care_type='保育所等訪問支援') and v.scheduled
    and v.plan_date>=date_trunc('month',p_date)::date and v.plan_date<(date_trunc('month',p_date)+interval '1 month')::date;
 end if;
 return jsonb_build_object('entitlements',result,'visits',visits);
end;$$;

create function public.set_child_visiting_plan(p_child_id text,p_date date,p_scheduled boolean)
returns void language plpgsql security definer set search_path=public as $$
declare org uuid:=public.child_service_view_org('schedule');begin
 if p_date is null or p_date not between '1900-01-01' and '2100-12-31' or p_scheduled is null
 then raise exception 'CHILD_VISITING_PLAN_INVALID' using errcode='22023';end if;
 perform 1 from public.children where organization_id=org and id=p_child_id and deleted_at is null
  and (visiting_support_enabled or care_type='保育所等訪問支援') for share;
 if not found then raise exception 'CHILD_VISITING_PLAN_CHILD_INVALID' using errcode='22023';end if;
 insert into public.child_visiting_plans(organization_id,child_id,plan_date,scheduled,updated_by)
 values(org,p_child_id,p_date,p_scheduled,auth.uid())
 on conflict(organization_id,child_id,plan_date) do update set scheduled=excluded.scheduled,updated_by=excluded.updated_by,updated_at=now()
 where child_visiting_plans.scheduled is distinct from excluded.scheduled;
end;$$;
revoke all on function public.get_child_service_entitlements(date,text[],text),public.set_child_visiting_plan(text,date,boolean) from public,anon;
grant execute on function public.get_child_service_entitlements(date,text[],text),public.set_child_visiting_plan(text,date,boolean) to authenticated;
notify pgrst,'reload schema';
