-- Verified classroom links only. Learning results remain read-only in this phase.
create table public.lesson_child_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  child_id text not null,
  source_project_ref text not null check (source_project_ref ~ '^[a-z0-9]{20}$'),
  source_table text not null check (source_table in ('user_data', 'test_user_data')),
  source_student_id text not null check (source_student_id ~ '^student_[A-Za-z0-9_-]{1,140}$'),
  source_campus_id text not null check (length(source_campus_id) between 1 and 80 and source_campus_id <> 'public'),
  source_display_name text not null check (length(source_display_name) between 1 and 160),
  active boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  verified_by uuid not null references public.profiles(id) on delete restrict,
  verified_at timestamptz not null default now(),
  disabled_by uuid references public.profiles(id) on delete restrict,
  disabled_at timestamptz,
  foreign key (organization_id, child_id) references public.children(organization_id, id) on delete restrict
);
create unique index lesson_child_links_active_child on public.lesson_child_links(organization_id, child_id) where active;
-- A learning account cannot silently share its history across organizations.
create unique index lesson_child_links_active_source on public.lesson_child_links(source_project_ref, source_table, source_student_id) where active;

create table public.lesson_link_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  link_id uuid not null references public.lesson_child_links(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('linked', 'disabled')),
  at timestamptz not null default now(),
  snapshot jsonb not null
);

