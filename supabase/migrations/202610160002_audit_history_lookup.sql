-- Preserve every audit record and the existing manager/admin, organization and
-- facility-session checks. Evaluate stable access helpers once per statement.
create index if not exists audit_logs_organization_recent_idx
 on public.audit_logs(organization_id,occurred_at desc,id desc);
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
 using (
  organization_id=(select public.current_organization_id())
  and (select public.current_user_role()) in ('manager','admin')
 );
