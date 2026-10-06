-- Shared catalog ordering and corrections. Completion history is never rewritten.
alter table public.legal_training_categories add column sort_order integer not null default 0 check(sort_order>=0);
alter table public.legal_training_videos add column sort_order integer not null default 0 check(sort_order>=0);
-- Preserve the previous ID-based display order on the first rollout.
with ordered as (select id,row_number() over(partition by organization_id order by id)::integer as position from public.legal_training_categories)
update public.legal_training_categories c set sort_order=o.position from ordered o where c.id=o.id;
with ordered as (select id,row_number() over(partition by category_id order by id)::integer as position from public.legal_training_videos)
update public.legal_training_videos v set sort_order=o.position from ordered o where v.id=o.id;
create index legal_training_categories_order on public.legal_training_categories(organization_id,sort_order,id);
create index legal_training_videos_order on public.legal_training_videos(organization_id,category_id,sort_order,id);

-- Serialize catalog changes per organization. Adding or hiding an item must also
-- invalidate a stale full-list reorder, not silently overwrite another user's work.
create or replace function public.add_legal_training_category(p_organization_id uuid,p_title text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_position integer;begin
 perform public.assert_legal_training_access(p_organization_id,true);
 perform 1 from public.organizations where id=p_organization_id for update;
 select coalesce(max(sort_order),0)+1 into v_position from public.legal_training_categories where organization_id=p_organization_id and active;
 insert into public.legal_training_categories(organization_id,title,sort_order) values(p_organization_id,btrim(p_title),v_position) returning id into v_id;return v_id;
end; $$;
create or replace function public.add_legal_training_video(p_organization_id uuid,p_category_id uuid,p_title text,p_video_url text,p_material_url text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_position integer;begin
 perform public.assert_legal_training_access(p_organization_id,true);
 perform 1 from public.organizations where id=p_organization_id for update;
 perform 1 from public.legal_training_categories where id=p_category_id and organization_id=p_organization_id and active for share;
 if not found then raise exception 'Active category required' using errcode='22023';end if;
 select coalesce(max(sort_order),0)+1 into v_position from public.legal_training_videos where organization_id=p_organization_id and category_id=p_category_id and active;
 insert into public.legal_training_videos(organization_id,category_id,title,video_url,material_url,sort_order)
 values(p_organization_id,p_category_id,btrim(p_title),btrim(p_video_url),nullif(btrim(p_material_url),''),v_position) returning id into v_id;return v_id;
end; $$;
create or replace function public.archive_legal_training_item(p_organization_id uuid,p_kind text,p_id uuid,p_expected_revision integer) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform public.assert_legal_training_access(p_organization_id,true);
 perform 1 from public.organizations where id=p_organization_id for update;
 if p_kind='category' then update public.legal_training_categories set active=false,revision=revision+1 where organization_id=p_organization_id and id=p_id and active and revision=p_expected_revision;
 elsif p_kind='video' then update public.legal_training_videos set active=false,revision=revision+1 where organization_id=p_organization_id and id=p_id and active and revision=p_expected_revision;
 else raise exception 'Invalid training item' using errcode='22023';end if;
 if not found then raise exception 'Training revision conflict' using errcode='40001';end if;
end; $$;

create function public.reorder_legal_training_items(p_organization_id uuid,p_kind text,p_category_id uuid,p_items jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v_count integer;begin
 perform public.assert_legal_training_access(p_organization_id,true);
 perform 1 from public.organizations where id=p_organization_id for update;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Invalid order' using errcode='22023';end if;
 v_count:=jsonb_array_length(p_items);
 if v_count>5000 or exists(select 1 from jsonb_array_elements(p_items) item where
  jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'id') is distinct from 'string'
  or jsonb_typeof(item->'revision') is distinct from 'number' or item-'id'-'revision'<>'{}'::jsonb) then
  raise exception 'Invalid order' using errcode='22023';end if;
 if exists(select 1 from jsonb_to_recordset(p_items) as e(id uuid,revision integer) where e.id is null or e.revision is null or e.revision<1)
  or (select count(distinct e.id) from jsonb_to_recordset(p_items) as e(id uuid,revision integer))<>v_count then
  raise exception 'Invalid order' using errcode='22023';end if;
 if p_kind='category' and p_category_id is null then
  if (select count(*) from public.legal_training_categories where organization_id=p_organization_id and active)<>v_count
   or exists(select 1 from jsonb_to_recordset(p_items) as e(id uuid,revision integer)
    left join public.legal_training_categories c on c.id=e.id and c.organization_id=p_organization_id and c.active where c.id is null or c.revision<>e.revision) then
   raise exception 'Training revision conflict' using errcode='40001';end if;
  update public.legal_training_categories c set sort_order=e.position::integer,revision=c.revision+1
   from jsonb_array_elements(p_items) with ordinality as e(item,position)
   where c.id=(e.item->>'id')::uuid and c.organization_id=p_organization_id and c.sort_order<>e.position;
 elsif p_kind='video' and p_category_id is not null then
  perform 1 from public.legal_training_categories where id=p_category_id and organization_id=p_organization_id and active;
  if not found then raise exception 'Training revision conflict' using errcode='40001';end if;
  if (select count(*) from public.legal_training_videos where organization_id=p_organization_id and category_id=p_category_id and active)<>v_count
   or exists(select 1 from jsonb_to_recordset(p_items) as e(id uuid,revision integer)
    left join public.legal_training_videos v on v.id=e.id and v.organization_id=p_organization_id and v.category_id=p_category_id and v.active where v.id is null or v.revision<>e.revision) then
   raise exception 'Training revision conflict' using errcode='40001';end if;
  update public.legal_training_videos v set sort_order=e.position::integer,revision=v.revision+1
   from jsonb_array_elements(p_items) with ordinality as e(item,position)
   where v.id=(e.item->>'id')::uuid and v.organization_id=p_organization_id and v.category_id=p_category_id and v.sort_order<>e.position;
 else raise exception 'Invalid order scope' using errcode='22023';end if;
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid order' using errcode='22023';
end; $$;
revoke all on function public.reorder_legal_training_items(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.reorder_legal_training_items(uuid,text,uuid,jsonb) to authenticated;

create function public.update_legal_training_category(p_organization_id uuid,p_id uuid,p_expected_revision integer,p_title text) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform public.assert_legal_training_access(p_organization_id,true);
 perform 1 from public.organizations where id=p_organization_id for update;
 update public.legal_training_categories set title=btrim(p_title),revision=revision+1
  where organization_id=p_organization_id and id=p_id and active and revision=p_expected_revision;
 if not found then raise exception 'Training revision conflict' using errcode='40001';end if;
end; $$;
create function public.update_legal_training_video(p_organization_id uuid,p_id uuid,p_expected_revision integer,p_title text,p_video_url text,p_material_url text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform public.assert_legal_training_access(p_organization_id,true);
 perform 1 from public.organizations where id=p_organization_id for update;
 perform 1 from public.legal_training_videos v join public.legal_training_categories c on c.id=v.category_id and c.organization_id=v.organization_id
  where v.id=p_id and v.organization_id=p_organization_id and v.active and c.active for share of v,c;
 if not found then raise exception 'Training revision conflict' using errcode='40001';end if;
 update public.legal_training_videos set title=btrim(p_title),video_url=btrim(p_video_url),material_url=nullif(btrim(p_material_url),''),revision=revision+1
  where organization_id=p_organization_id and id=p_id and active and revision=p_expected_revision;
 if not found then raise exception 'Training revision conflict' using errcode='40001';end if;
end; $$;
revoke all on function public.update_legal_training_category(uuid,uuid,integer,text),public.update_legal_training_video(uuid,uuid,integer,text,text,text) from public,anon;
grant execute on function public.update_legal_training_category(uuid,uuid,integer,text),public.update_legal_training_video(uuid,uuid,integer,text,text,text) to authenticated;
notify pgrst,'reload schema';
