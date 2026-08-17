-- Explicit child-to-child sibling links replace fragile free-text family labels.

alter table public.children
  add column if not exists sibling_ids text[] not null default '{}';

comment on column public.children.sibling_ids is
  'IDs of active children registered as siblings. Maintained symmetrically by set_child_sibling_links.';

-- Preserve existing manually-entered groups as explicit links.
update public.children child
set sibling_ids = coalesce((
  select array_agg(sibling.id order by sibling.id)
  from public.children sibling
  where sibling.organization_id = child.organization_id
    and sibling.deleted_at is null
    and sibling.id <> child.id
    and nullif(trim(child.sibling_group), '') is not null
    and trim(sibling.sibling_group) = trim(child.sibling_group)
), '{}')
where child.deleted_at is null
  and cardinality(child.sibling_ids) = 0
  and nullif(trim(child.sibling_group), '') is not null;

create or replace function public.set_child_sibling_links(
  p_child_id text,
  p_sibling_ids text[] default '{}'
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organization_id uuid := public.current_organization_id();
  v_sibling_ids text[];
  v_group_ids text[];
begin
  if v_organization_id is null then
    raise exception 'Organization is not available.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.children
    where organization_id = v_organization_id
      and id = p_child_id
      and deleted_at is null
  ) then
    raise exception 'Child not found.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(candidate_id order by candidate_id), '{}')
  into v_sibling_ids
  from (
    select distinct requested_id as candidate_id
    from unnest(coalesce(p_sibling_ids, '{}')) requested_id
    join public.children sibling
      on sibling.organization_id = v_organization_id
     and sibling.id = requested_id
     and sibling.deleted_at is null
    where requested_id <> p_child_id
  ) selected;

  v_group_ids := array_prepend(p_child_id, v_sibling_ids);

  -- Children outside the newly selected household must no longer point at any
  -- of its members. Relationships among those outside children are preserved.
  update public.children child
  set sibling_ids = coalesce((
    select array_agg(existing_id order by existing_id)
    from unnest(child.sibling_ids) existing_id
    where not (existing_id = any(v_group_ids))
  ), '{}')
  where child.organization_id = v_organization_id
    and child.deleted_at is null
    and not (child.id = any(v_group_ids))
    and child.sibling_ids && v_group_ids;

  -- Every member receives the same exact household membership, excluding self.
  update public.children child
  set sibling_ids = coalesce((
    select array_agg(group_id order by group_id)
    from unnest(v_group_ids) group_id
    where group_id <> child.id
  ), '{}'),
      sibling_group = null
  where child.organization_id = v_organization_id
    and child.deleted_at is null
    and child.id = any(v_group_ids);
end;
$$;

grant execute on function public.set_child_sibling_links(text, text[]) to authenticated;
