-- Operational improvements: invite-only registration, staff email, AI settings,
-- resilient record drafts, and the additional record answers used by the new wizard.

alter table public.profiles add column if not exists email text;

update public.profiles as profile
set email = auth_user.email
from auth.users as auth_user
where auth_user.id = profile.id
  and profile.email is null;

alter table public.support_records add column if not exists attendance_note text;
alter table public.support_records add column if not exists expression_note text;
alter table public.support_records add column if not exists snack_note text;
alter table public.support_records add column if not exists skipped_question_ids text[] not null default '{}';

create table if not exists public.organization_ai_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  tone text not null default 'assertive' check (tone in ('assertive', 'polite', 'custom')),
  custom_tone text not null default '',
  custom_instructions text not null default '客観的な事実を中心に、支援者の関わりと児童の反応が分かる文章にする。',
  target_length integer not null default 180 check (target_length between 80 and 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organization_ai_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create or replace function public.create_default_organization_ai_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_ai_settings (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_default_ai_settings_after_organization on public.organizations;
create trigger create_default_ai_settings_after_organization
  after insert on public.organizations
  for each row execute function public.create_default_organization_ai_settings();

create table if not exists public.record_drafts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  draft_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, draft_key)
);

create index if not exists record_drafts_user_updated_idx
  on public.record_drafts(organization_id, user_id, updated_at desc);

drop trigger if exists ai_settings_updated_at on public.organization_ai_settings;
create trigger ai_settings_updated_at
  before update on public.organization_ai_settings
  for each row execute function public.set_updated_at();

drop trigger if exists record_drafts_updated_at on public.record_drafts;
create trigger record_drafts_updated_at
  before update on public.record_drafts
  for each row execute function public.set_updated_at();

-- Invitations are now the only route by which an auth user can obtain a profile.
-- The exception aborts the auth.users insert, so direct sign-up cannot leave an
-- unrelated account behind.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matching_invite public.member_invitations%rowtype;
begin
  select * into matching_invite
  from public.member_invitations
  where lower(email) = lower(new.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if matching_invite.id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Registration is invite-only. A valid staff invitation is required.';
  end if;

  update public.member_invitations
  set accepted_at = now()
  where id = matching_invite.id;

  insert into public.profiles(id, organization_id, display_name, role, email)
  values (
    new.id,
    matching_invite.organization_id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    matching_invite.role,
    lower(new.email)
  );
  return new;
end;
$$;

alter table public.organization_ai_settings enable row level security;
alter table public.record_drafts enable row level security;

drop policy if exists ai_settings_select on public.organization_ai_settings;
create policy ai_settings_select on public.organization_ai_settings for select
  using (organization_id = public.current_organization_id());

drop policy if exists ai_settings_insert on public.organization_ai_settings;
create policy ai_settings_insert on public.organization_ai_settings for insert
  with check (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  );

drop policy if exists ai_settings_update on public.organization_ai_settings;
create policy ai_settings_update on public.organization_ai_settings for update
  using (
    organization_id = public.current_organization_id()
    and public.current_user_role() in ('manager', 'admin')
  )
  with check (organization_id = public.current_organization_id());

drop policy if exists record_drafts_select on public.record_drafts;
create policy record_drafts_select on public.record_drafts for select
  using (
    organization_id = public.current_organization_id()
    and user_id = auth.uid()
  );

drop policy if exists record_drafts_insert on public.record_drafts;
create policy record_drafts_insert on public.record_drafts for insert
  with check (
    organization_id = public.current_organization_id()
    and user_id = auth.uid()
  );

drop policy if exists record_drafts_update on public.record_drafts;
create policy record_drafts_update on public.record_drafts for update
  using (
    organization_id = public.current_organization_id()
    and user_id = auth.uid()
  )
  with check (
    organization_id = public.current_organization_id()
    and user_id = auth.uid()
  );

drop policy if exists record_drafts_delete on public.record_drafts;
create policy record_drafts_delete on public.record_drafts for delete
  using (
    organization_id = public.current_organization_id()
    and user_id = auth.uid()
  );

grant select, insert, update on public.organization_ai_settings to authenticated;
grant select, insert, update, delete on public.record_drafts to authenticated;
grant all on public.organization_ai_settings, public.record_drafts to service_role;
