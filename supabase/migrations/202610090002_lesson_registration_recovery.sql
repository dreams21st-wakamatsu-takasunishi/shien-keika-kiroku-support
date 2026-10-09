alter table public.lesson_student_registrations
  add column executor_id uuid references public.profiles(id) on delete restrict,
  add column handoff_revision integer not null default 0 check(handoff_revision>=0),
  add column completed_by uuid references public.profiles(id) on delete restrict;

create table public.lesson_registration_handoffs (
  id uuid primary key, registration_id uuid not null references public.lesson_student_registrations(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  from_actor uuid not null references public.profiles(id) on delete restrict,
  to_actor uuid not null references public.profiles(id) on delete restrict,
  revision integer not null check(revision>0), at timestamptz not null default now(),
  reason text not null check(reason in('staff-unavailable','permission-change','connection-failure','other-confirmed')),
  unique(registration_id,revision)
);
alter table public.lesson_registration_handoffs enable row level security;
revoke all on public.lesson_registration_handoffs from public,anon,authenticated;
grant select on public.lesson_registration_handoffs to authenticated;
grant all on public.lesson_registration_handoffs to service_role;
create policy lesson_registration_handoff_read on public.lesson_registration_handoffs for select to authenticated using(
  public.can_read_lesson_learning(organization_id) and public.current_user_has_permission('manage_learning_links')
  and public.current_user_has_permission('manage_learning_account_credentials'));

create or replace function public.assert_lesson_registration_execution(p_id uuid,p_lease uuid,p_actor uuid)
returns public.lesson_student_registrations language plpgsql security definer set search_path=public as $$
declare v public.lesson_student_registrations%rowtype; profile public.profiles%rowtype;
begin
  select * into v from public.lesson_student_registrations where id=p_id;
  if not found then raise exception '登録操作を確認してください。' using errcode='PT409'; end if;
  select * into profile from public.profiles where id=p_actor and organization_id=v.organization_id and active for share;
  if not found or not(profile.role='admin' or (v.executor_id is null and profile.role in('manager','classroom_manager') and exists(
    select 1 from public.organization_role_permissions r where r.organization_id=v.organization_id and r.role=profile.role
    and r.permissions ? 'manage_learning_links' and r.permissions ? 'manage_learning_account_credentials')))
    then raise exception '登録権限が変更されています。' using errcode='42501'; end if;
  perform 1 from public.children where organization_id=v.organization_id and id=v.child_id and deleted_at is null
    and btrim(name)=v.display_name and birth_date=v.birth_date for update;
  if not found then raise exception '児童情報が変更されています。' using errcode='PT409'; end if;
  select * into v from public.lesson_student_registrations where id=p_id and lease_id=p_lease and lease_until>now()
    and coalesce(executor_id,actor_id)=p_actor and phase<>'denied' for update;
  if not found then raise exception '登録担当者または処理期限が変更されています。' using errcode='PT409'; end if;
  if exists(select 1 from public.lesson_child_links where organization_id=v.organization_id and child_id=v.child_id
    and (id<>v.link_id or not active or revision<>1)) then raise exception '連携が変更されています。' using errcode='PT409'; end if;
  return v;
end; $$;

create or replace function public.handoff_lesson_student_registration(p jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.lesson_student_registrations%rowtype; profile public.profiles%rowtype; h public.lesson_registration_handoffs%rowtype; previous uuid;
begin
  select * into profile from public.profiles where id=(p->>'actor')::uuid and organization_id=(p->>'org')::uuid and active and role='admin' for share;
  if not found then raise exception '同じ事業所の管理者だけが引き継げます。' using errcode='42501'; end if;
  if p->>'reason' is null or p->>'reason' not in('staff-unavailable','permission-change','connection-failure','other-confirmed')
    then raise exception '引き継ぎ理由を確認してください。' using errcode='22023'; end if;
  perform 1 from public.children where organization_id=profile.organization_id and id=p->>'child' and deleted_at is null
    and btrim(name)=p->>'name' and birth_date::text=p->>'birth' for update;
  if not found then raise exception '名簿情報を確認してください。' using errcode='PT409'; end if;
  select * into v from public.lesson_student_registrations where id=(p->>'operation')::uuid and organization_id=profile.organization_id
    and child_id=p->>'child' and source_project_ref=p->>'project' and source_campus_id=p->>'campus'
    and display_name=p->>'name' and birth_date::text=p->>'birth' for update;
  if not found or v.phase not in('requested','source-created','linked') then raise exception '未確定の登録操作だけを引き継げます。' using errcode='PT409'; end if;
  if v.lease_until>now() then raise exception '登録処理中です。しばらく待って再取得してください。' using errcode='PT423'; end if;
  if exists(select 1 from public.lesson_child_links where organization_id=v.organization_id and child_id=v.child_id
    and (id<>v.link_id or not active or revision<>1 or source_student_id<>v.source_student_id or source_project_ref<>v.source_project_ref or source_campus_id<>v.source_campus_id))
    then raise exception '既存の連携を確認してください。' using errcode='PT409'; end if;
  select * into h from public.lesson_registration_handoffs where id=(p->>'request')::uuid;
  if found then
    if h.registration_id<>v.id or h.to_actor<>profile.id or h.reason<>p->>'reason' or h.revision<>(p->>'revision')::integer+1
      or h.revision<>v.handoff_revision or v.executor_id<>profile.id then raise exception '引き継ぎ操作が変更されています。' using errcode='PT409'; end if;
    return jsonb_build_object('operationId',v.id,'requestId',h.id,'revision',h.revision);
  end if;
  previous:=coalesce(v.executor_id,v.actor_id);
  if v.handoff_revision is distinct from (p->>'revision')::integer or previous=profile.id then raise exception '担当者が変更されています。再取得してください。' using errcode='PT409'; end if;
  perform pg_advisory_xact_lock(hashtextextended('lesson-handoff-actor:'||profile.id::text,0));
  if (select count(*) from public.lesson_registration_handoffs where to_actor=profile.id and at>now()-interval '15 minutes')>=10
    then raise exception '引き継ぎ回数が上限です。' using errcode='PT429'; end if;
  update public.lesson_student_registrations set executor_id=profile.id,handoff_revision=handoff_revision+1,lease_id=null,lease_until=null where id=v.id returning * into v;
  insert into public.lesson_registration_handoffs(id,registration_id,organization_id,from_actor,to_actor,revision,reason)
    values((p->>'request')::uuid,v.id,v.organization_id,previous,profile.id,v.handoff_revision,p->>'reason') returning * into h;
  return jsonb_build_object('operationId',v.id,'requestId',h.id,'revision',h.revision);
end; $$;

create or replace function public.claim_lesson_student_registration(p jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.lesson_student_registrations%rowtype; profile public.profiles%rowtype; child public.children%rowtype;
begin
  select * into profile from public.profiles where id=(p->>'actor')::uuid and organization_id=(p->>'org')::uuid and active for share;
  if not found or not(profile.role='admin' or (profile.role in('manager','classroom_manager') and exists(select 1 from public.organization_role_permissions r
    where r.organization_id=profile.organization_id and r.role=profile.role and r.permissions ? 'manage_learning_links' and r.permissions ? 'manage_learning_account_credentials')))
    then raise exception '登録と連携の専用権限が必要です。' using errcode='42501'; end if;
  select * into child from public.children where organization_id=(p->>'org')::uuid and id=p->>'child' and deleted_at is null for update;
  if not found then raise exception '対象児童を確認してください。' using errcode='42501'; end if;
  if btrim(child.name)<>p->>'name' or child.birth_date is null or child.birth_date::text<>p->>'birth' then raise exception '名簿情報が変更されています。' using errcode='PT409'; end if;
  select * into v from public.lesson_student_registrations where id=(p->>'id')::uuid for update;
  if found then
    if v.organization_id<>(p->>'org')::uuid or v.child_id<>p->>'child' or coalesce(v.executor_id,v.actor_id)<>(p->>'actor')::uuid
      or (v.executor_id is not null and profile.role<>'admin') or v.source_project_ref<>p->>'project' or v.source_campus_id<>p->>'campus'
      or v.display_name<>p->>'name' or v.birth_date::text<>p->>'birth' or v.phase='denied'
      or (v.phase='completed' and v.finished_at<now()-interval '24 hours') then raise exception '登録操作が変更されています。' using errcode='PT409'; end if;
    if v.lease_until>now() then raise exception '同じ登録操作を処理中です。' using errcode='PT423'; end if;
  else
    if exists(select 1 from public.lesson_child_links where organization_id=child.organization_id and child_id=child.id)
      or exists(select 1 from public.lesson_student_registrations where organization_id=child.organization_id and child_id=child.id and phase<>'denied')
      then raise exception '過去の連携または未確定操作を確認してください。' using errcode='PT409'; end if;
    perform pg_advisory_xact_lock(hashtextextended('lesson-register-actor:'||profile.id::text,0));
    if (select count(*) from public.lesson_student_registrations where actor_id=profile.id and at>now()-interval '15 minutes')>=10 then raise exception '登録回数が上限です。' using errcode='PT429'; end if;
    insert into public.lesson_student_registrations(id,organization_id,child_id,actor_id,source_project_ref,source_campus_id,source_student_id,link_id,display_name,birth_date)
      values((p->>'id')::uuid,child.organization_id,child.id,profile.id,p->>'project',p->>'campus','student_support_'||replace((p->>'id')::uuid::text,'-',''),(p->>'id')::uuid,p->>'name',child.birth_date) returning * into v;
  end if;
  if exists(select 1 from public.lesson_child_links where organization_id=child.organization_id and child_id=child.id and (id<>v.link_id or not active or revision<>1))
    then raise exception '児童の連携が変更されています。' using errcode='PT409'; end if;
  update public.lesson_student_registrations set lease_id=(p->>'lease')::uuid,lease_until=now()+interval '3 minutes' where id=v.id returning * into v;
  return to_jsonb(v);
end; $$;

create or replace function public.link_registered_lesson_student(p_id uuid,p_lease uuid,p_table text)
returns public.lesson_child_links language plpgsql security definer set search_path=public as $$
declare v public.lesson_student_registrations%rowtype; l public.lesson_child_links%rowtype; c public.lesson_credential_operations%rowtype; executor uuid;
begin
  select coalesce(executor_id,actor_id) into executor from public.lesson_student_registrations where id=p_id;
  v:=public.assert_lesson_registration_execution(p_id,p_lease,executor);
  if p_table not in('user_data','test_user_data') or v.phase not in('source-created','linked','completed') then raise exception '登録操作を確認してください。' using errcode='PT409'; end if;
  select * into l from public.lesson_child_links where id=v.link_id for update;
  if found then
    if l.organization_id<>v.organization_id or l.child_id<>v.child_id or not l.active or l.revision<>1 or l.source_project_ref<>v.source_project_ref
      or l.source_table<>p_table or l.source_student_id<>v.source_student_id or l.source_campus_id<>v.source_campus_id or l.source_display_name<>v.display_name
      then raise exception '連携の対応を確認してください。' using errcode='PT409'; end if;
  else
    insert into public.lesson_child_links(id,organization_id,child_id,source_project_ref,source_table,source_student_id,source_campus_id,source_display_name,verified_by)
      values(v.link_id,v.organization_id,v.child_id,v.source_project_ref,p_table,v.source_student_id,v.source_campus_id,v.display_name,executor) returning * into l;
    insert into public.lesson_link_audit(organization_id,link_id,actor_id,action,snapshot) values(v.organization_id,l.id,executor,'linked',to_jsonb(l));
  end if;
  if v.phase='source-created' then update public.lesson_student_registrations set phase='linked' where id=v.id; end if;
  -- Preserve the immutable source actor. Authorization uses the current executor, not a reactivated former employee.
  perform pg_advisory_xact_lock(hashtextextended('support-credential:'||v.organization_id::text||':'||v.child_id,0));
  select * into c from public.lesson_credential_operations where id=v.id for update;
  if found then
    if c.organization_id<>v.organization_id or c.actor_id<>v.actor_id or c.child_id<>v.child_id or c.link_id<>l.id or c.link_revision<>l.revision or c.action<>'issue' or c.status='denied'
      or (c.status='completed' and c.finished_at<now()-interval '24 hours') then raise exception '発行操作が変更されています。' using errcode='PT409'; end if;
  else
    if exists(select 1 from public.lesson_credential_operations where organization_id=v.organization_id and child_id=v.child_id and status='requested') then raise exception '未確定の発行を確認してください。' using errcode='PT409'; end if;
    if (select count(*) from public.lesson_credential_operations where actor_id=v.actor_id and at>now()-interval '15 minutes')>=10 then raise exception '発行回数が上限です。' using errcode='PT429'; end if;
    insert into public.lesson_credential_operations(id,organization_id,child_id,link_id,link_revision,actor_id,action)
      values(v.id,v.organization_id,v.child_id,l.id,l.revision,v.actor_id,'issue');
  end if;
  return l;
end; $$;

create or replace function public.complete_lesson_student_registration(p_id uuid,p_lease uuid,p_actor uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v public.lesson_student_registrations%rowtype;
begin
  v:=public.assert_lesson_registration_execution(p_id,p_lease,p_actor);
  if v.phase not in('linked','completed') then raise exception '登録段階を確認してください。' using errcode='PT409'; end if;
  perform 1 from public.lesson_child_links where id=v.link_id and organization_id=v.organization_id and child_id=v.child_id and active and revision=1
    and source_student_id=v.source_student_id and source_campus_id=v.source_campus_id and source_project_ref=v.source_project_ref and source_display_name=v.display_name for share;
  if not found then raise exception '連携が変更されています。' using errcode='PT409'; end if;
  perform 1 from public.lesson_credential_operations where id=v.id and organization_id=v.organization_id and child_id=v.child_id
    and actor_id=v.actor_id and link_id=v.link_id and link_revision=1 and action='issue' and status in('requested','completed') for update;
  if not found then raise exception '発行履歴を確認してください。' using errcode='PT409'; end if;
  update public.lesson_credential_operations set status='completed',finished_at=now() where id=v.id and status='requested';
  update public.lesson_student_registrations set phase='completed',finished_at=now(),completed_by=p_actor where id=v.id and phase<>'completed';
  update public.lesson_student_registrations set lease_id=null,lease_until=null where id=v.id;
end; $$;
revoke all on function public.assert_lesson_registration_execution(uuid,uuid,uuid),public.handoff_lesson_student_registration(jsonb),
  public.claim_lesson_student_registration(jsonb),public.link_registered_lesson_student(uuid,uuid,text),public.complete_lesson_student_registration(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assert_lesson_registration_execution(uuid,uuid,uuid),public.handoff_lesson_student_registration(jsonb),
  public.claim_lesson_student_registration(jsonb),public.link_registered_lesson_student(uuid,uuid,text),public.complete_lesson_student_registration(uuid,uuid,uuid) to service_role;
