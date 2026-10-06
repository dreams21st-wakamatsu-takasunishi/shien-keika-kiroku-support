-- Service selection only: no visiting schedules, records or billing are created.
alter table public.children drop constraint if exists children_care_type_check;
alter table public.children add constraint children_care_type_check
 check (care_type is null or care_type in ('児童発達支援','放課後等デイサービス','保育所等訪問支援'));
alter table public.children add column visiting_support_enabled boolean not null default false;

create table public.organization_service_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 service_types text[] not null,
 revision integer not null default 1 check (revision>0),
 -- Historical actor ID is retained; deleting a login must not mutate revisions.
 updated_by uuid,
 updated_at timestamptz not null default now(),
 check (cardinality(service_types) between 1 and 3
  and service_types <@ array['児童発達支援','放課後等デイサービス','保育所等訪問支援']::text[]
  and array_position(service_types,null) is null
  and cardinality(service_types) = (case when '児童発達支援'=any(service_types) then 1 else 0 end
    + case when '放課後等デイサービス'=any(service_types) then 1 else 0 end
    + case when '保育所等訪問支援'=any(service_types) then 1 else 0 end))
);

create function public.prepare_organization_service_settings() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' then
  if new.organization_id is distinct from old.organization_id then raise exception 'Service organization cannot change'; end if;
  if new.revision<>old.revision+1 then raise exception 'SERVICE_SETTINGS_CONFLICT: reload before saving' using errcode='40001'; end if;
 else
  if new.revision<>1 then raise exception 'SERVICE_SETTINGS_CONFLICT: reload before saving' using errcode='40001'; end if;
 end if;
 new.updated_by:=auth.uid();new.updated_at:=now();return new;
end;
$$;
revoke all on function public.prepare_organization_service_settings() from public;
create trigger organization_service_prepare before insert or update on public.organization_service_settings
 for each row execute function public.prepare_organization_service_settings();
create trigger organization_service_audit after insert or update on public.organization_service_settings
 for each row execute function public.write_audit_log();
alter table public.organization_service_settings enable row level security;
create policy organization_services_read on public.organization_service_settings for select to authenticated
 using (organization_id=public.current_organization_id());
create policy organization_services_insert on public.organization_service_settings for insert to authenticated
 with check (organization_id=public.current_organization_id() and public.current_user_role()='admin');
create policy organization_services_update on public.organization_service_settings for update to authenticated
 using (organization_id=public.current_organization_id() and public.current_user_role()='admin')
 with check (organization_id=public.current_organization_id() and public.current_user_role()='admin');
revoke all on public.organization_service_settings from anon,authenticated;
grant select,insert,update on public.organization_service_settings to authenticated;
notify pgrst,'reload schema';
