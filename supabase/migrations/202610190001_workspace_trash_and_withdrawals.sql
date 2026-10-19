-- Recoverable removal only. Existing operational rows are not removed or backfilled.
create function public.can_manage_workspace_trash() returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce(public.current_user_role() in ('admin','manager'),false)
 and public.current_organization_id() is not null
 and public.current_request_device_kind() is distinct from 'personal';
$$;
revoke all on function public.can_manage_workspace_trash() from public,anon;
grant execute on function public.can_manage_workspace_trash() to authenticated;

create table public.workspace_lifecycle_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 resource text not null, record_id text not null, action text not null check(action in ('delete','restore','withdraw')),
 actor_id uuid not null, actor_name text not null, occurred_at timestamptz not null default now(),
 service_date date, request_snapshot jsonb
);
create index workspace_lifecycle_recent on public.workspace_lifecycle_events(organization_id,occurred_at desc,id desc);
alter table public.workspace_lifecycle_events enable row level security;
-- Supabase project defaults may grant whole-table access on new tables.
revoke all on public.workspace_lifecycle_events from public,anon,authenticated;
create policy lifecycle_read on public.workspace_lifecycle_events for select to authenticated
 using(organization_id=(select public.current_organization_id()) and
 (public.can_manage_workspace_trash() or (action='withdraw' and actor_id=auth.uid())));
grant select(id,organization_id,resource,record_id,action,actor_id,occurred_at,service_date) on public.workspace_lifecycle_events to authenticated;

alter table public.handover_items add column revision bigint not null default 1;
do $$ declare t text; begin
 foreach t in array array['meeting_cases','morning_meeting_records','handover_items','activity_plans','facility_documents','supply_items'] loop
  execute format('alter table public.%I add column deleted_at timestamptz, add column deleted_by uuid',t);
  execute format('create index %I on public.%I(organization_id,deleted_at) where deleted_at is not null',t||'_trash_idx',t);
  execute format('create policy workspace_active_read on public.%I as restrictive for select to authenticated using (deleted_at is null or public.can_manage_workspace_trash())',t);
 end loop;
end $$;

create function public.guard_workspace_lifecycle() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if coalesce(current_setting('app.workspace_lifecycle',true),'')='on' then return new; end if;
 if tg_op='DELETE' then raise exception 'WORKSPACE_USE_RECOVERABLE_DELETE' using errcode='42501'; end if;
 if tg_op='INSERT' then
  if new.deleted_at is not null or new.deleted_by is not null then raise exception 'WORKSPACE_DELETE_FORBIDDEN' using errcode='42501'; end if;
 else
  if old.deleted_at is not null then raise exception 'WORKSPACE_ITEM_DELETED: restore before editing' using errcode='40001'; end if;
  if new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by then
   raise exception 'WORKSPACE_DELETE_RPC_REQUIRED' using errcode='42501';
  end if;
  if tg_table_name='handover_items' then new.revision:=old.revision+1; end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_workspace_lifecycle() from public,anon;
do $$ declare t text; begin
 foreach t in array array['meeting_cases','morning_meeting_records','handover_items','activity_plans','facility_documents','supply_items'] loop
  execute format('create trigger aa_workspace_lifecycle before insert or update or delete on public.%I for each row execute function public.guard_workspace_lifecycle()',t);
 end loop;
end $$;

-- Approved meeting bodies remain immutable. Only this lifecycle RPC may move
-- the unchanged row into/out of trash, including historical approved meetings.
create or replace function public.prepare_meeting_case()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  new.created_by:=auth.uid(); new.updated_by:=auth.uid(); new.revision:=1;
 else
  if new.organization_id is distinct from old.organization_id or new.id is distinct from old.id
   or new.child_id is distinct from old.child_id or new.created_by is distinct from old.created_by
   or new.created_at is distinct from old.created_at then raise exception 'Meeting identity cannot be changed'; end if;
  if new.revision<>old.revision+1 then raise exception 'MEETING_CONFLICT: reload the meeting before saving'; end if;
  if coalesce(current_setting('app.workspace_lifecycle',true),'')='on'
   and (to_jsonb(new)-array['deleted_at','deleted_by','revision','updated_by','updated_at'])
    = (to_jsonb(old)-array['deleted_at','deleted_by','revision','updated_by','updated_at']) then
   new.updated_by:=auth.uid(); new.updated_at:=now(); return new;
  end if;
  if new.meeting_date is distinct from old.meeting_date and exists(select 1 from public.meeting_progress_records p
   where p.organization_id=old.organization_id and p.meeting_id=old.id) then raise exception 'Meeting date is locked after creating a progress record'; end if;
  if exists(select 1 from public.meeting_progress_records p where p.organization_id=old.organization_id
   and p.meeting_id=old.id and p.approval_status='確認済み') then raise exception 'Approved meetings are locked'; end if;
  if new.editor_user_ids is distinct from old.editor_user_ids and auth.uid()<>old.created_by
   and not public.current_user_has_permission('review_records') then raise exception 'Only the meeting owner or reviewer can change editors'; end if;
  new.updated_by:=auth.uid(); new.updated_at:=now();
 end if;
 return new;
