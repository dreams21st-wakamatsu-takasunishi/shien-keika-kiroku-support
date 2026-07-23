-- 支援経過記録作成サポート: multi-tenant operational schema
-- Run with `supabase db push` or paste into the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  display_name text not null,
  role text not null default 'staff' check (role in ('staff', 'manager', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_organization_idx on public.profiles(organization_id);

create table if not exists public.member_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('staff', 'manager', 'admin')),
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists pending_member_invite_email_idx
  on public.member_invitations(lower(email)) where accepted_at is null;

create table if not exists public.children (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  name text not null,
  kana text,
  grade text,
  care_type text check (care_type is null or care_type in ('児童発達支援', '放課後等デイサービス')),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create index if not exists children_active_idx on public.children(organization_id, name) where deleted_at is null;

create table if not exists public.record_templates (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  name text not null,
  template_type text not null check (template_type in ('平日', '休日', 'カスタム')),
  is_default boolean not null default false,
  description text,
  sections jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  effective_from date not null default current_date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create table if not exists public.support_plans (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  child_id text not null,
  title text not null,
  long_term_goal text not null default '',
  short_term_goal text not null default '',
  domain_goals jsonb not null default '{}'::jsonb,
  valid_from date not null,
  valid_to date,
  status text not null default '下書き' check (status in ('下書き', '有効', '終了')),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, child_id)
    references public.children(organization_id, id) on delete restrict
);

create index if not exists support_plans_child_idx on public.support_plans(organization_id, child_id, status);

create table if not exists public.support_records (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  template_id text not null,
  template_name text not null,
  template_type text not null check (template_type in ('平日', '休日', 'カスタム')),
  template_snapshot jsonb not null default '{}'::jsonb,
  child_id text not null,
  child_name text not null,
  support_plan_id text,
  record_date date not null,
  retention_until date not null,
  attendance text not null,
  expression text not null,
  snack text not null,
  recorder_name text not null,
  service_start_time time,
  service_end_time time,
  transportation text check (
    transportation is null or transportation in ('送迎なし', '迎えのみ', '送りのみ', '往復')
  ),
  five_domains text[] not null default '{}',
  goal_progress jsonb not null default '[]'::jsonb,
  section_answers jsonb not null default '{}'::jsonb,
  synthesized_summary text,
  approval_status text not null default '未確認'
    check (approval_status in ('未確認', '確認済み', '要修正')),
  review_comment text,
  reviewer_name text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  locked_at timestamptz,
  version integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, child_id)
    references public.children(organization_id, id) on delete restrict,
  foreign key (organization_id, template_id)
    references public.record_templates(organization_id, id) on delete restrict,
  foreign key (organization_id, support_plan_id)
    references public.support_plans(organization_id, id) on delete restrict
);

create index if not exists support_records_date_idx
  on public.support_records(organization_id, record_date desc) where deleted_at is null;
create index if not exists support_records_child_idx
  on public.support_records(organization_id, child_id, record_date desc) where deleted_at is null;
create index if not exists support_records_approval_idx
  on public.support_records(organization_id, approval_status) where deleted_at is null;

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_logs_lookup_idx
  on public.audit_logs(organization_id, table_name, row_id, occurred_at desc);

create table if not exists public.ai_generation_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  record_id text,
  section_title text not null,
  input_snapshot jsonb not null,
  generated_text text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matching_invite public.member_invitations%rowtype;
  target_org_id uuid;
  target_role text;
  new_org_name text;
begin
  select * into matching_invite
  from public.member_invitations
  where lower(email) = lower(new.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if matching_invite.id is not null then
    target_org_id := matching_invite.organization_id;
    target_role := matching_invite.role;
    update public.member_invitations set accepted_at = now() where id = matching_invite.id;
  else
    new_org_name := coalesce(nullif(new.raw_user_meta_data ->> 'organization_name', ''), '新規事業所');
    insert into public.organizations(name) values (new_org_name) returning id into target_org_id;
    target_role := 'admin';
  end if;

  insert into public.profiles(id, organization_id, display_name, role)
  values (
    new.id,
    target_org_id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    target_role
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.organization_id is distinct from old.organization_id or new.role is distinct from old.role)
     and coalesce(public.current_user_role(), '') <> 'admin' then
    raise exception 'Only organization administrators can change roles or organization membership';
  end if;
  return new;
end;
$$;

create trigger protect_profile_privileges_before_update
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

create or replace function public.prepare_support_plan_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger prepare_support_plan_write_before
  before insert or update on public.support_plans
  for each row execute function public.prepare_support_plan_write();

create or replace function public.enforce_record_workflow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.current_user_role();
  actor_name text;
begin
  select display_name into actor_name from public.profiles where id = auth.uid();
  new.retention_until := (new.record_date + interval '5 years')::date;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := auth.uid();
    if new.approval_status in ('確認済み', '要修正') and actor_role not in ('manager', 'admin') then
      raise exception 'Only managers can review records';
    end if;
  else
    if old.approval_status = '確認済み' and new.approval_status = '確認済み' then
      raise exception 'Approved records are locked. Mark the record as requiring revision first.';
    end if;
    if new.approval_status in ('確認済み', '要修正')
       and new.approval_status is distinct from old.approval_status
       and actor_role not in ('manager', 'admin') then
      raise exception 'Only managers can review records';
    end if;
    new.version := old.version + 1;
    new.updated_by := auth.uid();
  end if;

  if new.approval_status = '確認済み' then
    new.reviewed_by := auth.uid();
    new.reviewer_name := actor_name;
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.locked_at := now();
  elsif new.approval_status = '要修正' then
    new.reviewed_by := auth.uid();
    new.reviewer_name := actor_name;
    new.reviewed_at := now();
    new.locked_at := null;
  else
    new.locked_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.bump_template_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger bump_template_version_before
  before update on public.record_templates
  for each row execute function public.bump_template_version();

create trigger enforce_record_workflow_before
  before insert or update on public.support_records
  for each row execute function public.enforce_record_workflow();

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  affected_id text;
begin
  org_id := coalesce(new.organization_id, old.organization_id);
  affected_id := coalesce(new.id::text, old.id::text);
  insert into public.audit_logs(
    organization_id, actor_id, table_name, row_id, action, old_data, new_data
  ) values (
    org_id,
    auth.uid(),
    tg_table_name,
    affected_id,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger audit_children_after after insert or update or delete on public.children
  for each row execute function public.write_audit_log();
create trigger audit_templates_after after insert or update or delete on public.record_templates
  for each row execute function public.write_audit_log();
create trigger audit_support_plans_after after insert or update or delete on public.support_plans
  for each row execute function public.write_audit_log();
create trigger audit_support_records_after after insert or update or delete on public.support_records
  for each row execute function public.write_audit_log();
create trigger audit_profiles_after after insert or update or delete on public.profiles
  for each row execute function public.write_audit_log();
create trigger audit_member_invitations_after after insert or update or delete on public.member_invitations
  for each row execute function public.write_audit_log();

create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger children_updated_at before update on public.children
  for each row execute function public.set_updated_at();
create trigger templates_updated_at before update on public.record_templates
  for each row execute function public.set_updated_at();
create trigger plans_updated_at before update on public.support_plans
  for each row execute function public.set_updated_at();
create trigger records_updated_at before update on public.support_records
  for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.member_invitations enable row level security;
alter table public.children enable row level security;
alter table public.record_templates enable row level security;
alter table public.support_plans enable row level security;
alter table public.support_records enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ai_generation_logs enable row level security;

create policy organizations_select on public.organizations for select
  using (id = public.current_organization_id());
create policy organizations_update on public.organizations for update
  using (id = public.current_organization_id() and public.current_user_role() = 'admin')
  with check (id = public.current_organization_id());

create policy profiles_select on public.profiles for select
  using (organization_id = public.current_organization_id());
create policy profiles_update on public.profiles for update
  using (
    organization_id = public.current_organization_id()
    and (id = auth.uid() or public.current_user_role() = 'admin')
  )
  with check (organization_id = public.current_organization_id());

create policy invitations_select on public.member_invitations for select
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

create policy children_select on public.children for select
  using (organization_id = public.current_organization_id());
create policy children_insert on public.children for insert
  with check (organization_id = public.current_organization_id());
create policy children_update on public.children for update
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy templates_select on public.record_templates for select
  using (organization_id = public.current_organization_id());
create policy templates_insert on public.record_templates for insert
  with check (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );
create policy templates_update on public.record_templates for update
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  )
  with check (organization_id = public.current_organization_id());

create policy support_plans_select on public.support_plans for select
  using (organization_id = public.current_organization_id());
create policy support_plans_insert on public.support_plans for insert
  with check (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );
create policy support_plans_update on public.support_plans for update
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  )
  with check (organization_id = public.current_organization_id());

create policy records_select on public.support_records for select
  using (organization_id = public.current_organization_id());
create policy records_insert on public.support_records for insert
  with check (organization_id = public.current_organization_id());
create policy records_update on public.support_records for update
  using (
    organization_id = public.current_organization_id()
    and (created_by = auth.uid() or public.current_user_role() in ('manager', 'admin'))
  )
  with check (organization_id = public.current_organization_id());

create policy audit_logs_select on public.audit_logs for select
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

create policy ai_logs_select on public.ai_generation_logs for select
  using (
    organization_id = public.current_organization_id()
    and (actor_id = auth.uid() or public.current_user_role() in ('manager', 'admin'))
  );

grant usage on schema public to authenticated, service_role;
grant select, insert, update on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;

-- Enable live workspace refresh when the project has the default Supabase Realtime publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_records') then
      alter publication supabase_realtime add table public.support_records;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'children') then
      alter publication supabase_realtime add table public.children;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'record_templates') then
      alter publication supabase_realtime add table public.record_templates;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_plans') then
      alter publication supabase_realtime add table public.support_plans;
    end if;
  end if;
end $$;
