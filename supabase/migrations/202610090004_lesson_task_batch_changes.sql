alter table public.lesson_task_batches add column kind text not null default 'create' check(kind in('create','edit','stop'));
alter table public.lesson_task_batches add column parent_id uuid references public.lesson_task_batches(id) on delete restrict;
alter table public.lesson_task_batches add constraint lesson_task_batch_kind_parent check((kind='create' and parent_id is null) or (kind in('edit','stop') and parent_id is not null and parent_id<>id));
create index lesson_task_batch_changes_parent on public.lesson_task_batches(parent_id,created_at desc) where parent_id is not null;

create or replace function public.prepare_lesson_task_batch_change(p_actor uuid,p_org uuid,p_id uuid,p_parent uuid,p_kind text,p_template jsonb,p_targets jsonb)
returns public.lesson_task_batches language plpgsql security definer set search_path=public as $$
declare v_profile public.profiles%rowtype; v_parent public.lesson_task_batches%rowtype; v_batch public.lesson_task_batches%rowtype;
 v_canonical jsonb; v_target jsonb; v_items jsonb;
begin
 select * into v_profile from public.profiles where id=p_actor and organization_id=p_org and active;
 if not found or not (v_profile.role='admin' or (v_profile.role in('manager','classroom_manager') and exists(
  select 1 from public.organization_role_permissions r where r.organization_id=p_org and r.role=v_profile.role and r.permissions ? 'manage_learning_links')))
 then raise exception '課題の変更権限が必要です。' using errcode='42501'; end if;
 if p_id is null or p_id=p_parent or p_kind is null or p_kind not in('edit','stop') or jsonb_typeof(p_template) is distinct from 'object'
  or jsonb_typeof(p_targets) is distinct from 'array' or jsonb_array_length(p_targets) not between 1 and 100
 then raise exception '変更対象と内容を確認してください。' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into v_parent from public.lesson_task_batches where id=p_parent and actor_id=p_actor and organization_id=p_org and kind='create';
 if not found then raise exception '自分が作成した一括指定を選択してください。' using errcode='42501'; end if;
 select jsonb_agg(value order by value->>'childId') into v_canonical from jsonb_array_elements(p_targets);
 select * into v_batch from public.lesson_task_batches where id=p_id for update;
 if found then
  if v_batch.actor_id<>p_actor or v_batch.organization_id<>p_org then raise exception '変更操作を確認できません。' using errcode='42501'; end if;
  if v_batch.kind<>p_kind or v_batch.parent_id<>p_parent or v_batch.template is distinct from p_template or v_batch.targets is distinct from v_canonical
  then raise exception '同じ操作の内容が変更されています。' using errcode='PT409'; end if;
  return v_batch;
 end if;
 if (select count(distinct value->>'childId') from jsonb_array_elements(v_canonical))<>jsonb_array_length(v_canonical)
 then raise exception '対象児童が重複しています。' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('lesson-task-batch-actor:'||p_actor::text,0));
 if (select count(*) from public.lesson_task_batches where actor_id=p_actor and created_at>now()-interval '15 minutes')>=10
 then raise exception '連続操作の上限です。時間をおいてください。' using errcode='PT429'; end if;
 for v_target in select value from jsonb_array_elements(v_canonical) loop
  if not exists(select 1 from jsonb_array_elements(v_parent.items) original where original->>'childId'=v_target->>'childId'
   and original->>'linkId'=v_target->>'linkId' and original->>'revision'=v_target->>'revision' and original->>'campusId'=v_target->>'campusId'
   and original->>'taskId'=v_target->>'taskId' and original->>'status'='saved')
   or v_target->'before'->>'id' is distinct from v_target->>'taskId' or coalesce((v_target->'before'->>'revision')::integer,0)<1
   or coalesce((v_target->'before'->>'active')::boolean,false) is not true
  then raise exception '元の課題と変更対象が一致しません。' using errcode='PT409'; end if;
  perform 1 from public.lesson_child_links l join public.children c on c.organization_id=l.organization_id and c.id=l.child_id
   where l.organization_id=p_org and l.active and c.deleted_at is null and l.id=(v_target->>'linkId')::uuid
   and l.child_id=v_target->>'childId' and l.revision=(v_target->>'revision')::integer
   and l.source_project_ref=v_target->>'sourceProject' and l.source_table=v_target->>'sourceTable'
   and l.source_student_id=v_target->>'studentId' and l.source_campus_id=v_target->>'campusId';
  if not found then raise exception '児童の連携が変更されています。' using errcode='PT409'; end if;
 end loop;
 select jsonb_agg(jsonb_build_object('childId',value->>'childId','linkId',value->>'linkId','revision',(value->>'revision')::integer,
  'campusId',value->>'campusId','group',value->>'group','available',true,'taskId',value->>'taskId','before',value->'before',
  'status','pending','errorCode','','savedAt',null) order by value->>'childId') into v_items from jsonb_array_elements(v_canonical);
 insert into public.lesson_task_batches(id,organization_id,actor_id,kind,parent_id,template,targets,items)
  values(p_id,p_org,p_actor,p_kind,p_parent,p_template,v_canonical,v_items) returning * into v_batch;
 return v_batch;
end; $$;
revoke all on function public.prepare_lesson_task_batch_change(uuid,uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_lesson_task_batch_change(uuid,uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
