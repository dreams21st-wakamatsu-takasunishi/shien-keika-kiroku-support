create index lesson_task_batches_org_history on public.lesson_task_batches(organization_id,created_at desc,id desc);

create or replace function public.can_view_lesson_task_audit()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.role='admin'
  and p.organization_id=public.current_organization_id() and public.can_read_lesson_learning(p.organization_id)
  and public.current_user_has_permission('manage_learning_links'));
$$;
revoke all on function public.can_view_lesson_task_audit() from public,anon;
grant execute on function public.can_view_lesson_task_audit() to authenticated;

-- Read-only projection: do not widen the creator-only table policy or return source targets.
create or replace function public.read_lesson_task_audit(p_action text default 'list',p_id uuid default null,
 p_kind text default 'all',p_state text default 'all',p_actor uuid default null,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id();v_rows jsonb;v_actors jsonb;v_entry jsonb;v_batch public.lesson_task_batches%rowtype;v_next jsonb;
begin
 if not public.can_view_lesson_task_audit() then raise exception '事業所の課題履歴は管理者のみ確認できます。' using errcode='42501'; end if;
 if p_action is null or p_action not in('list','detail') or p_kind is null or p_kind not in('all','create','edit','stop')
  or p_state is null or p_state not in('all','pending','completed') or ((p_before is null)<>(p_before_id is null))
  or (p_before is not null and not isfinite(p_before)) then raise exception '履歴の条件を確認してください。' using errcode='22023'; end if;
 if p_action='detail' then
  select * into v_batch from public.lesson_task_batches where id=p_id and organization_id=v_org;
  if not found then raise exception '履歴を確認できません。' using errcode='42501'; end if;
 end if;
 with candidates as (
  select b.*,p.display_name,p.active as actor_active,
   (select count(*) from jsonb_array_elements(b.items) i where i->>'status'='saved') as saved
  from public.lesson_task_batches b left join public.profiles p on p.id=b.actor_id and p.organization_id=v_org
  where b.organization_id=v_org and (p_action='detail' and b.id=p_id or p_action='list' and
   (p_kind='all' or b.kind=p_kind) and (p_actor is null or b.actor_id=p_actor) and
   (p_before is null or (b.created_at,b.id)<(p_before,p_before_id)))
 ), page as (
  select * from candidates where p_action='detail' or p_state='all' or p_state='pending' and saved<jsonb_array_length(items)
   or p_state='completed' and saved=jsonb_array_length(items)
  order by created_at desc,id desc limit 21
 ) select coalesce(jsonb_agg(jsonb_build_object('operationId',id,'title',template->>'title','createdAt',created_at,
   'kind',kind,'parentId',parent_id,'actorId',actor_id,'actorName',coalesce(nullif(display_name,''),'在籍情報なし'),
   'actorActive',coalesce(actor_active,false),'total',jsonb_array_length(items),'saved',saved) order by created_at desc,id desc),'[]'::jsonb) into v_rows from page;
 if p_action='detail' then
  v_entry:=v_rows->0;
  return jsonb_build_object('schemaVersion',1,'organizationId',v_org,'entry',v_entry,'batch',jsonb_build_object(
   'operationId',v_batch.id,'template',v_batch.template,'createdAt',v_batch.created_at,'kind',v_batch.kind,'parentId',v_batch.parent_id,'items',v_batch.items));
 end if;
 if jsonb_array_length(v_rows)>20 then
  v_next:=jsonb_build_object('createdAt',v_rows->19->>'createdAt','operationId',v_rows->19->>'operationId');
  v_rows:=v_rows-20;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.actor_id,'name',coalesce(nullif(p.display_name,''),'在籍情報なし'),
  'active',coalesce(p.active,false)) order by a.actor_id),'[]'::jsonb) into v_actors
 from (select distinct actor_id from public.lesson_task_batches where organization_id=v_org limit 501) a
 left join public.profiles p on p.id=a.actor_id and p.organization_id=v_org;
 if jsonb_array_length(v_actors)>500 then raise exception '担当職員数が上限を超えています。管理者に確認してください。' using errcode='22023'; end if;
 return jsonb_build_object('schemaVersion',1,'organizationId',v_org,'filters',jsonb_build_object('kind',p_kind,'state',p_state,'actorId',p_actor),
  'entries',v_rows,'actors',v_actors,'nextCursor',v_next);
end; $$;
revoke all on function public.read_lesson_task_audit(text,uuid,text,text,uuid,timestamptz,uuid) from public,anon;
grant execute on function public.read_lesson_task_audit(text,uuid,text,text,uuid,timestamptz,uuid) to authenticated;