end $$;

create function public.change_workspace_item_lifecycle(p_resource text,p_record_id text,p_expected_revision bigint,p_restore boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_organization_id(); item jsonb; key_col text;
begin
 if not public.can_manage_workspace_trash() then raise exception 'WORKSPACE_DELETE_FORBIDDEN' using errcode='42501'; end if;
 if p_resource is null or p_resource not in ('meeting_cases','morning_meeting_records','handover_items','activity_plans','facility_documents','supply_items') then raise exception 'INVALID_RESOURCE' using errcode='22023'; end if;
 if p_record_id is null or length(p_record_id)>200 or p_expected_revision is null or p_expected_revision<1 or p_restore is null then raise exception 'INVALID_ARGUMENT' using errcode='22023'; end if;
 key_col:=case when p_resource='morning_meeting_records' then 'meeting_date' else 'id' end;
 execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and %I::text=$2 for update',p_resource,key_col) into item using org,p_record_id;
 if item is null then raise exception 'WORKSPACE_NOT_FOUND' using errcode='P0002'; end if;
 if (item->>'revision')::bigint<>p_expected_revision then raise exception 'WORKSPACE_CONFLICT: reload before deleting or restoring' using errcode='40001'; end if;
 if (p_restore and item->>'deleted_at' is null) or (not p_restore and item->>'deleted_at' is not null) then raise exception 'WORKSPACE_STATE_CHANGED' using errcode='40001'; end if;
 -- Existing validation/device/audit triggers still run; meeting bodies stay unchanged.
 perform set_config('app.workspace_lifecycle','on',true);
 execute format('update public.%I set deleted_at=$3,deleted_by=$4,revision=revision+1 where organization_id=$1 and %I::text=$2',p_resource,key_col)
 using org,p_record_id,case when p_restore then null::timestamptz else now() end,case when p_restore then null::uuid else auth.uid() end;
 perform set_config('app.workspace_lifecycle','off',true);
 insert into public.workspace_lifecycle_events(organization_id,resource,record_id,action,actor_id,actor_name)
 values(org,p_resource,p_record_id,case when p_restore then 'restore' else 'delete' end,auth.uid(),coalesce((select display_name from public.profiles where id=auth.uid()),'職員'));
end $$;
revoke all on function public.change_workspace_item_lifecycle(text,text,bigint,boolean) from public,anon;
grant execute on function public.change_workspace_item_lifecycle(text,text,bigint,boolean) to authenticated;

create function public.list_workspace_trash() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare org uuid:=public.current_organization_id(); t text; rows jsonb; result jsonb:='[]'; key_col text; title_col text;
begin
 if not public.can_manage_workspace_trash() then raise exception 'WORKSPACE_DELETE_FORBIDDEN' using errcode='42501'; end if;
 foreach t in array array['meeting_cases','morning_meeting_records','handover_items','activity_plans','facility_documents','supply_items'] loop
  key_col:=case when t='morning_meeting_records' then 'meeting_date' else 'id' end;
  title_col:=case when t='morning_meeting_records' then 'source.meeting_date::text' when t='handover_items' then 'left(source.content,120)' when t='supply_items' then 'source.name' else 'source.title' end;
  execute format('select coalesce(jsonb_agg(x),''[]''::jsonb) from (select $2::text resource,source.%I::text id,%s title,source.revision,source.deleted_at,source.deleted_by,coalesce((select p.display_name from public.profiles p where p.id=source.deleted_by),(select e.actor_name from public.workspace_lifecycle_events e where e.organization_id=$1 and e.resource=$2 and e.record_id=source.%I::text and e.action=''delete'' order by e.occurred_at desc limit 1)) deleted_by_name from public.%I source where source.organization_id=$1 and source.deleted_at is not null order by source.deleted_at desc limit 200) x',key_col,title_col,key_col,t)
  into rows using org,t;
  result:=result||rows;
 end loop;
 return result;
end $$;
revoke all on function public.list_workspace_trash() from public,anon;
grant execute on function public.list_workspace_trash() to authenticated;

-- Withdraw pending requests atomically. Row locks serialize against approval;
-- removing a pending request never edits attendance records or schedules.
create function public.withdraw_own_workspace_request(p_resource text,p_record_id uuid,p_expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_organization_id(); item jsonb; date_value date;
begin
 if org is null or auth.uid() is null or not public.facility_session_allowed() then raise exception 'REQUEST_WITHDRAW_FORBIDDEN' using errcode='42501'; end if;
 if p_resource is null or p_resource not in ('staff_shift_requests','attendance_correction_requests') or p_expected_updated_at is null then raise exception 'INVALID_RESOURCE' using errcode='22023'; end if;
 execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2 for update',p_resource) into item using org,p_record_id;
 if item is null then raise exception 'REQUEST_NOT_FOUND' using errcode='P0002'; end if;
 if item->>'created_by' is distinct from auth.uid()::text or item->>'recorder_profile_id' is distinct from public.current_recorder_profile_id()::text then raise exception 'REQUEST_WITHDRAW_FORBIDDEN' using errcode='42501'; end if;
 if item->>'status'<>'申請中' or (item->>'updated_at')::timestamptz is distinct from p_expected_updated_at then raise exception 'REQUEST_ALREADY_REVIEWED_OR_CHANGED' using errcode='40001'; end if;
 date_value:=case when p_resource='staff_shift_requests' then (item->>'requested_date')::date else (item->>'created_at')::timestamptz at time zone 'Asia/Tokyo' end;
 insert into public.workspace_lifecycle_events(organization_id,resource,record_id,action,actor_id,actor_name,service_date,request_snapshot)
 values(org,p_resource,p_record_id::text,'withdraw',auth.uid(),coalesce((select display_name from public.profiles where id=auth.uid()),'職員'),date_value,item);
 execute format('delete from public.%I where organization_id=$1 and id=$2',p_resource) using org,p_record_id;
end $$;
revoke all on function public.withdraw_own_workspace_request(text,uuid,timestamptz) from public,anon;
grant execute on function public.withdraw_own_workspace_request(text,uuid,timestamptz) to authenticated;

-- A stale manager tab used an upsert to approve. After withdrawal that must
-- not insert the old request again or subsequently create a work schedule.
create function public.guard_withdrawn_request_reuse() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.workspace_lifecycle_events e where e.organization_id=new.organization_id and e.resource=tg_table_name and e.record_id=new.id::text and e.action='withdraw') then
  raise exception 'REQUEST_ALREADY_WITHDRAWN' using errcode='40001';
 end if;
 if tg_op='INSERT' and new.status<>'申請中' then raise exception 'REQUEST_REVIEW_REQUIRES_EXISTING_PENDING_ROW' using errcode='40001'; end if;
 return new;
end $$;
revoke all on function public.guard_withdrawn_request_reuse() from public,anon;
create trigger aa_request_withdrawal_guard before insert or update on public.staff_shift_requests for each row execute function public.guard_withdrawn_request_reuse();
create trigger aa_request_withdrawal_guard before insert or update on public.attendance_correction_requests for each row execute function public.guard_withdrawn_request_reuse();

-- Retired transcript/progress endpoints also consult this helper. Hiding a
-- parent meeting must not leave its historical child records readable to staff.
create or replace function public.can_read_meeting(p_organization_id uuid,p_meeting_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.meeting_cases m where m.organization_id=p_organization_id and m.id=p_meeting_id
 and p_organization_id=public.current_organization_id()
 and (m.deleted_at is null or public.can_manage_workspace_trash())
 and (m.created_by=auth.uid() or auth.uid()=any(m.editor_user_ids) or public.current_user_has_permission('review_records'))
 and (public.current_user_role() in ('manager','admin') or public.current_recorder_profile_id() is null or public.current_request_device_kind()='facility_shared'));
$$;
