-- Facility tools contain staff operational data, not child support records.
create table public.facility_documents (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  kind text not null check (kind in ('inspection','newsletter')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  document_date date,
  status text not null default '下書き' check (status in ('下書き','完了','保管')),
  is_template boolean not null default false,
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 200000),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (organization_id,id), check (is_template or document_date is not null)
);
create index facility_documents_recent_idx on public.facility_documents(organization_id,kind,updated_at desc);
create or replace function public.prepare_facility_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_key text; v_item jsonb;
begin
  if tg_op = 'INSERT' then new.created_by := auth.uid(); new.created_at := now(); new.revision := 1;
  else
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id or new.kind is distinct from old.kind or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then raise exception 'Immutable facility document identity'; end if;
    if new.revision <> old.revision + 1 then raise exception 'FACILITY_CONFLICT: reload before saving'; end if;
  end if;
  new.updated_by := auth.uid(); new.updated_at := now();
  foreach v_key in array array['author','notes','greeting','body','upcoming','belongings','contact'] loop
    if jsonb_typeof(new.content->v_key) is distinct from 'string' or char_length(new.content->>v_key) > 10000 then raise exception 'Invalid facility text'; end if;
  end loop;
  if jsonb_typeof(new.content->'items') is distinct from 'array' or jsonb_array_length(new.content->'items') > 80 then raise exception 'Invalid inspection items'; end if;
  if exists(select 1 from jsonb_array_elements(new.content->'items') i group by i->>'id' having count(*) > 1) then raise exception 'Duplicate inspection item'; end if;
  for v_item in select value from jsonb_array_elements(new.content->'items') loop
    if jsonb_typeof(v_item->'id') is distinct from 'string' or char_length(v_item->>'id') not between 1 and 100
      or jsonb_typeof(v_item->'label') is distinct from 'string' or char_length(btrim(v_item->>'label')) not between 1 and 200
      or jsonb_typeof(v_item->'note') is distinct from 'string' or char_length(v_item->>'note') > 2000
      or jsonb_typeof(v_item->'result') is distinct from 'string' or (v_item->>'result') not in ('','問題なし','要対応','対象外')
      or jsonb_typeof(v_item->'resolved') is distinct from 'boolean' then raise exception 'Invalid inspection item'; end if;
    if v_item->>'result' = '要対応' and btrim(v_item->>'note') = '' then raise exception 'Inspection issue requires note'; end if;
  end loop;
  if new.kind = 'inspection' and new.status = '完了' and (btrim(new.content->>'author') = '' or jsonb_array_length(new.content->'items') = 0 or exists(select 1 from jsonb_array_elements(new.content->'items') i where i->>'result' = '')) then raise exception 'Inspection completion requires author and all results'; end if;
  if new.kind = 'newsletter' and new.status = '完了' and btrim(new.content->>'body') = '' then raise exception 'Newsletter requires body'; end if;
  return new;
end; $$;
revoke all on function public.prepare_facility_document() from public, anon;
create trigger facility_document_prepare before insert or update on public.facility_documents for each row execute function public.prepare_facility_document();
create trigger facility_document_device before insert or update on public.facility_documents for each row execute function public.prevent_personal_device_record_mutation();
create trigger facility_document_audit after insert or update on public.facility_documents for each row execute function public.write_audit_log();

create table public.supply_items (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  category text not null default '消耗品' check (char_length(category) <= 80),
  unit text not null default '個' check (char_length(btrim(unit)) between 1 and 20),
  quantity integer not null default 0 check (quantity between 0 and 1000000),
  threshold integer not null default 1 check (threshold between 0 and 1000000),
  location text not null default '' check (char_length(location) <= 160),
  note text not null default '' check (char_length(note) <= 2000),
  requested boolean not null default false, archived boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (organization_id,id)
);
create index supply_items_name_idx on public.supply_items(organization_id,name);
create or replace function public.prepare_supply_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.created_by := auth.uid(); new.created_at := now(); new.revision := 1; new.quantity := 0;
  else
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then raise exception 'Immutable supply identity'; end if;
    if new.revision <> old.revision + 1 then raise exception 'FACILITY_CONFLICT: reload before saving'; end if;
  end if;
  new.updated_by := auth.uid(); new.updated_at := now(); return new;
