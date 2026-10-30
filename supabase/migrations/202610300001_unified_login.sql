-- Resolve an organization-scoped ID without exposing account discovery to clients.
-- This function is service-only; it does not authenticate or grant device access.
create function public.resolve_unified_login(p_code text, p_device text, p_login text)
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare v_org uuid; v_code text; v_count integer; v_facility boolean; v_staff boolean;
begin
 if coalesce(p_device,'') !~ '^[a-fA-F0-9]{64}$' or coalesce(p_login,'') !~ '^[A-Za-z0-9._-]{3,32}$' then
  return jsonb_build_object('error','invalid');
 end if;
 if nullif(btrim(p_code),'') is not null then
  select id,staff_login_code into v_org,v_code from public.organizations where staff_login_code=upper(btrim(p_code));
 else
  select count(*) into v_count from public.organization_devices where token_hash=encode(digest(p_device,'sha256'),'hex') and status='approved';
  if v_count<>1 then return jsonb_build_object('error','organization_required'); end if;
  select o.id,o.staff_login_code into v_org,v_code from public.organization_devices d join public.organizations o on o.id=d.organization_id
   where d.token_hash=encode(digest(p_device,'sha256'),'hex') and d.status='approved';
 end if;
 if v_org is null then return jsonb_build_object('error','invalid'); end if;
 select exists(select 1 from public.facility_login_credentials where organization_id=v_org and login_id=lower(p_login)) into v_facility;
 -- Include disabled IDs: never silently route a colliding legacy ID to another identity.
 select exists(select 1 from public.recorder_profiles where organization_id=v_org and lower(employee_code)=lower(p_login)) into v_staff;
 if v_facility and v_staff then return jsonb_build_object('error','ambiguous'); end if;
 if not v_facility and not v_staff then return jsonb_build_object('error','invalid'); end if;
 return jsonb_build_object('method',case when v_facility then 'facility' else 'staff' end,'organizationCode',v_code);
end; $$;
revoke all on function public.resolve_unified_login(text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_unified_login(text,text,text) to service_role;

-- Do not rename legacy IDs. Prevent new cross-table collisions, including races.
create function public.prevent_login_id_collision()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_id text;
begin
 perform pg_advisory_xact_lock(hashtextextended('login-id-namespace:'||new.organization_id::text,0));
 if tg_table_name='recorder_profiles' then
  v_id:=lower(new.employee_code);
  if v_id is not null and exists(select 1 from public.facility_login_credentials c where c.organization_id=new.organization_id and c.login_id=v_id) then
   raise exception '施設IDと職員IDに同じ値は設定できません。別のIDを指定してください。' using errcode='23505';
  end if;
 else
  v_id:=lower(new.login_id);
  if exists(select 1 from public.recorder_profiles r where r.organization_id=new.organization_id and lower(r.employee_code)=v_id) then
   raise exception '施設IDと職員IDに同じ値は設定できません。別のIDを指定してください。' using errcode='23505';
  end if;
 end if;
 return new;
end; $$;
revoke all on function public.prevent_login_id_collision() from public,anon,authenticated;
create trigger recorder_login_id_namespace before insert or update of employee_code,organization_id on public.recorder_profiles
 for each row execute function public.prevent_login_id_collision();
create trigger facility_login_id_namespace before insert or update of login_id,organization_id on public.facility_login_credentials
 for each row execute function public.prevent_login_id_collision();
notify pgrst,'reload schema';
