-- Same organization/session restriction, evaluated once per statement instead
-- of repeatedly for record rows. No record, draft or approval data is modified.
do $$
declare existing_policy text;
begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='current_organization_id' and p.pronargs=0 and p.provolatile='s') then
  raise exception 'Stable organization access helper is required';
 end if;
 select qual into existing_policy from pg_policies
  where schemaname='public' and tablename='support_records' and policyname='records_select'
   and cmd='SELECT' and roles=array['public']::name[] and permissive='PERMISSIVE';
 if existing_policy is null or regexp_replace(existing_policy,'[[:space:]()]','','g')
  not in ('organization_id=current_organization_id','organization_id=SELECTcurrent_organization_idAScurrent_organization_id') then
  raise exception 'Record read policy differs from expected scope; do not overwrite it';
 end if;
end $$;
alter policy records_select on public.support_records
 using(organization_id=(select public.current_organization_id()));
