create or replace function public.get_lesson_learning_context()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id();
begin
  if v_org is null or not public.can_read_lesson_learning(v_org) then
    raise exception 'この端末またはアカウントでは学習管理を利用できません。' using errcode='42501';
  end if;
  return jsonb_build_object('organizationId',v_org,'actorId',auth.uid(),
    'actorName',(select display_name from public.profiles where id=auth.uid() and active),
    'canManageLinks',public.current_user_has_permission('manage_learning_links'),
    'canReviewWord',public.current_user_has_permission('review_learning_work'));
end; $$;
revoke all on function public.get_lesson_learning_context() from public,anon;
grant execute on function public.get_lesson_learning_context() to authenticated;
