-- Additive, lazy section editing. Existing text and revision history are not rewritten.
alter table public.morning_meeting_records add column section_document jsonb, add column section_revisions jsonb;

create function public.morning_sections_text(p_doc jsonb) returns text language plpgsql immutable set search_path=public as $$
declare v text:=coalesce(p_doc->>'legacy',''); k text; label text;
begin
 foreach k in array array['plan','attendance','transport','children','staff','safety'] loop
  label:=case k when 'plan' then '本日の予定' when 'attendance' then '欠席・追加利用' when 'transport' then '送迎確認' when 'children' then '児童対応' when 'staff' then '職員連絡' else '安全確認' end;
  if btrim(coalesce(p_doc->>k,''))<>'' then v:=v||case when v<>'' then E'\n\n' else '' end||'【'||label||'】'||E'\n'||(p_doc->>k); end if;
 end loop;
 return v;
end; $$;
revoke all on function public.morning_sections_text(jsonb) from public,anon,authenticated;

create function public.guard_morning_sections() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='UPDATE' and old.section_document is not null and new.content is distinct from old.content
  and current_setting('app.morning_section_write',true) is distinct from 'allowed' then
  raise exception 'MORNING_MEETING_STRUCTURED_REQUIRED: 最新の朝礼画面で項目ごとに編集してください。入力は保持してください。' using errcode='40001';
 end if;
 if (tg_op='INSERT' and new.section_document is not null) or (tg_op='UPDATE' and (new.section_document is distinct from old.section_document or new.section_revisions is distinct from old.section_revisions)) then
  if current_setting('app.morning_section_write',true) is distinct from 'allowed' then raise exception 'MORNING_SECTION_RPC_REQUIRED' using errcode='42501'; end if;
 end if;
 return new;
end; $$;
revoke all on function public.guard_morning_sections() from public,anon,authenticated;
create trigger ab_morning_section_guard before insert or update on public.morning_meeting_records for each row execute function public.guard_morning_sections();

create function public.load_morning_meeting_sections(p_date date) returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_organization_id(); row public.morning_meeting_records%rowtype;
begin
 if auth.uid() is null or org is null or public.current_request_device_kind() not in ('facility_shared','unmanaged') then raise exception 'MORNING_ACCESS_REQUIRED' using errcode='42501'; end if;
 select * into row from public.morning_meeting_records where organization_id=org and meeting_date=p_date and deleted_at is null;
 return case when row.organization_id is null then null else to_jsonb(row)-'organization_id'-'updated_by'-'deleted_by' end;
end; $$;

create function public.save_morning_meeting_section(p_date date,p_key text,p_text text,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_organization_id(); row public.morning_meeting_records%rowtype; doc jsonb; revs jsonb; expected bigint; body text; actor text; recorder uuid;
begin
 if auth.uid() is null or org is null or public.current_request_device_kind() not in ('facility_shared','unmanaged') then raise exception 'MORNING_ACCESS_REQUIRED' using errcode='42501'; end if;
 if p_date is null or p_key is null or p_key not in ('legacy','plan','attendance','transport','children','staff','safety') or p_text is null or length(p_text)>20000 or p_expected_revision is null or p_expected_revision<0 then raise exception 'MORNING_SECTION_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('morning-section:'||org::text||':'||p_date::text,0));
 select * into row from public.morning_meeting_records where organization_id=org and meeting_date=p_date for update;
 if row.deleted_at is not null then raise exception 'MORNING_DELETED' using errcode='40001'; end if;
 doc:=coalesce(row.section_document,jsonb_build_object('legacy',coalesce(row.content,''),'plan','','attendance','','transport','','children','','staff','','safety',''));
 revs:=coalesce(row.section_revisions,jsonb_build_object('legacy',coalesce(row.revision,0),'plan',0,'attendance',0,'transport',0,'children',0,'staff',0,'safety',0));
 expected:=(revs->>p_key)::bigint;
 if p_expected_revision<>expected and (doc->>p_key) is distinct from p_text then
  return jsonb_build_object('conflict',true,'record',to_jsonb(row)-'organization_id'-'updated_by'-'deleted_by');
 end if;
 if row.organization_id is not null and (doc->>p_key)=p_text then return jsonb_build_object('conflict',false,'record',to_jsonb(row)-'organization_id'-'updated_by'-'deleted_by'); end if;
 doc:=jsonb_set(doc,array[p_key],to_jsonb(p_text));revs:=jsonb_set(revs,array[p_key],to_jsonb(expected+1));body:=public.morning_sections_text(doc);
 if length(body)>20000 then raise exception 'MORNING_MEETING_CONTENT_TOO_LONG' using errcode='22001'; end if;
 select display_name into actor from public.profiles where id=auth.uid() and active;recorder:=public.current_recorder_profile_id();
 perform set_config('app.morning_section_write','allowed',true);
 insert into public.morning_meeting_records(organization_id,meeting_date,content,section_document,section_revisions,updated_by_recorder_profile_id,updated_by_name)
 values(org,p_date,body,doc,revs,recorder,actor)
 on conflict(organization_id,meeting_date) do update set content=excluded.content,section_document=excluded.section_document,section_revisions=excluded.section_revisions,updated_by_recorder_profile_id=recorder,updated_by_name=actor
 returning * into row;
 perform set_config('app.morning_section_write','',true);
 return jsonb_build_object('conflict',false,'record',to_jsonb(row)-'organization_id'-'updated_by'-'deleted_by');
end; $$;
revoke all on function public.load_morning_meeting_sections(date),public.save_morning_meeting_section(date,text,text,bigint) from public,anon;
grant execute on function public.load_morning_meeting_sections(date),public.save_morning_meeting_section(date,text,text,bigint) to authenticated;
notify pgrst,'reload schema';
