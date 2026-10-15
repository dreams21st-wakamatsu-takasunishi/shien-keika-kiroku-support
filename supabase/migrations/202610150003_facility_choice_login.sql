create table public.facility_login_credentials (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 login_id text not null check(login_id ~ '^[a-z0-9._-]{3,32}$'),
 password_hash text not null, enabled boolean not null default false,
 revision integer not null default 1, updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id)
);
create table public.facility_login_attempts (
 id bigint generated always as identity primary key,organization_id uuid not null references public.organizations(id) on delete cascade,
 device_id uuid not null references public.organization_devices(id) on delete cascade,success boolean not null,at timestamptz not null default now()
);
create index facility_login_attempt_window on public.facility_login_attempts(organization_id,device_id,at desc);
create table public.facility_login_challenges (
 id uuid primary key default gen_random_uuid(),token_hash text unique not null,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 device_id uuid not null references public.organization_devices(id) on delete cascade,
 credential_revision integer not null,eligible jsonb not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '5 minutes',
 consumed_at timestamptz,selected_recorder_id uuid references public.recorder_profiles(id),selected_user_id uuid references public.profiles(id),issued_at timestamptz
);
create table public.facility_login_sessions (
 session_id uuid primary key,challenge_id uuid unique not null references public.facility_login_challenges(id) on delete restrict,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 device_id uuid not null references public.organization_devices(id) on delete restrict,
 user_id uuid not null references public.profiles(id) on delete restrict,recorder_id uuid not null references public.recorder_profiles(id) on delete restrict,
 credential_revision integer not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '12 hours'
);
alter table public.facility_login_credentials enable row level security;
alter table public.facility_login_attempts enable row level security;
alter table public.facility_login_challenges enable row level security;
alter table public.facility_login_sessions enable row level security;
revoke all on public.facility_login_credentials,public.facility_login_attempts,public.facility_login_challenges,public.facility_login_sessions from public,anon,authenticated;
grant all on public.facility_login_credentials,public.facility_login_attempts,public.facility_login_challenges,public.facility_login_sessions to service_role;
grant usage,select on sequence public.facility_login_attempts_id_seq to service_role;

-- This is an operational identity choice, not proof that the selected person was present.
create function public.facility_eligible_staff(p_org uuid)
returns table(recorder_id uuid,user_id uuid,display_name text) language sql stable security definer set search_path=public as $$
 select r.id,p.id,r.display_name from public.recorder_profiles r join public.profiles p on p.organization_id=r.organization_id
  and (p.recorder_profile_id=r.id or p.id=r.auth_user_id and r.individual_login_enabled)
 where r.organization_id=p_org and r.active and p.active and p.role='staff' and r.individual_login_role='staff'
  and not exists(select 1 from public.profiles other where other.organization_id=p_org and other.id<>p.id
   and (other.recorder_profile_id=r.id or other.id=r.auth_user_id))
  and not exists(select 1 from public.profiles other where other.organization_id=p_org and other.role<>'staff'
   and (other.recorder_profile_id=r.id or other.id=r.auth_user_id));
$$;
revoke all on function public.facility_eligible_staff(uuid) from public,anon,authenticated;
grant execute on function public.facility_eligible_staff(uuid) to service_role;

