-- A user-authorized migration must not impersonate a staff member in the audit.
alter table public.lesson_child_links alter column verified_by drop not null;
alter table public.lesson_child_links add column verification_source text not null default 'staff' check(verification_source in('staff','authorized_migration'));
alter table public.lesson_child_links add constraint lesson_link_verification_actor check(
  (verification_source='staff' and verified_by is not null) or (verification_source='authorized_migration' and verified_by is null));
alter table public.lesson_link_audit alter column actor_id drop not null;
alter table public.lesson_link_audit add column actor_source text not null default 'staff' check(actor_source in('staff','authorized_migration'));
alter table public.lesson_link_audit add constraint lesson_link_audit_actor check(
  (actor_source='staff' and actor_id is not null) or (actor_source='authorized_migration' and actor_id is null));

create or replace function public.migrate_authorized_lesson_link(
  p_org uuid,p_child text,p_expected_name text,p_expected_birth date,p_source_project text,p_source_table text,
  p_source_student text,p_source_campus text,p_source_name text,p_match_rule text default 'Unique name and exact birth date'
) returns public.lesson_child_links language plpgsql security definer set search_path=public as $$
declare v_child public.children%rowtype;v_link public.lesson_child_links%rowtype;
begin
  if p_match_rule not in('Unique name and exact birth date','User-specified workbook: unique kana/name and classroom number; student Auth verified') then
    raise exception '本人照合の方法を確認してください。' using errcode='22023';
  end if;
  select * into v_child from public.children where organization_id=p_org and id=p_child and deleted_at is null for update;
  if not found or v_child.name is distinct from p_expected_name or v_child.birth_date is distinct from p_expected_birth
    or p_expected_birth is null or coalesce(v_child.service_suspended,false) then
    raise exception '名簿が変更されています。本人照合をやり直してください。' using errcode='PT409';
  end if;
  select * into v_link from public.lesson_child_links where organization_id=p_org and child_id=p_child and active for update;
  if found then
    if v_link.source_project_ref=p_source_project and v_link.source_table=p_source_table and v_link.source_student_id=p_source_student and v_link.source_campus_id=p_source_campus then return v_link; end if;
    raise exception '児童は別の学習アカウントと連携済みです。' using errcode='23505';
  end if;
  insert into public.lesson_child_links(organization_id,child_id,source_project_ref,source_table,source_student_id,source_campus_id,source_display_name,verified_by,verification_source)
    values(p_org,p_child,p_source_project,p_source_table,p_source_student,p_source_campus,p_source_name,null,'authorized_migration') returning * into v_link;
  insert into public.lesson_link_audit(organization_id,link_id,actor_id,actor_source,action,snapshot)
    values(p_org,v_link.id,null,'authorized_migration','linked',to_jsonb(v_link)||jsonb_build_object('authorization','User approved organization/campus integration and confirmed explanation/consent on 2026-09-30','matchRule',p_match_rule));
  return v_link;
end; $$;
revoke all on function public.migrate_authorized_lesson_link(uuid,text,text,date,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.migrate_authorized_lesson_link(uuid,text,text,date,text,text,text,text,text,text) to service_role;
