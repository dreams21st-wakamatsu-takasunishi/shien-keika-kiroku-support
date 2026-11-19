-- Only remove stops for a recorded absence, and only before departure.
-- Row locks prevent an already-started run from being rewritten by a stale page.
create or replace function public.sync_absence_transport(p_date date, p_child_id text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  org uuid := public.current_organization_id();
  run public.transport_runs%rowtype;
  kept jsonb;
  noneditable integer := 0;
begin
  if org is null or not coalesce(public.current_user_has_permission('manage_transport'),false) then
    raise exception '送迎を変更する権限がありません。' using errcode='42501';
  end if;
  perform 1 from public.daily_child_plans where organization_id=org and service_date=p_date
    and child_id=p_child_id and attendance_plan='欠席' for share;
  if not found then raise exception '欠席の登録状態を再確認してください。' using errcode='40001'; end if;
  for run in select * from public.transport_runs where organization_id=org and service_date=p_date
    and stops @> jsonb_build_array(jsonb_build_object('childId',p_child_id)) order by id for update
  loop
    if run.status <> '未出発' then noneditable := noneditable+1; continue; end if;
    select coalesce(jsonb_agg(jsonb_set(value,'{order}',to_jsonb(position)) order by position),'[]'::jsonb) into kept
    from (select value,row_number() over(order by original_order) position
      from jsonb_array_elements(run.stops) with ordinality s(value,original_order)
      where (value->>'childId') is distinct from p_child_id) remaining;
    if jsonb_array_length(kept)=0 then
      delete from public.transport_runs where organization_id=org and id=run.id and status='未出発';
    else
      update public.transport_runs set stops=kept, updated_at=now()
        where organization_id=org and id=run.id and status='未出発';
    end if;
    if not found then raise exception '送迎便が更新されました。再取得してください。' using errcode='40001'; end if;
  end loop;
  return jsonb_build_object('noneditable',noneditable);
end $$;
revoke all on function public.sync_absence_transport(date,text) from public,anon;
grant execute on function public.sync_absence_transport(date,text) to authenticated;
notify pgrst,'reload schema';