create function public.facility_session_allowed()
returns boolean language plpgsql stable security definer set search_path=public,extensions as $$
declare v_profile public.profiles%rowtype;v_session public.facility_login_sessions%rowtype;v_token text;v_id text:=auth.jwt()->>'session_id';v_email text;
begin
 select * into v_profile from public.profiles where id=auth.uid() and active;
 if not found then return false; end if;
 if v_id ~ '^[a-fA-F0-9-]{36}$' then select * into v_session from public.facility_login_sessions where session_id=v_id::uuid; end if;
 if v_session.session_id is not null then
  if v_session.user_id<>auth.uid() or v_profile.role<>'staff' or v_profile.organization_id<>v_session.organization_id or v_session.expires_at<=now() then return false; end if;
  begin v_token:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-support-device-token',current_setting('app.support_device_token',true));
  exception when others then return false; end;
  return exists(select 1 from public.facility_login_credentials c join public.organization_devices d on d.organization_id=c.organization_id join public.organizations o on o.id=c.organization_id
    where c.organization_id=v_session.organization_id and c.enabled and c.revision=v_session.credential_revision
     and o.device_approval_enabled and d.id=v_session.device_id and d.status='approved' and d.device_kind='facility_shared'
     and coalesce(v_token,'') ~ '^[a-fA-F0-9]{64}$' and d.token_hash=encode(digest(v_token,'sha256'),'hex'))
   and exists(select 1 from public.facility_eligible_staff(v_session.organization_id) e where e.user_id=auth.uid() and e.recorder_id=v_session.recorder_id)
   and exists(select 1 from auth.users u where u.id=auth.uid() and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))
   and not exists(select 1 from auth.mfa_factors f where f.user_id=auth.uid() and f.status='verified');
 end if;
 if v_profile.role<>'staff' and exists(select 1 from public.facility_login_credentials where organization_id=v_profile.organization_id and enabled) then
  select email into v_email from auth.users where id=auth.uid();
  return coalesce(v_email,'')<>'' and v_email not like '%@staff-login.invalid'
   and exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a where a->>'method'='password');
 end if;
 return true;
end; $$;
revoke all on function public.facility_session_allowed() from public,anon;
grant execute on function public.facility_session_allowed() to authenticated;

create function public.get_current_facility_login_state()
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('facilityLogin',s.session_id is not null,'allowed',public.facility_session_allowed(),'expiresAt',s.expires_at)
 from (select 1) x left join public.facility_login_sessions s on s.session_id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid();
$$;
revoke all on function public.get_current_facility_login_state() from public,anon;
grant execute on function public.get_current_facility_login_state() to authenticated;

-- Retain the existing shared-login eligibility, adding a DB-level session/device boundary.
create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path=public as $$
 select p.organization_id from public.profiles p join public.organizations o on o.id=p.organization_id
 where p.id=auth.uid() and p.active and public.facility_session_allowed() and
 (p.role<>'staff' or o.shared_staff_login_allowed or exists(select 1 from public.recorder_profiles r
  where r.organization_id=p.organization_id and r.auth_user_id=p.id and r.active and r.individual_login_enabled));
$$;
create or replace function public.current_user_role()
returns text language sql stable security definer set search_path=public as $$
 select role from public.profiles where id=auth.uid() and active and public.facility_session_allowed();
$$;

create function public.get_facility_login_configuration()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id();v_result jsonb;
begin
 if v_org is null or public.current_user_role()<>'admin' then raise exception '管理者のメールログインが必要です。' using errcode='42501'; end if;
 select jsonb_build_object('schemaVersion',1,'organizationCode',o.staff_login_code,'loginId',coalesce(c.login_id,''),
  'enabled',coalesce(c.enabled,false),'configured',c.organization_id is not null,'revision',coalesce(c.revision,0),
  'deviceApprovalEnabled',o.device_approval_enabled,'eligibleCount',(select count(*) from public.facility_eligible_staff(v_org)),
  'privilegedEmailPending',(select count(*) from public.profiles p left join auth.users u on u.id=p.id where p.organization_id=v_org and p.active and p.role<>'staff'
    and (coalesce(u.email,'')='' or u.email like '%@staff-login.invalid'))) into v_result
 from public.organizations o left join public.facility_login_credentials c on c.organization_id=o.id where o.id=v_org;
 return v_result;
