-- Private staff-authored drafts, not LINE delivery receipts. No external AI calls.
create table public.parent_share_drafts(
 id uuid not null default gen_random_uuid() unique,
 organization_id uuid not null,record_id text not null,user_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(length(body)<=4000),source_version bigint not null,source_updated_at timestamptz not null,
 revision bigint not null default 1,updated_at timestamptz not null default now(),deleted_at timestamptz,
 primary key(organization_id,record_id,user_id),foreign key(organization_id,record_id) references public.support_records(organization_id,id) on delete cascade
);
alter table public.parent_share_drafts enable row level security;
revoke all on public.parent_share_drafts from public,anon,authenticated;
grant all on public.parent_share_drafts to service_role;

create function public.parent_share_access(p_record text) returns uuid language plpgsql stable security definer set search_path=public as $$
declare org uuid:=public.current_organization_id();
begin
 if auth.uid() is null or org is null or public.current_request_device_kind() not in ('facility_shared','unmanaged') then raise exception 'PARENT_SHARE_ACCESS_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.support_records where organization_id=org and id=p_record and deleted_at is null) then raise exception 'PARENT_SHARE_RECORD_UNAVAILABLE' using errcode='42501'; end if;
 return org;
end; $$;
revoke all on function public.parent_share_access(text) from public,anon,authenticated;

create function public.load_parent_share_draft(p_record_id text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare org uuid:=public.parent_share_access(p_record_id); row public.parent_share_drafts%rowtype;
begin
 select * into row from public.parent_share_drafts where organization_id=org and record_id=p_record_id and user_id=auth.uid() and deleted_at is null;
 return case when row.user_id is null then null else to_jsonb(row)-'organization_id'-'user_id' end;
end; $$;

create function public.save_parent_share_draft(p_record_id text,p_body text,p_source_version bigint,p_source_updated_at timestamptz,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare org uuid:=public.parent_share_access(p_record_id); row public.parent_share_drafts%rowtype; current_record public.support_records%rowtype;
begin
 if p_body is null or length(p_body)>4000 or p_expected_revision is null or p_expected_revision<0 then raise exception 'PARENT_SHARE_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('parent-share:'||org::text||':'||auth.uid()::text||':'||p_record_id,0));
 select * into current_record from public.support_records where organization_id=org and id=p_record_id and deleted_at is null for share;
 if current_record.id is null or current_record.version is distinct from p_source_version or current_record.updated_at is distinct from p_source_updated_at then raise exception 'PARENT_SHARE_SOURCE_CHANGED' using errcode='40001'; end if;
 select * into row from public.parent_share_drafts where organization_id=org and record_id=p_record_id and user_id=auth.uid() for update;
 if coalesce(case when row.deleted_at is null then row.revision else 0 end,0)<>p_expected_revision then raise exception 'PARENT_SHARE_DRAFT_CONFLICT' using errcode='40001'; end if;
 insert into public.parent_share_drafts(organization_id,record_id,user_id,body,source_version,source_updated_at,revision)
 values(org,p_record_id,auth.uid(),p_body,p_source_version,p_source_updated_at,coalesce(row.revision,0)+1)
 on conflict(organization_id,record_id,user_id) do update set body=p_body,source_version=p_source_version,source_updated_at=p_source_updated_at,revision=parent_share_drafts.revision+1,updated_at=now(),deleted_at=null
 returning * into row;
 return to_jsonb(row)-'organization_id'-'user_id';
end; $$;

create function public.delete_parent_share_draft(p_record_id text,p_expected_revision bigint) returns void language plpgsql security definer set search_path=public as $$
declare org uuid:=public.parent_share_access(p_record_id);
begin
 update public.parent_share_drafts set deleted_at=now(),updated_at=now(),revision=revision+1 where organization_id=org and record_id=p_record_id and user_id=auth.uid() and deleted_at is null and revision=p_expected_revision;
 if not found then raise exception 'PARENT_SHARE_DRAFT_CONFLICT' using errcode='40001'; end if;
end; $$;
create trigger parent_share_audit after insert or update on public.parent_share_drafts for each row execute function public.write_audit_log();
revoke all on function public.load_parent_share_draft(text),public.save_parent_share_draft(text,text,bigint,timestamptz,bigint),public.delete_parent_share_draft(text,bigint) from public,anon;
grant execute on function public.load_parent_share_draft(text),public.save_parent_share_draft(text,text,bigint,timestamptz,bigint),public.delete_parent_share_draft(text,bigint) to authenticated;
notify pgrst,'reload schema';
