create table public.lesson_task_batches (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 template jsonb not null check (jsonb_typeof(template)='object'),
 targets jsonb not null check (jsonb_typeof(targets)='array' and jsonb_array_length(targets) between 1 and 100),
 items jsonb not null check (jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 100),
 created_at timestamptz not null default now()
);
create index lesson_task_batches_actor on public.lesson_task_batches(organization_id,actor_id,created_at desc);
alter table public.lesson_task_batches enable row level security;
create policy lesson_task_batches_read on public.lesson_task_batches for select to authenticated using (
 actor_id=auth.uid() and public.can_read_lesson_learning(organization_id)
 and public.current_user_has_permission('manage_learning_links'));
revoke all on public.lesson_task_batches from anon,authenticated;
grant select on public.lesson_task_batches to authenticated;
grant all on public.lesson_task_batches to service_role;

-- Immutable target snapshots and fixed task IDs make interrupted retries idempotent.
create or replace function public.mutate_lesson_task_batch(p_actor uuid,p_org uuid,p_id uuid,p_action text,
 p_template jsonb default null,p_targets jsonb default null,p_child text default null,p_error text default null)
returns public.lesson_task_batches language plpgsql security definer set search_path=public as $$
declare v_profile public.profiles%rowtype; v_batch public.lesson_task_batches%rowtype;
 v_target jsonb; v_items jsonb; v_canonical jsonb;
begin
 select * into v_profile from public.profiles where id=p_actor and organization_id=p_org and active;
 if not found or not (v_profile.role='admin' or (v_profile.role in ('manager','classroom_manager') and exists (
  select 1 from public.organization_role_permissions r where r.organization_id=p_org and r.role=v_profile.role and r.permissions ? 'manage_learning_links')))
 then raise exception '課題の指定権限が必要です。' using errcode='42501'; end if;
 -- Serialize preparation of the same operation, including the absent-row case.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into v_batch from public.lesson_task_batches where id=p_id for update;
 if v_batch.id is not null and (v_batch.actor_id<>p_actor or v_batch.organization_id<>p_org)
 then raise exception '一括指定を確認できません。' using errcode='42501'; end if;
 if p_action='prepare' then
  if jsonb_typeof(p_targets) is distinct from 'array' or jsonb_array_length(p_targets) not between 1 and 100
   or jsonb_typeof(p_template) is distinct from 'object'
  then raise exception '対象と課題を確認してください。' using errcode='22023'; end if;
  select jsonb_agg(value order by value->>'childId') into v_canonical from jsonb_array_elements(p_targets);
  if (select count(distinct value->>'childId') from jsonb_array_elements(v_canonical))<>jsonb_array_length(v_canonical)
   or (select count(distinct value->>'linkId') from jsonb_array_elements(v_canonical))<>jsonb_array_length(v_canonical)
  then raise exception '対象児童が重複しています。' using errcode='22023'; end if;
  if v_batch.id is not null then
   if v_batch.template is distinct from p_template or v_batch.targets is distinct from v_canonical
   then raise exception '同じ操作の指定内容が変更されています。' using errcode='PT409'; end if;
   return v_batch;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lesson-task-batch-actor:'||p_actor::text,0));
  if (select count(*) from public.lesson_task_batches where actor_id=p_actor and created_at>now()-interval '15 minutes')>=10
  then raise exception '連続指定の上限です。時間をおいてください。' using errcode='PT429'; end if;
  for v_target in select value from jsonb_array_elements(v_canonical) loop
   perform 1 from public.lesson_child_links l join public.children c on c.organization_id=l.organization_id and c.id=l.child_id
    where l.organization_id=p_org and l.active and c.deleted_at is null and l.id=(v_target->>'linkId')::uuid
    and l.child_id=v_target->>'childId' and l.revision=(v_target->>'revision')::integer
    and l.source_project_ref=v_target->>'sourceProject' and l.source_table=v_target->>'sourceTable'
    and l.source_student_id=v_target->>'studentId' and l.source_campus_id=v_target->>'campusId';
   if not found then raise exception '児童の連携が変更されています。' using errcode='PT409'; end if;
  end loop;
  select jsonb_agg(jsonb_build_object('childId',value->>'childId','linkId',value->>'linkId','revision',(value->>'revision')::integer,
   'campusId',value->>'campusId','group',value->>'group','available',true,'taskId',gen_random_uuid(),
   'status','pending','errorCode','','savedAt',null) order by value->>'childId') into v_items from jsonb_array_elements(v_canonical);
  insert into public.lesson_task_batches(id,organization_id,actor_id,template,targets,items)
   values(p_id,p_org,p_actor,p_template,v_canonical,v_items) returning * into v_batch;
 elsif p_action in ('check','receipt','error') then
  if v_batch.id is null then raise exception '一括指定が見つかりません。' using errcode='PT409'; end if;
  select value into v_target from jsonb_array_elements(v_batch.targets) where value->>'childId'=p_child;
  if v_target is null then raise exception '対象児童を確認してください。' using errcode='22023'; end if;
  if p_action in ('check','receipt') then
   perform 1 from public.lesson_child_links l join public.children c on c.organization_id=l.organization_id and c.id=l.child_id
    where l.organization_id=p_org and l.active and c.deleted_at is null and l.id=(v_target->>'linkId')::uuid
    and l.child_id=p_child and l.revision=(v_target->>'revision')::integer
    and l.source_project_ref=v_target->>'sourceProject' and l.source_table=v_target->>'sourceTable'
    and l.source_student_id=v_target->>'studentId' and l.source_campus_id=v_target->>'campusId';
   if not found then raise exception '児童の連携が変更されています。' using errcode='PT409'; end if;
  end if;
  if p_action='receipt' then
   select jsonb_agg(case when value->>'childId'=p_child and value->>'status'='pending'
    then value||jsonb_build_object('status','saved','errorCode','','savedAt',now()) else value end order by ordinality)
    into v_items from jsonb_array_elements(v_batch.items) with ordinality;
  elsif p_action='error' then
   if p_error is null or p_error not in ('connection','changed','capacity','conflict','permission')
   then raise exception '結果を確認してください。' using errcode='22023'; end if;
   select jsonb_agg(case when value->>'childId'=p_child and value->>'status'='pending'
    then value||jsonb_build_object('errorCode',p_error) else value end order by ordinality)
    into v_items from jsonb_array_elements(v_batch.items) with ordinality;
  end if;
  if v_items is not null then update public.lesson_task_batches set items=v_items where id=p_id returning * into v_batch; end if;
 else raise exception '操作を確認してください。' using errcode='22023'; end if;
 return v_batch;
end;
$$;
revoke all on function public.mutate_lesson_task_batch(uuid,uuid,uuid,text,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.mutate_lesson_task_batch(uuid,uuid,uuid,text,jsonb,jsonb,text,text) to service_role;
