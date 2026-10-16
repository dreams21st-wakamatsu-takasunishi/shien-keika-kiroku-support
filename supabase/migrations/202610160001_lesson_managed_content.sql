create or replace function public.get_lesson_content_context()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v jsonb:=public.get_lesson_learning_context();
begin
 return v||jsonb_build_object('canManageContent',public.current_user_has_permission('manage_learning_content'));
end; $$;
revoke all on function public.get_lesson_content_context() from public,anon;
grant execute on function public.get_lesson_content_context() to authenticated;