create or replace function public.can_read_lesson_learning(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_org = public.current_organization_id()
    and (public.current_user_role() in ('manager', 'admin')
      or public.current_recorder_profile_id() is null
      or public.current_request_device_kind() = 'facility_shared');
$$;
revoke all on function public.can_read_lesson_learning(uuid) from public, anon;
grant execute on function public.can_read_lesson_learning(uuid) to authenticated;

create or replace function public.get_lesson_learning_context()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public.current_organization_id();
begin
  if v_org is null or not public.can_read_lesson_learning(v_org) then
    raise exception 'この端末またはアカウントでは学習管理を利用できません。' using errcode = '42501';
  end if;
  return jsonb_build_object('organizationId', v_org, 'actorId', auth.uid(),
    'canManageLinks', public.current_user_has_permission('manage_learning_links'));
end;
$$;
revoke all on function public.get_lesson_learning_context() from public, anon;
grant execute on function public.get_lesson_learning_context() to authenticated;

alter table public.lesson_child_links enable row level security;
alter table public.lesson_link_audit enable row level security;
create policy lesson_links_read on public.lesson_child_links for select to authenticated
  using (public.can_read_lesson_learning(organization_id) and exists (
    select 1 from public.children c where c.organization_id = lesson_child_links.organization_id
      and c.id = lesson_child_links.child_id and c.deleted_at is null));
create policy lesson_link_audit_read on public.lesson_link_audit for select to authenticated
  using (public.can_read_lesson_learning(organization_id) and public.current_user_has_permission('manage_learning_links'));
revoke all on public.lesson_child_links, public.lesson_link_audit from anon, authenticated;
grant select on public.lesson_child_links, public.lesson_link_audit to authenticated;
grant all on public.lesson_child_links, public.lesson_link_audit to service_role;

-- The bridge verifies source identity before invoking this service-only transaction.
create or replace function public.mutate_verified_lesson_link(
  p_actor uuid, p_org uuid, p_child text, p_action text, p_expected_revision integer,
  p_source_project text default null, p_source_table text default null,
  p_source_student text default null, p_source_campus text default null,
  p_source_name text default null
) returns public.lesson_child_links
language plpgsql security definer set search_path = public as $$
declare v_profile public.profiles%rowtype; v_link public.lesson_child_links%rowtype;
begin
  select * into v_profile from public.profiles where id = p_actor and organization_id = p_org and active;
  if not found or not (v_profile.role = 'admin' or (v_profile.role in ('manager', 'classroom_manager') and exists (
    select 1 from public.organization_role_permissions r where r.organization_id = p_org
      and r.role = v_profile.role and r.permissions ? 'manage_learning_links'))) then
    raise exception '学習アカウントの連携管理権限が必要です。' using errcode = '42501';
  end if;
  perform 1 from public.children where organization_id = p_org and id = p_child and deleted_at is null for update;
  if not found then raise exception '対象児童を確認してください。' using errcode = '42501'; end if;
  select * into v_link from public.lesson_child_links where organization_id = p_org and child_id = p_child and active for update;
  if p_action = 'link' then
    if p_expected_revision is distinct from 0 or v_link.id is not null then
      raise exception '連携状態が変更されています。更新して確認してください。' using errcode = 'PT409';
    end if;
    insert into public.lesson_child_links(organization_id, child_id, source_project_ref, source_table,
      source_student_id, source_campus_id, source_display_name, verified_by)
    values (p_org, p_child, p_source_project, p_source_table, p_source_student, p_source_campus, p_source_name, p_actor)
    returning * into v_link;
  elsif p_action = 'disable' then
    if v_link.id is null or p_expected_revision is null or p_expected_revision <> v_link.revision then
      raise exception '連携状態が変更されています。更新して確認してください。' using errcode = 'PT409';
    end if;
    update public.lesson_child_links set active = false, revision = revision + 1, disabled_by = p_actor, disabled_at = now()
      where id = v_link.id returning * into v_link;
  else raise exception '操作内容を確認してください。' using errcode = '22023';
  end if;
  insert into public.lesson_link_audit(organization_id, link_id, actor_id, action, snapshot)
    values (p_org, v_link.id, p_actor, case p_action when 'link' then 'linked' else 'disabled' end, to_jsonb(v_link));
  return v_link;
end;
$$;
revoke all on function public.mutate_verified_lesson_link(uuid, uuid, text, text, integer, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.mutate_verified_lesson_link(uuid, uuid, text, text, integer, text, text, text, text, text) to service_role;

create or replace function public.set_recorder_menu_preferences(
  p_organization_id uuid, p_recorder_profile_id uuid, p_preferences jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_allowed constant text[] := array['home','dailyChanges','todayWork','attendance','calendar',
    'monthlySchedule','operations','communication','assistant','form','records','meetings','learning','children','templates','team'];
  v_order jsonb; v_hidden jsonb; v_preferences jsonb;
begin
  if p_organization_id is distinct from public.current_organization_id() then
    raise exception 'Recorder menu settings require organization access.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_preferences, '{}'::jsonb)) <> 'object' then
    raise exception 'Menu preferences must be an object.' using errcode = '22023';
  end if;
  v_order := coalesce(p_preferences->'order', '[]'::jsonb);
  v_hidden := coalesce(p_preferences->'hidden', '[]'::jsonb);
  if jsonb_typeof(v_order) <> 'array' or jsonb_typeof(v_hidden) <> 'array' then
    raise exception 'Menu order and hidden values must be arrays.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(v_order) v(value) where not (v.value = any(v_allowed)))
    or exists (select 1 from jsonb_array_elements_text(v_hidden) v(value) where not (v.value = any(v_allowed))) then
    raise exception 'Menu preferences contain an unknown item.' using errcode = '22023';
  end if;
  select jsonb_build_object('order', coalesce((select jsonb_agg(value order by first_position) from (
    select value, min(position) first_position from jsonb_array_elements_text(v_order) with ordinality as ordered(value, position) group by value
  ) x), '[]'::jsonb), 'hidden', coalesce((select jsonb_agg(value order by first_position) from (
    select value, min(position) first_position from jsonb_array_elements_text(v_hidden) with ordinality as hidden(value, position)
    where value <> 'home' group by value
  ) x), '[]'::jsonb)) into v_preferences;
  update public.recorder_profiles set menu_preferences = v_preferences
    where organization_id = p_organization_id and id = p_recorder_profile_id and active;
  if not found then raise exception 'Active recorder profile was not found.' using errcode = 'P0002'; end if;
  return v_preferences;
end;
$$;
revoke all on function public.set_recorder_menu_preferences(uuid, uuid, jsonb) from public, anon;
grant execute on function public.set_recorder_menu_preferences(uuid, uuid, jsonb) to authenticated;
