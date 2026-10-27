-- Nullable additions only; never infer past punches or breaks.
alter table public.attendance_records add column confirmed_break_minutes integer check(confirmed_break_minutes between 0 and 1440), add column break_confirmed_at timestamptz, add column break_confirmed_by uuid;
create function public.guard_attendance_break_confirmation() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  if new.confirmed_break_minutes is not null or new.break_confirmed_at is not null or new.break_confirmed_by is not null then raise exception 'USE_BREAK_CONFIRMATION_RPC' using errcode='42501'; end if;
 else
  if (new.confirmed_break_minutes is distinct from old.confirmed_break_minutes or new.break_confirmed_at is distinct from old.break_confirmed_at or new.break_confirmed_by is distinct from old.break_confirmed_by)
  and coalesce(current_setting('app.confirm_actual_break',true),'')<>'on' then raise exception 'USE_BREAK_CONFIRMATION_RPC' using errcode='42501'; end if;
  if new.clock_in_at is distinct from old.clock_in_at or new.clock_out_at is distinct from old.clock_out_at or new.break_periods is distinct from old.break_periods then
   new.confirmed_break_minutes:=null;new.break_confirmed_at:=null;new.break_confirmed_by:=null;
  end if;
 end if;
 return new;
end $$;
create trigger aa_attendance_break_confirmation before insert or update on public.attendance_records for each row execute function public.guard_attendance_break_confirmation();
revoke all on function public.guard_attendance_break_confirmation() from public,anon,authenticated;
create function public.confirm_attendance_break(p_record_id uuid,p_expected_updated_at timestamptz,p_minutes integer,p_reason text) returns public.attendance_records language plpgsql security definer set search_path=public as $$
declare r public.attendance_records%rowtype; org uuid:=public.current_organization_id(); begin
 if auth.uid() is null or org is null or coalesce(public.current_user_role(),'')<>'admin' or not coalesce(public.facility_session_allowed(),false) or public.current_request_device_kind()='personal' then raise exception 'ATTENDANCE_ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 or p_minutes is null or p_minutes not between 0 and 1440 then raise exception 'INVALID_BREAK_ACTUAL' using errcode='22023'; end if;
 select * into r from public.attendance_records where organization_id=org and id=p_record_id for update;
 if not found or p_expected_updated_at is null or r.updated_at<>p_expected_updated_at then raise exception 'ATTENDANCE_CHANGED' using errcode='40001'; end if;
 if r.clock_in_at is null or r.clock_out_at is null or r.clock_out_at<=r.clock_in_at or r.clock_out_at-r.clock_in_at>interval '24 hours' or p_minutes*60>extract(epoch from (r.clock_out_at-r.clock_in_at)) then raise exception 'INVALID_ATTENDANCE_ACTUAL' using errcode='22023'; end if;
 perform set_config('app.confirm_actual_break','on',true);
 update public.attendance_records set confirmed_break_minutes=p_minutes,break_confirmed_at=now(),break_confirmed_by=auth.uid(),updated_at=now() where id=r.id and organization_id=org returning * into r;
 perform set_config('app.confirm_actual_break','',true);
 insert into public.audit_logs(organization_id,actor_id,table_name,row_id,action,old_data,new_data) values(org,auth.uid(),'attendance_break_confirmations',r.id::text,'UPDATE',null,jsonb_build_object('minutes',p_minutes,'reason',btrim(p_reason),'confirmedAt',r.break_confirmed_at));
 return r;
end $$;
revoke all on function public.confirm_attendance_break(uuid,timestamptz,integer,text) from public,anon;
grant execute on function public.confirm_attendance_break(uuid,timestamptz,integer,text) to authenticated;
