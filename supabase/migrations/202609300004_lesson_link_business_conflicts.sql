-- Business conflicts are HTTP 409, not serialization failures eligible for retries.
create or replace function public.mutate_verified_lesson_link(
  p_actor uuid,p_org uuid,p_child text,p_action text,p_expected_revision integer,
  p_source_project text default null,p_source_table text default null,p_source_student text default null,
  p_source_campus text default null,p_source_name text default null
) returns public.lesson_child_links language plpgsql security definer set search_path=public as $$
declare v_profile public.profiles%rowtype;v_link public.lesson_child_links%rowtype;
begin
  select * into v_profile from public.profiles where id=p_actor and organization_id=p_org and active;
  if not found or not(v_profile.role='admin' or (v_profile.role in('manager','classroom_manager') and exists(
    select 1 from public.organization_role_permissions r where r.organization_id=p_org and r.role=v_profile.role and r.permissions ? 'manage_learning_links'))) then
    raise exception '学習アカウントの連携管理権限が必要です。' using errcode='42501';
  end if;
  perform 1 from public.children where organization_id=p_org and id=p_child and deleted_at is null for update;
  if not found then raise exception '対象児童を確認してください。' using errcode='42501'; end if;
  select * into v_link from public.lesson_child_links where organization_id=p_org and child_id=p_child and active for update;
  if p_action='link' then
    if p_expected_revision is distinct from 0 or v_link.id is not null then raise exception '連携状態が変更されています。更新して確認してください。' using errcode='PT409'; end if;
    insert into public.lesson_child_links(organization_id,child_id,source_project_ref,source_table,source_student_id,source_campus_id,source_display_name,verified_by)
      values(p_org,p_child,p_source_project,p_source_table,p_source_student,p_source_campus,p_source_name,p_actor) returning * into v_link;
  elsif p_action='disable' then
    if v_link.id is null or p_expected_revision is null or p_expected_revision<>v_link.revision then raise exception '連携状態が変更されています。更新して確認してください。' using errcode='PT409'; end if;
    update public.lesson_child_links set active=false,revision=revision+1,disabled_by=p_actor,disabled_at=now() where id=v_link.id returning * into v_link;
  else raise exception '操作内容を確認してください。' using errcode='22023'; end if;
  insert into public.lesson_link_audit(organization_id,link_id,actor_id,action,snapshot)
    values(p_org,v_link.id,p_actor,case p_action when 'link' then 'linked' else 'disabled' end,to_jsonb(v_link));
  return v_link;
end; $$;
revoke all on function public.mutate_verified_lesson_link(uuid,uuid,text,text,integer,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.mutate_verified_lesson_link(uuid,uuid,text,text,integer,text,text,text,text,text) to service_role;
