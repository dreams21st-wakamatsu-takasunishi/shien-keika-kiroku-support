-- Private metadata only: no files, record bodies or AI requests. Changes are append-only.
create or replace function public.can_manage_child_documents()
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and public.current_user_role() in ('admin','manager')
 and public.current_request_device_kind() is distinct from 'personal'
 and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.organization_id=public.current_organization_id());
$$;
revoke all on function public.can_manage_child_documents() from public,anon;
grant execute on function public.can_manage_child_documents() to authenticated;

create or replace function public.valid_child_document_months(months integer[])
returns boolean language sql immutable set search_path=public as $$
 select months is not null and cardinality(months)<=12 and not exists(select 1 from unnest(months) m where m is null or m<1 or m>12)
 and cardinality(months)=(select count(distinct m) from unnest(months) m);
$$;

create table public.child_document_settings(
 organization_id uuid not null,
 child_id text not null,
 revision bigint not null check(revision>0),
 contract_date date not null check(contract_date between '1900-01-01' and '2100-12-31'),
 monitoring_months integer[] not null default '{}' check(public.valid_child_document_months(monitoring_months)),
 effective_from date not null check(effective_from between '1900-01-01' and '2100-12-31'),
 created_by uuid not null,
 created_by_name text not null,
 created_at timestamptz not null default now(),
 primary key(organization_id,child_id,revision),
 foreign key(organization_id,child_id) references public.children(organization_id,id) on delete restrict
);
create table public.child_document_entries(
 id uuid primary key,
 organization_id uuid not null,
 child_id text not null,
 document_type text not null check(document_type in ('face','assessment','benefit','usage_plan','annex','plan_draft','plan_meeting','plan_final','monitoring','certificate','contract','important','portrait','privacy','additional')),
 cycle_key text not null check(length(cycle_key) between 1 and 100),
 document_date date,
 title text not null default '' check(length(title)<=120),
 confirmed boolean not null default false,
 note text not null default '' check(length(note)<=1500),
 valid_until date,
 consent_date date,
 guardian_delivery_date date,
 consultation_delivery_date date,
 operation text not null default 'record' check(operation in ('record','void')),
 replaces_id uuid unique references public.child_document_entries(id) on delete restrict,
 created_by uuid not null,
 created_by_name text not null,
 created_at timestamptz not null default now(),
 foreign key(organization_id,child_id) references public.children(organization_id,id) on delete restrict,
 check(replaces_id is distinct from id),
 check(operation<>'void' or replaces_id is not null)
);
create index child_document_entries_scope_idx on public.child_document_entries(organization_id,child_id,document_type,cycle_key);
alter table public.child_document_settings enable row level security;
alter table public.child_document_entries enable row level security;
create policy child_document_settings_read on public.child_document_settings for select to authenticated
 using(organization_id=public.current_organization_id() and public.can_manage_child_documents());
create policy child_document_entries_read on public.child_document_entries for select to authenticated
 using(organization_id=public.current_organization_id() and public.can_manage_child_documents());
revoke all on public.child_document_settings,public.child_document_entries from public,anon,authenticated;
grant select on public.child_document_settings,public.child_document_entries to authenticated;

create or replace function public.protect_child_document_history()
returns trigger language plpgsql set search_path=public as $$
begin raise exception using errcode='42501',message='DOCUMENT_HISTORY_IMMUTABLE: 過去の履歴は変更・削除できません。訂正を追加してください。';end;
$$;
create trigger child_document_settings_immutable before update or delete on public.child_document_settings for each row execute function public.protect_child_document_history();
create trigger child_document_entries_immutable before update or delete on public.child_document_entries for each row execute function public.protect_child_document_history();

create or replace function public.get_child_document_register()
returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_organization_id();begin
 if not coalesce(public.can_manage_child_documents(),false) then raise exception using errcode='42501',message='DOCUMENT_ACCESS_DENIED: 管理者・児発管のみ利用できます。';end if;
 return jsonb_build_object('settings',coalesce((select jsonb_agg(s order by s.child_id,s.revision) from public.child_document_settings s where s.organization_id=org),'[]'),
  'entries',coalesce((select jsonb_agg(e order by e.created_at,e.id) from public.child_document_entries e where e.organization_id=org),'[]'));
end;$$;

create or replace function public.save_child_document_settings(p_child_id text,p_expected_revision bigint,p_contract_date date,p_monitoring_months integer[],p_effective_from date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_organization_id();last_row public.child_document_settings%rowtype;next_row public.child_document_settings%rowtype;begin
 if not coalesce(public.can_manage_child_documents(),false) then raise exception using errcode='42501',message='DOCUMENT_ACCESS_DENIED: 管理者・児発管のみ利用できます。';end if;
 perform 1 from public.children where organization_id=org and id=p_child_id and deleted_at is null for update;
 if not found then raise exception using errcode='22023',message='DOCUMENT_CHILD_INVALID: 対象児童を確認してください。';end if;
 if p_contract_date is null or p_contract_date not between '1900-01-01' and '2100-12-31' or p_effective_from is null or p_effective_from not between '1900-01-01' and '2100-12-31' or not public.valid_child_document_months(p_monitoring_months) then
  raise exception using errcode='22023',message='DOCUMENT_SETTINGS_INVALID: 契約日と更新月・適用日を確認してください。';end if;
 select * into last_row from public.child_document_settings where organization_id=org and child_id=p_child_id order by revision desc limit 1;
 if coalesce(last_row.revision,0)<>p_expected_revision or p_expected_revision is null then
  if last_row.revision=p_expected_revision+1 and last_row.contract_date=p_contract_date and last_row.monitoring_months=p_monitoring_months and last_row.effective_from=p_effective_from then return to_jsonb(last_row);end if;
  raise exception using errcode='40001',message='DOCUMENT_CONFLICT: 設定が他の画面で更新されました。再読込して確認してください。';end if;
 if last_row.revision is null and p_effective_from<>p_contract_date then raise exception using errcode='22023',message='DOCUMENT_SETTINGS_INVALID: 初回の適用日は契約日としてください。';end if;
 if last_row.revision is not null and p_effective_from<greatest(last_row.effective_from,(now() at time zone 'Asia/Tokyo')::date) then raise exception using errcode='22023',message='DOCUMENT_SETTINGS_INVALID: 過去の更新月を消さないよう、本日以降かつ直前の適用日以降を指定してください。';end if;
 insert into public.child_document_settings(organization_id,child_id,revision,contract_date,monitoring_months,effective_from,created_by,created_by_name)
 values(org,p_child_id,p_expected_revision+1,p_contract_date,p_monitoring_months,p_effective_from,auth.uid(),(select display_name from public.profiles where id=auth.uid())) returning * into next_row;
 return to_jsonb(next_row);
end;$$;

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
revoke all on function public.get_child_document_register(),public.save_child_document_settings(text,bigint,date,integer[],date),public.save_child_document_entry(text,jsonb) from public,anon;
grant execute on function public.get_child_document_register(),public.save_child_document_settings(text,bigint,date,integer[],date),public.save_child_document_entry(text,jsonb) to authenticated;
