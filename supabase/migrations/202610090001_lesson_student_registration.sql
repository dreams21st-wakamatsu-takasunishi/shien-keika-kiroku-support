create table public.lesson_student_registrations (
  id uuid primary key, organization_id uuid not null references public.organizations(id) on delete restrict,
  child_id text not null, actor_id uuid not null references public.profiles(id) on delete restrict,
  source_project_ref text not null, source_campus_id text not null, source_student_id text not null unique,
  link_id uuid not null unique, display_name text not null, birth_date date not null,
  phase text not null default 'requested' check(phase in('requested','source-created','linked','completed','denied')),
  lease_id uuid, lease_until timestamptz, at timestamptz not null default now(), finished_at timestamptz,
  foreign key(organization_id,child_id) references public.children(organization_id,id) on delete restrict
);
create unique index lesson_student_registration_child on public.lesson_student_registrations(organization_id,child_id) where phase<>'denied';
alter table public.lesson_student_registrations enable row level security;
revoke all on public.lesson_student_registrations from public,anon,authenticated;
grant select on public.lesson_student_registrations to authenticated;
grant all on public.lesson_student_registrations to service_role;
create policy lesson_student_registration_read on public.lesson_student_registrations for select to authenticated using(
  public.can_read_lesson_learning(organization_id) and public.current_user_has_permission('manage_learning_links') and public.current_user_has_permission('manage_learning_account_credentials'));

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
    if v.organization_id<>(p->>'org')::uuid or v.child_id<>p->>'child' or v.actor_id<>(p->>'actor')::uuid or v.source_project_ref<>p->>'project'
      or v.source_campus_id<>p->>'campus' or v.display_name<>p->>'name' or v.birth_date::text<>p->>'birth' or v.phase='denied'
      or (v.phase='completed' and v.finished_at<now()-interval '24 hours') then raise exception '登録操作が変更されています。' using errcode='PT409'; end if;
    if v.lease_until>now() then raise exception '同じ登録操作を処理中です。' using errcode='PT423'; end if;
  else
    if exists(select 1 from public.lesson_child_links where organization_id=child.organization_id and child_id=child.id)
      or exists(select 1 from public.lesson_student_registrations where organization_id=child.organization_id and child_id=child.id and phase<>'denied')
      then raise exception '過去の連携または未確定操作を確認してください。' using errcode='PT409'; end if;
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
declare v public.lesson_student_registrations%rowtype; l public.lesson_child_links%rowtype; profile public.profiles%rowtype;
begin
  select * into v from public.lesson_student_registrations where id=p_id and lease_id=p_lease and lease_until>now() and phase in('source-created','linked','completed') for update;
  if not found or p_table not in('user_data','test_user_data') then raise exception '登録操作を確認してください。' using errcode='PT409'; end if;
  select * into profile from public.profiles where id=v.actor_id and organization_id=v.organization_id and active for share;
  if not found or not(profile.role='admin' or (profile.role in('manager','classroom_manager') and exists(select 1 from public.organization_role_permissions r
    where r.organization_id=v.organization_id and r.role=profile.role and r.permissions ? 'manage_learning_links' and r.permissions ? 'manage_learning_account_credentials')))
    then raise exception '登録権限が変更されています。' using errcode='42501'; end if;
  perform 1 from public.children where organization_id=v.organization_id and id=v.child_id and deleted_at is null and btrim(name)=v.display_name and birth_date=v.birth_date for update;
  if not found then raise exception '児童情報が変更されています。' using errcode='PT409'; end if;
  if exists(select 1 from public.lesson_child_links where organization_id=v.organization_id and child_id=v.child_id and (id<>v.link_id or not active or revision<>1)) then raise exception '既存の連携を確認してください。' using errcode='PT409'; end if;
  select * into l from public.lesson_child_links where id=v.link_id for update;
  if found then
    if l.organization_id<>v.organization_id or l.child_id<>v.child_id or not l.active or l.revision<>1 or l.source_project_ref<>v.source_project_ref
      or l.source_table<>p_table or l.source_student_id<>v.source_student_id or l.source_campus_id<>v.source_campus_id or l.source_display_name<>v.display_name
      then raise exception '連携の対応を確認してください。' using errcode='PT409'; end if;
  else
    insert into public.lesson_child_links(id,organization_id,child_id,source_project_ref,source_table,source_student_id,source_campus_id,source_display_name,verified_by)
      values(v.link_id,v.organization_id,v.child_id,v.source_project_ref,p_table,v.source_student_id,v.source_campus_id,v.display_name,v.actor_id) returning * into l;
    insert into public.lesson_link_audit(organization_id,link_id,actor_id,action,snapshot) values(v.organization_id,l.id,v.actor_id,'linked',to_jsonb(l));
  end if;
  if v.phase='source-created' then update public.lesson_student_registrations set phase='linked' where id=v.id; end if;
  perform public.begin_lesson_credential_operation(v.id,v.organization_id,v.actor_id,v.child_id,l.id,l.revision,'issue');
  return l;
end; $$;
revoke all on function public.claim_lesson_student_registration(jsonb),public.link_registered_lesson_student(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_lesson_student_registration(jsonb),public.link_registered_lesson_student(uuid,uuid,text) to service_role;
