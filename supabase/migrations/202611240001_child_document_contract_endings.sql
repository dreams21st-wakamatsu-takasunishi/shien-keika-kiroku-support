-- Document register only: do not change roster, bookings, entitlements or document records.
create table public.child_document_service_endings (
  organization_id uuid not null,
  child_id text not null,
  revision bigint not null check (revision > 0),
  day_ended_on date check (day_ended_on between '1900-01-01' and '2100-12-31'),
  visiting_ended_on date check (visiting_ended_on between '1900-01-01' and '2100-12-31'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id,child_id,revision),
  foreign key (organization_id,child_id) references public.children(organization_id,id) on delete restrict
);
alter table public.child_document_service_endings enable row level security;
revoke all on public.child_document_service_endings from public,anon,authenticated;
create trigger child_document_service_endings_immutable before update or delete
  on public.child_document_service_endings for each row execute function public.protect_child_document_history();

create function public.save_child_document_service_ending(
  p_child_id text,p_expected_revision bigint,p_day_ended_on date,p_visiting_ended_on date
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  org uuid:=public.current_organization_id();
  child public.children%rowtype;
  settings public.child_document_settings%rowtype;
  previous public.child_document_service_endings%rowtype;
  saved public.child_document_service_endings%rowtype;
  visiting_start date;
begin
  if org is null or not coalesce(public.can_manage_child_documents(),false) then
    raise exception '解約日は管理者・児発管のみ設定できます。' using errcode='42501';
  end if;
  select * into child from public.children c where c.organization_id=org and c.id=p_child_id and c.deleted_at is null for update;
  if not found then raise exception '対象児童を確認してください。' using errcode='22023'; end if;
  select * into previous from public.child_document_service_endings e where e.organization_id=org and e.child_id=p_child_id order by e.revision desc limit 1;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception '解約日の設定状態を確認してください。' using errcode='22023'; end if;
  if previous.revision-1=p_expected_revision and previous.day_ended_on is not distinct from p_day_ended_on
     and previous.visiting_ended_on is not distinct from p_visiting_ended_on then
    return to_jsonb(previous)-array['organization_id','created_by','created_at'];
  end if;
  if coalesce(previous.revision,0)<>p_expected_revision then raise exception '解約日が別の画面で更新されました。再読込してください。' using errcode='40001'; end if;
  select * into settings from public.child_document_settings s where s.organization_id=org and s.child_id=p_child_id order by s.revision desc limit 1;
  visiting_start:=case when child.care_type='保育所等訪問支援' then settings.contract_date else settings.visiting_contract_date end;
  if p_day_ended_on is not null and (p_day_ended_on not between '1900-01-01' and '2100-12-31' or
     (p_day_ended_on is distinct from previous.day_ended_on and
       (coalesce(nullif(child.care_type,''),'放課後等デイサービス')<>'放課後等デイサービス' or settings.contract_date is null or p_day_ended_on<settings.contract_date))) then
    raise exception '放デイの解約日は、放デイの契約日以降を指定してください。' using errcode='22023';
  end if;
  if p_visiting_ended_on is not null and (p_visiting_ended_on not between '1900-01-01' and '2100-12-31' or
     (p_visiting_ended_on is distinct from previous.visiting_ended_on and
       (not (coalesce(child.visiting_support_enabled,false) or child.care_type is not distinct from '保育所等訪問支援') or visiting_start is null or p_visiting_ended_on<visiting_start))) then
    raise exception '訪問支援の解約日は、訪問支援の契約日以降を指定してください。' using errcode='22023';
  end if;
  insert into public.child_document_service_endings(organization_id,child_id,revision,day_ended_on,visiting_ended_on,created_by)
  values(org,p_child_id,p_expected_revision+1,p_day_ended_on,p_visiting_ended_on,auth.uid()) returning * into saved;
  return to_jsonb(saved)-array['organization_id','created_by','created_at'];
end;$$;
revoke all on function public.save_child_document_service_ending(text,bigint,date,date) from public,anon;
grant execute on function public.save_child_document_service_ending(text,bigint,date,date) to authenticated;

create or replace function public.get_child_document_register()
returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_organization_id();begin
 if not coalesce(public.can_manage_child_documents(),false) then raise exception using errcode='42501',message='DOCUMENT_ACCESS_DENIED: 管理者・児発管のみ利用できます。';end if;
 return jsonb_build_object('settings',coalesce((select jsonb_agg(s order by s.child_id,s.revision) from public.child_document_settings s where s.organization_id=org),'[]'),
  'entries',coalesce((select jsonb_agg(e order by e.created_at,e.id) from public.child_document_entries e where e.organization_id=org),'[]'),
  'visiting_review_exception',(select to_jsonb(e)-array['organization_id','created_by','created_via'] from public.child_document_visiting_exceptions e where e.organization_id=org order by e.revision desc limit 1),
  'service_endings',coalesce((select jsonb_agg(to_jsonb(e) order by e.child_id) from (
    select distinct on (child_id) child_id,revision,day_ended_on,visiting_ended_on
    from public.child_document_service_endings where organization_id=org order by child_id,revision desc
  ) e),'[]'));
end;$$;
notify pgrst,'reload schema';
