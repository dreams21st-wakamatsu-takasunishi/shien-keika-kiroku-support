create table public.lesson_account_audit (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  child_id text not null, link_id uuid not null references public.lesson_child_links(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check(action in('inspect','verify-card')),
  outcome text not null default 'started' check(outcome in('started','checked','verified','denied','failed')),
  at timestamptz not null default now(), finished_at timestamptz,
  foreign key(organization_id,child_id) references public.children(organization_id,id) on delete restrict
);
alter table public.lesson_account_audit enable row level security;
create policy lesson_account_audit_read on public.lesson_account_audit for select to authenticated using(
  public.can_read_lesson_learning(organization_id) and public.current_user_has_permission('manage_learning_accounts'));
revoke all on public.lesson_account_audit from public,anon,authenticated;
grant select on public.lesson_account_audit to authenticated;
grant all on public.lesson_account_audit to service_role;

create or replace function public.get_lesson_learning_context()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id();
begin
  if v_org is null or not public.can_read_lesson_learning(v_org) then
    raise exception 'この端末またはアカウントでは学習管理を利用できません。' using errcode='42501';
  end if;
  return jsonb_build_object('organizationId',v_org,'actorId',auth.uid(),
    'actorName',(select display_name from public.profiles where id=auth.uid() and active),
    'canManageLinks',public.current_user_has_permission('manage_learning_links'),
    'canReviewWord',public.current_user_has_permission('review_learning_work'),
    'canManageAccounts',public.current_user_has_permission('manage_learning_accounts'));
end; $$;
revoke all on function public.get_lesson_learning_context() from public,anon;
grant execute on function public.get_lesson_learning_context() to authenticated;

create or replace function public.begin_lesson_account_check(p_org uuid,p_actor uuid,p_child text,p_link uuid,p_revision integer,p_action text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_profile public.profiles%rowtype;v_id uuid;
begin
  select * into v_profile from public.profiles where id=p_actor and organization_id=p_org and active for share;
  if not found or not(v_profile.role='admin' or (v_profile.role in('manager','classroom_manager') and exists(
    select 1 from public.organization_role_permissions r where r.organization_id=p_org and r.role=v_profile.role and r.permissions ? 'manage_learning_accounts'))) then
    raise exception '学習アカウント管理の専用権限が必要です。' using errcode='42501';
  end if;
  if p_action not in('inspect','verify-card') then raise exception '操作を確認してください。' using errcode='22023'; end if;
  perform 1 from public.lesson_child_links l join public.children c on c.organization_id=l.organization_id and c.id=l.child_id
    where l.id=p_link and l.organization_id=p_org and l.child_id=p_child and l.revision=p_revision and l.active and c.deleted_at is null for share of l,c;
  if not found then raise exception '児童または学習連携が変更されています。' using errcode='PT409'; end if;
  insert into public.lesson_account_audit(organization_id,child_id,link_id,actor_id,action) values(p_org,p_child,p_link,p_actor,p_action) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.begin_lesson_account_check(uuid,uuid,text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.begin_lesson_account_check(uuid,uuid,text,uuid,integer,text) to service_role;
