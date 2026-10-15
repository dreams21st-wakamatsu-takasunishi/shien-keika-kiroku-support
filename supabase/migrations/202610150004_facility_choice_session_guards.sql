-- A selected email account may have an explicit recorder link without a legacy staff-ID binding.
create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path=public as $$
 select p.organization_id from public.profiles p join public.organizations o on o.id=p.organization_id
 where p.id=auth.uid() and p.active and public.facility_session_allowed() and
 (p.role<>'staff' or o.shared_staff_login_allowed or exists(select 1 from public.recorder_profiles r
  where r.organization_id=p.organization_id and r.auth_user_id=p.id and r.active and r.individual_login_enabled)
  or exists(select 1 from public.facility_login_sessions s where s.user_id=p.id and s.session_id::text=auth.jwt()->>'session_id'));
$$;
create or replace function public.get_current_facility_login_state()
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('facilityLogin',s.session_id is not null,'allowed',public.facility_session_allowed(),'expiresAt',s.expires_at,'deviceId',s.device_id)
 from (select 1) x left join public.facility_login_sessions s on s.session_id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid();
$$;
