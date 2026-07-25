-- Managers need organization-wide draft visibility for an accurate operations
-- dashboard, while only the originating login may resume and write a draft.

drop policy if exists record_drafts_select on public.record_drafts;
create policy record_drafts_select on public.record_drafts for select
  using (
    organization_id = public.current_organization_id()
    and (
      user_id = auth.uid()
      or public.current_user_role() in ('manager', 'admin')
    )
  );

drop policy if exists record_drafts_delete on public.record_drafts;
create policy record_drafts_delete on public.record_drafts for delete
  using (
    organization_id = public.current_organization_id()
    and (
      user_id = auth.uid()
      or public.current_user_role() in ('manager', 'admin')
    )
  );
