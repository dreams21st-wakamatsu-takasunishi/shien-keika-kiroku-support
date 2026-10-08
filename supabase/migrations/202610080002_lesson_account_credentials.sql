create table public.lesson_credential_operations (
  id uuid primary key, organization_id uuid not null references public.organizations(id) on delete restrict,
  child_id text not null, link_id uuid not null references public.lesson_child_links(id) on delete restrict,
  link_revision integer not null, actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check(action in('issue','reset')), status text not null default 'requested' check(status in('requested','completed','denied')),
  at timestamptz not null default now(), finished_at timestamptz,
  foreign key(organization_id,child_id) references public.children(organization_id,id) on delete restrict
);
alter table public.lesson_credential_operations enable row level security;
revoke all on public.lesson_credential_operations from public,anon,authenticated;
grant select on public.lesson_credential_operations to authenticated;
grant all on public.lesson_credential_operations to service_role;
create policy lesson_credential_operations_read on public.lesson_credential_operations for select to authenticated using(
  public.can_read_lesson_learning(organization_id) and public.current_user_has_permission('manage_learning_account_credentials'));

create or replace function public.get_lesson_learning_context()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id();
begin
  if v_org is null or not public.can_read_lesson_learning(v_org) then raise exception 'この端末またはアカウントでは学習管理を利用できません。' using errcode='42501'; end if;
  return jsonb_build_object('organizationId',v_org,'actorId',auth.uid(),
    'actorName',(select display_name from public.profiles where id=auth.uid() and active),
    'canManageLinks',public.current_user_has_permission('manage_learning_links'),
    'canReviewWord',public.current_user_has_permission('review_learning_work'),
    'canManageAccounts',public.current_user_has_permission('manage_learning_accounts'),
    'canIssueAccounts',public.current_user_has_permission('manage_learning_account_credentials'));
end; $$;
revoke all on function public.get_lesson_learning_context() from public,anon;
grant execute on function public.get_lesson_learning_context() to authenticated;

create or replace function public.begin_lesson_credential_operation(p_id uuid,p_org uuid,p_actor uuid,p_child text,p_link uuid,p_revision integer,p_action text)
returns void language plpgsql security definer set search_path=public as $$
declare v_profile public.profiles%rowtype; v public.lesson_credential_operations%rowtype;
begin
  select * into v_profile from public.profiles where id=p_actor and organization_id=p_org and active for share;
  if not found or not(v_profile.role='admin' or (v_profile.role in('manager','classroom_manager') and exists(
    select 1 from public.organization_role_permissions r where r.organization_id=p_org and r.role=v_profile.role and r.permissions ? 'manage_learning_account_credentials')))
    then raise exception '発行・再発行の専用権限が必要です。' using errcode='42501'; end if;
  if p_action not in('issue','reset') then raise exception '操作を確認してください。' using errcode='22023'; end if;
  perform 1 from public.lesson_child_links l join public.children c on c.organization_id=l.organization_id and c.id=l.child_id
    where l.id=p_link and l.organization_id=p_org and l.child_id=p_child and l.revision=p_revision and l.active and c.deleted_at is null for share of l,c;
  if not found then raise exception '児童または学習連携が変更されています。' using errcode='PT409'; end if;
  perform pg_advisory_xact_lock(hashtextextended('support-credential:'||p_org::text||':'||p_child,0));
  select * into v from public.lesson_credential_operations where id=p_id for update;
  if found then
    if v.organization_id<>p_org or v.actor_id<>p_actor or v.child_id<>p_child or v.link_id<>p_link or v.link_revision<>p_revision or v.action<>p_action or v.status='denied'
      or (v.status='completed' and v.finished_at<now()-interval '24 hours') then raise exception '操作が変更されています。' using errcode='PT409'; end if;
  else
    if exists(select 1 from public.lesson_credential_operations where organization_id=p_org and child_id=p_child and status='requested')
      then raise exception '未確定の操作を再確認してください。' using errcode='PT409'; end if;
    if (select count(*) from public.lesson_credential_operations where actor_id=p_actor and at>now()-interval '15 minutes')>=10
      then raise exception '発行回数を確認してください。' using errcode='PT429'; end if;
    insert into public.lesson_credential_operations(id,organization_id,child_id,link_id,link_revision,actor_id,action) values(p_id,p_org,p_child,p_link,p_revision,p_actor,p_action);
  end if;
end; $$;
revoke all on function public.begin_lesson_credential_operation(uuid,uuid,uuid,text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.begin_lesson_credential_operation(uuid,uuid,uuid,text,uuid,integer,text) to service_role;