end; $$;
create function public.set_facility_login_configuration(p_enabled boolean,p_login_id text,p_password text,p_revision integer)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_org uuid:=public.current_organization_id();v_old public.facility_login_credentials%rowtype;v_config jsonb;v_hash text;
begin
 if v_org is null or public.current_user_role()<>'admin' then raise exception '管理者のメールログインが必要です。' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('facility-login-config:'||v_org::text,0));
 select * into v_old from public.facility_login_credentials where organization_id=v_org for update;
 if p_revision is distinct from coalesce(v_old.revision,0) then raise exception '設定が変更されています。再取得してください。' using errcode='PT409'; end if;
 if p_enabled is null or coalesce(lower(btrim(p_login_id)),'') !~ '^[a-z0-9._-]{3,32}$' then raise exception '施設IDは半角英数字等の3〜32文字で設定してください。' using errcode='22023'; end if;
 if p_password is not null and p_password<>'' then
  if char_length(p_password)<12 or octet_length(p_password)>72 then raise exception '共通パスワードは12文字以上・UTF-8で72バイト以内にしてください。' using errcode='22023'; end if;
  v_hash:=crypt(p_password,gen_salt('bf',10));
 else v_hash:=v_old.password_hash; end if;
 if v_hash is null then raise exception '初回は共通パスワードを設定してください。' using errcode='22023'; end if;
 v_config:=public.get_facility_login_configuration();
 if p_enabled and (not (v_config->>'deviceApprovalEnabled')::boolean or (v_config->>'privilegedEmailPending')::integer>0
  or not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a where a->>'method'='password')) then
  raise exception '端末承認の有効化と、特別権限職員の個人メールログインを先に確認してください。' using errcode='42501';
 end if;
 insert into public.facility_login_credentials(organization_id,login_id,password_hash,enabled,revision,updated_by)
  values(v_org,lower(btrim(p_login_id)),v_hash,p_enabled,coalesce(v_old.revision,0)+1,auth.uid())
 on conflict(organization_id) do update set login_id=excluded.login_id,password_hash=excluded.password_hash,enabled=excluded.enabled,
  revision=excluded.revision,updated_at=now(),updated_by=auth.uid();
 return public.get_facility_login_configuration();
end; $$;
revoke all on function public.get_facility_login_configuration(),public.set_facility_login_configuration(boolean,text,text,integer) from public,anon;
grant execute on function public.get_facility_login_configuration(),public.set_facility_login_configuration(boolean,text,text,integer) to authenticated;