end; $$;
revoke all on function public.prepare_supply_item() from public, anon;
create trigger supply_item_prepare before insert or update on public.supply_items for each row execute function public.prepare_supply_item();
create trigger supply_item_device before insert or update on public.supply_items for each row execute function public.prevent_personal_device_record_mutation();
create trigger supply_item_audit after insert or update on public.supply_items for each row execute function public.write_audit_log();
create table public.supply_movements (
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(), item_id uuid not null, request_id uuid not null,
  kind text not null check (kind in ('入庫','使用','調整')),
  delta integer not null check (delta <> 0 and abs(delta::bigint) <= 1000000),
  quantity_after integer not null check (quantity_after between 0 and 1000000),
  note text not null check (char_length(btrim(note)) between 1 and 1000),
  created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(),
  primary key (organization_id,id), unique (organization_id,request_id),
  foreign key (organization_id,item_id) references public.supply_items(organization_id,id) on delete restrict
);
create index supply_movements_recent_idx on public.supply_movements(organization_id,item_id,created_at desc);
create trigger supply_movement_audit after insert on public.supply_movements for each row execute function public.write_audit_log();

alter table public.facility_documents enable row level security;
alter table public.supply_items enable row level security;
alter table public.supply_movements enable row level security;
create policy facility_document_read on public.facility_documents for select to authenticated using (organization_id = public.current_organization_id() and (public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared'));
create policy facility_document_insert on public.facility_documents for insert to authenticated with check (organization_id = public.current_organization_id() and created_by = auth.uid() and (public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared'));
create policy facility_document_update on public.facility_documents for update to authenticated using (organization_id = public.current_organization_id() and (public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared')) with check (organization_id = public.current_organization_id() and (public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared'));
create policy supply_item_read on public.supply_items for select to authenticated using (organization_id = public.current_organization_id() and (public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared'));
create policy supply_item_insert on public.supply_items for insert to authenticated with check (organization_id = public.current_organization_id() and created_by = auth.uid() and (public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared'));
create policy supply_item_update on public.supply_items for update to authenticated using (organization_id = public.current_organization_id() and (public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared')) with check (organization_id = public.current_organization_id() and (public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared'));
create policy supply_movement_read on public.supply_movements for select to authenticated using (organization_id = public.current_organization_id() and (public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared'));
revoke all on public.facility_documents, public.supply_items, public.supply_movements from public, anon, authenticated;
grant select on public.facility_documents, public.supply_items, public.supply_movements to authenticated;
grant insert (organization_id,kind,title,document_date,status,is_template,content) on public.facility_documents to authenticated;
grant update (title,document_date,status,is_template,content,revision) on public.facility_documents to authenticated;
grant insert (organization_id,name,category,unit,threshold,location,note,requested,archived) on public.supply_items to authenticated;
grant update (name,category,unit,threshold,location,note,requested,archived,revision) on public.supply_items to authenticated;
-- Quantity and movement history can only be changed through the atomic RPC.
create or replace function public.move_supply_stock(p_organization_id uuid, p_item_id uuid, p_revision integer, p_request_id uuid, p_kind text, p_delta integer, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_item public.supply_items; v_movement public.supply_movements; v_quantity bigint;
begin
  if auth.uid() is null or p_organization_id is distinct from public.current_organization_id()
    or not coalesce(public.current_user_role() in ('admin','manager') or public.current_request_device_kind() = 'facility_shared', false) then raise exception 'FACILITY_ACCESS: shared facility access required' using errcode = '42501'; end if;
  if p_request_id is null or p_revision is null or p_kind is null or p_kind not in ('入庫','使用','調整') or p_delta is null or p_delta = 0 or abs(p_delta::bigint) > 1000000 or (p_kind = '入庫' and p_delta < 0) or (p_kind = '使用' and p_delta > 0) or p_note is null or char_length(btrim(p_note)) not between 1 and 1000 then raise exception 'Invalid supply movement' using errcode = '22023'; end if;
  select * into v_item from public.supply_items where organization_id = p_organization_id and id = p_item_id for update;
  if not found then raise exception 'Supply item not found'; end if;
  select * into v_movement from public.supply_movements where organization_id = p_organization_id and request_id = p_request_id;
  if found then
    if v_movement.item_id <> p_item_id or v_movement.kind <> p_kind or v_movement.delta <> p_delta or v_movement.note <> btrim(p_note) or v_movement.created_by <> auth.uid() then raise exception 'Supply retry payload mismatch'; end if;
    return to_jsonb(v_movement);
  end if;
  if v_item.archived or v_item.revision <> p_revision then raise exception 'FACILITY_CONFLICT: reload before saving'; end if;
  v_quantity := v_item.quantity::bigint + p_delta;
  if v_quantity not between 0 and 1000000 then raise exception '在庫数量が0〜1,000,000の範囲を超えます。' using errcode = '22023'; end if;
  update public.supply_items set quantity = v_quantity::integer, revision = revision + 1,
    requested = case when p_kind = '入庫' and v_quantity > threshold then false else requested end
    where organization_id = p_organization_id and id = p_item_id;
  insert into public.supply_movements(organization_id,item_id,request_id,kind,delta,quantity_after,note,created_by)
    values(p_organization_id,p_item_id,p_request_id,p_kind,p_delta,v_quantity::integer,btrim(p_note),auth.uid()) returning * into v_movement;
  return to_jsonb(v_movement);
end; $$;
revoke all on function public.move_supply_stock(uuid,uuid,integer,uuid,text,integer,text) from public, anon;
grant execute on function public.move_supply_stock(uuid,uuid,integer,uuid,text,integer,text) to authenticated;

-- Existing preference checks are preserved; only the facilityWork item is new.
create or replace function public.set_recorder_menu_preferences(p_organization_id uuid, p_recorder_profile_id uuid, p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_allowed constant text[] := array['home','dailyChanges','todayWork','attendance','calendar','monthlySchedule','trafficCost','activityPlans','facilityWork','operations','communication','assistant','form','records','meetings','learning','children','templates','team'];
  v_order jsonb; v_hidden jsonb; v_preferences jsonb;
begin
  if p_organization_id is distinct from public.current_organization_id() then raise exception 'Recorder menu settings require organization access.' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_preferences, '{}'::jsonb)) <> 'object' then raise exception 'Menu preferences must be an object.' using errcode = '22023'; end if;
  v_order := coalesce(p_preferences->'order', '[]'::jsonb); v_hidden := coalesce(p_preferences->'hidden', '[]'::jsonb);
  if jsonb_typeof(v_order) <> 'array' or jsonb_typeof(v_hidden) <> 'array' then raise exception 'Menu order and hidden values must be arrays.' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_array_elements_text(v_order) v(value) where not (v.value = any(v_allowed))) or exists(select 1 from jsonb_array_elements_text(v_hidden) v(value) where not (v.value = any(v_allowed))) then raise exception 'Menu preferences contain an unknown item.' using errcode = '22023'; end if;
  select jsonb_build_object('order', coalesce((select jsonb_agg(value order by first_position) from (select value, min(position) first_position from jsonb_array_elements_text(v_order) with ordinality as ordered(value, position) group by value) x), '[]'::jsonb), 'hidden', coalesce((select jsonb_agg(value order by first_position) from (select value, min(position) first_position from jsonb_array_elements_text(v_hidden) with ordinality as hidden(value, position) where value <> 'home' group by value) x), '[]'::jsonb)) into v_preferences;
  update public.recorder_profiles set menu_preferences = v_preferences where organization_id = p_organization_id and id = p_recorder_profile_id and active;
  if not found then raise exception 'Active recorder profile was not found.' using errcode = 'P0002'; end if;
  return v_preferences;
end; $$;
revoke all on function public.set_recorder_menu_preferences(uuid,uuid,jsonb) from public, anon;
grant execute on function public.set_recorder_menu_preferences(uuid,uuid,jsonb) to authenticated;
