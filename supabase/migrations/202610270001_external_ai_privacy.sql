-- Fail closed: no existing organization is opted into external AI.
create table public.external_ai_policies (
 organization_id uuid primary key references public.organizations(id),
 enabled boolean not null default false, revision bigint not null default 1,
 policy_version integer not null default 1 check(policy_version=1),
 contract_confirmed boolean not null, informing_confirmed boolean not null, handling_confirmed boolean not null,
 reviewed_by uuid, reviewed_by_name text not null, reviewed_at timestamptz not null default now(),
 check(not enabled or (contract_confirmed and informing_confirmed and handling_confirmed))
);
alter table public.external_ai_policies enable row level security;
revoke all on public.external_ai_policies from public,anon,authenticated;
grant all on public.external_ai_policies to service_role;
create function public.get_external_ai_policy() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r public.external_ai_policies%rowtype; begin
 if auth.uid() is null or public.current_organization_id() is null or not coalesce(public.facility_session_allowed(),false)
 or public.current_request_device_kind()='personal' then raise exception 'AI_ACCESS_DENIED' using errcode='42501'; end if;
 select * into r from public.external_ai_policies where organization_id=public.current_organization_id();
 return jsonb_build_object('enabled',coalesce(r.enabled,false),'revision',coalesce(r.revision,0),'policyVersion',1,'reviewedAt',r.reviewed_at,'reviewedByName',r.reviewed_by_name);
end $$;
create function public.set_external_ai_policy(p_enabled boolean,p_expected_revision bigint,p_contract_confirmed boolean,p_informing_confirmed boolean,p_handling_confirmed boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.external_ai_policies%rowtype; org uuid:=public.current_organization_id(); actor text; begin
 if auth.uid() is null or org is null or coalesce(public.current_user_role(),'')<>'admin' or not coalesce(public.facility_session_allowed(),false)
 or public.current_request_device_kind()='personal' then raise exception 'AI_ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_enabled is null or p_expected_revision is null or (p_enabled and not(coalesce(p_contract_confirmed,false) and coalesce(p_informing_confirmed,false) and coalesce(p_handling_confirmed,false))) then raise exception 'AI_CONDITIONS_UNCONFIRMED' using errcode='22023'; end if;
 perform 1 from public.organizations where id=org for update;
 select * into r from public.external_ai_policies where organization_id=org for update;
 if coalesce(r.revision,0)<>p_expected_revision then raise exception 'AI_POLICY_CONFLICT' using errcode='40001'; end if;
 select display_name into actor from public.profiles where id=auth.uid();
 insert into public.external_ai_policies(organization_id,enabled,revision,contract_confirmed,informing_confirmed,handling_confirmed,reviewed_by,reviewed_by_name)
 values(org,p_enabled,p_expected_revision+1,coalesce(p_contract_confirmed,false),coalesce(p_informing_confirmed,false),coalesce(p_handling_confirmed,false),auth.uid(),coalesce(actor,''))
 on conflict(organization_id) do update set enabled=excluded.enabled,revision=excluded.revision,contract_confirmed=excluded.contract_confirmed,informing_confirmed=excluded.informing_confirmed,handling_confirmed=excluded.handling_confirmed,reviewed_by=excluded.reviewed_by,reviewed_by_name=excluded.reviewed_by_name,reviewed_at=now();
 insert into public.audit_logs(organization_id,actor_id,table_name,row_id,action,old_data,new_data) values(org,auth.uid(),'external_ai_policies',org::text,'UPDATE',jsonb_build_object('enabled',r.enabled,'revision',r.revision),jsonb_build_object('enabled',p_enabled,'revision',p_expected_revision+1,'policyVersion',1));
 return public.get_external_ai_policy();
end $$;
revoke all on function public.get_external_ai_policy(),public.set_external_ai_policy(boolean,bigint,boolean,boolean,boolean) from public,anon;
grant execute on function public.get_external_ai_policy(),public.set_external_ai_policy(boolean,bigint,boolean,boolean,boolean) to authenticated;