create function public.begin_facility_choice_login(p_code text,p_login text,p_password text,p_device text,p_ticket text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_org uuid;v_device uuid;v_creds public.facility_login_credentials%rowtype;v_ok boolean;v_staff jsonb;v_challenge public.facility_login_challenges%rowtype;
begin
 if coalesce(p_device,'') !~ '^[a-fA-F0-9]{64}$' or coalesce(p_ticket,'') !~ '^[a-fA-F0-9]{64}$' then return jsonb_build_object('errorCode','invalid'); end if;
 select o.id,d.id into v_org,v_device from public.organizations o join public.organization_devices d on d.organization_id=o.id
  where o.staff_login_code=upper(p_code) and o.device_approval_enabled and d.status='approved' and d.device_kind='facility_shared'
   and d.token_hash=encode(digest(p_device,'sha256'),'hex') for share of o,d;
 if v_org is null then return jsonb_build_object('errorCode','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended('facility-login-attempt:'||v_org::text,0));
 if (select count(*) from public.facility_login_attempts where organization_id=v_org and not success and at>now()-interval '15 minutes' and device_id=v_device)>=5
  or (select count(*) from public.facility_login_attempts where organization_id=v_org and not success and at>now()-interval '15 minutes')>=50
  or (select count(*) from public.facility_login_attempts where device_id=v_device and success and at>now()-interval '5 minutes')>=30 then return jsonb_build_object('errorCode','rate'); end if;
 select * into v_creds from public.facility_login_credentials where organization_id=v_org and enabled for share;
 v_ok:=v_creds.organization_id is not null and v_creds.login_id=lower(p_login) and v_creds.password_hash=crypt(p_password,v_creds.password_hash);
 insert into public.facility_login_attempts(organization_id,device_id,success) values(v_org,v_device,coalesce(v_ok,false));
 if not coalesce(v_ok,false) then return jsonb_build_object('errorCode','invalid'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('recorderId',recorder_id,'userId',user_id,'displayName',display_name) order by display_name,recorder_id),'[]'::jsonb) into v_staff from public.facility_eligible_staff(v_org);
 if jsonb_array_length(v_staff)>500 then return jsonb_build_object('errorCode','unavailable'); end if;
 insert into public.facility_login_challenges(token_hash,organization_id,device_id,credential_revision,eligible)
  values(encode(digest(p_ticket,'sha256'),'hex'),v_org,v_device,v_creds.revision,v_staff) returning * into v_challenge;
 return jsonb_build_object('schemaVersion',1,'expiresAt',v_challenge.expires_at,'staff',
  (select coalesce(jsonb_agg(jsonb_build_object('recorderId',r->>'recorderId','displayName',r->>'displayName')),'[]'::jsonb) from jsonb_array_elements(v_staff) r));
end; $$;
create function public.consume_facility_choice_login(p_ticket text,p_device text,p_recorder uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v public.facility_login_challenges%rowtype;v_user uuid;
begin
 select * into v from public.facility_login_challenges where token_hash=encode(digest(p_ticket,'sha256'),'hex') for update;
 if not found or v.consumed_at is not null or v.expires_at<=now() then return jsonb_build_object('errorCode','expired'); end if;
 if not exists(select 1 from public.facility_login_credentials c join public.organization_devices d on d.organization_id=c.organization_id
  join public.organizations o on o.id=c.organization_id where c.organization_id=v.organization_id and c.enabled and c.revision=v.credential_revision
   and o.device_approval_enabled and d.id=v.device_id and d.status='approved' and d.device_kind='facility_shared'
   and d.token_hash=encode(digest(p_device,'sha256'),'hex')) then return jsonb_build_object('errorCode','invalid'); end if;
 select user_id into v_user from public.facility_eligible_staff(v.organization_id) e where recorder_id=p_recorder
  and exists(select 1 from jsonb_array_elements(v.eligible) r where r->>'recorderId'=p_recorder::text and r->>'userId'=e.user_id::text);
 if v_user is null then return jsonb_build_object('errorCode','unavailable'); end if;
 update public.facility_login_challenges set consumed_at=now(),selected_recorder_id=p_recorder,selected_user_id=v_user where id=v.id;
 return jsonb_build_object('challengeId',v.id,'userId',v_user);
end; $$;
create function public.finish_facility_choice_login(p_challenge uuid,p_user uuid,p_session uuid,p_device text)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare v public.facility_login_challenges%rowtype;
begin
 select * into v from public.facility_login_challenges where id=p_challenge for update;
 if not found or v.selected_user_id is distinct from p_user or v.consumed_at is null or v.issued_at is not null or v.expires_at<=now() then return false; end if;
 perform 1 from public.facility_login_credentials c join public.organization_devices d on d.organization_id=c.organization_id
  join public.organizations o on o.id=c.organization_id where c.organization_id=v.organization_id and c.enabled and c.revision=v.credential_revision and o.device_approval_enabled
  and d.id=v.device_id and d.status='approved' and d.device_kind='facility_shared' and d.token_hash=encode(digest(p_device,'sha256'),'hex') for share of c,d,o;
 if not found or not exists(select 1 from public.facility_eligible_staff(v.organization_id) where user_id=p_user and recorder_id=v.selected_recorder_id) then return false; end if;
 insert into public.facility_login_sessions(session_id,challenge_id,organization_id,device_id,user_id,recorder_id,credential_revision)
  values(p_session,v.id,v.organization_id,v.device_id,p_user,v.selected_recorder_id,v.credential_revision);
 update public.facility_login_challenges set issued_at=now() where id=v.id;
 return true;
end; $$;
revoke all on function public.begin_facility_choice_login(text,text,text,text,text),public.consume_facility_choice_login(text,text,uuid),public.finish_facility_choice_login(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.begin_facility_choice_login(text,text,text,text,text),public.consume_facility_choice_login(text,text,uuid),public.finish_facility_choice_login(uuid,uuid,uuid,text) to service_role;

create function public.facility_privileged_email_required(p_user uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p join public.facility_login_credentials c on c.organization_id=p.organization_id
  where p.id=p_user and p.active and p.role<>'staff' and c.enabled);
$$;
revoke all on function public.facility_privileged_email_required(uuid) from public,anon,authenticated;
grant execute on function public.facility_privileged_email_required(uuid) to service_role;
