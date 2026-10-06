-- Private catalog and per-login progress. No external URL retrieval or AI processing.
create table public.legal_training_categories (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 title text not null check (length(btrim(title)) between 1 and 120 and title !~ '[[:cntrl:]]'),
 active boolean not null default true, revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(), unique(id,organization_id)
);
create unique index legal_training_category_name on public.legal_training_categories(organization_id,lower(btrim(title))) where active;
create table public.legal_training_videos (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 category_id uuid not null, title text not null check(length(btrim(title)) between 1 and 180 and title !~ '[[:cntrl:]]'),
 video_url text not null check(length(video_url)<=2048 and video_url ~ '^https://[^/@[:space:]]+(?:[/?#]|$)' and video_url !~ '[[:space:][:cntrl:]]'),
 material_url text check(material_url is null or (length(material_url)<=2048 and material_url ~ '^https://[^/@[:space:]]+(?:[/?#]|$)' and material_url !~ '[[:space:][:cntrl:]]')),
 active boolean not null default true, revision integer not null default 1 check(revision>0), created_at timestamptz not null default now(),
 foreign key(category_id,organization_id) references public.legal_training_categories(id,organization_id), unique(id,organization_id)
);
create unique index legal_training_video_name on public.legal_training_videos(category_id,lower(btrim(title))) where active;
create table public.legal_training_progress (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 video_id uuid not null, user_id uuid not null references public.profiles(id) on delete cascade,
 completed_at timestamptz, revision integer not null default 1 check(revision>0), updated_at timestamptz not null default now(),
 primary key(video_id,user_id), foreign key(video_id,organization_id) references public.legal_training_videos(id,organization_id)
);
alter table public.legal_training_categories enable row level security;
alter table public.legal_training_videos enable row level security;
alter table public.legal_training_progress enable row level security;
create policy training_category_read on public.legal_training_categories for select to authenticated using(organization_id=public.current_organization_id());
create policy training_video_read on public.legal_training_videos for select to authenticated using(organization_id=public.current_organization_id());
create policy training_progress_self on public.legal_training_progress for select to authenticated using(organization_id=public.current_organization_id() and user_id=auth.uid());
revoke all on public.legal_training_categories,public.legal_training_videos,public.legal_training_progress from public,anon,authenticated;
grant select on public.legal_training_categories,public.legal_training_videos,public.legal_training_progress to authenticated;

create function public.assert_legal_training_access(p_organization_id uuid,p_manage boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or p_organization_id is null or p_organization_id is distinct from public.current_organization_id()
  or (p_manage and coalesce(public.current_user_role(),'') not in ('admin','manager')) then
  raise exception 'Training access denied' using errcode='42501';
 end if;
end; $$;
revoke all on function public.assert_legal_training_access(uuid,boolean) from public,anon,authenticated;

-- Redacted audit: titles and subscription URLs must not enter generic audit payloads.
create function public.audit_legal_training() returns trigger language plpgsql security definer set search_path=public as $$
declare v_new jsonb:=to_jsonb(new);v_old jsonb;begin
 if tg_op='UPDATE' then v_old:=jsonb_build_object('revision',to_jsonb(old)->'revision','active',to_jsonb(old)->'active','completed_at',to_jsonb(old)->'completed_at');end if;
 insert into public.audit_logs(organization_id,actor_id,table_name,row_id,action,old_data,new_data)
 values(new.organization_id,auth.uid(),tg_table_name,coalesce(v_new->>'id',(v_new->>'video_id')||':'||(v_new->>'user_id')),tg_op,v_old,
  jsonb_build_object('revision',v_new->'revision','active',v_new->'active','completed_at',v_new->'completed_at'));
 return new;
end; $$;
revoke all on function public.audit_legal_training() from public,anon,authenticated;
create trigger training_category_audit after insert or update on public.legal_training_categories for each row execute function public.audit_legal_training();
create trigger training_video_audit after insert or update on public.legal_training_videos for each row execute function public.audit_legal_training();
create trigger training_progress_audit after insert or update on public.legal_training_progress for each row execute function public.audit_legal_training();

create function public.add_legal_training_category(p_organization_id uuid,p_title text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;begin
 perform public.assert_legal_training_access(p_organization_id,true);
 insert into public.legal_training_categories(organization_id,title) values(p_organization_id,btrim(p_title)) returning id into v_id;return v_id;
end; $$;
create function public.add_legal_training_video(p_organization_id uuid,p_category_id uuid,p_title text,p_video_url text,p_material_url text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;begin
 perform public.assert_legal_training_access(p_organization_id,true);
 perform 1 from public.legal_training_categories where id=p_category_id and organization_id=p_organization_id and active for share;
 if not found then raise exception 'Active category required' using errcode='22023';end if;
 insert into public.legal_training_videos(organization_id,category_id,title,video_url,material_url)
 values(p_organization_id,p_category_id,btrim(p_title),btrim(p_video_url),nullif(btrim(p_material_url),'')) returning id into v_id;return v_id;
end; $$;
create function public.archive_legal_training_item(p_organization_id uuid,p_kind text,p_id uuid,p_expected_revision integer) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform public.assert_legal_training_access(p_organization_id,true);
 if p_kind='category' then update public.legal_training_categories set active=false,revision=revision+1 where organization_id=p_organization_id and id=p_id and active and revision=p_expected_revision;
 elsif p_kind='video' then update public.legal_training_videos set active=false,revision=revision+1 where organization_id=p_organization_id and id=p_id and active and revision=p_expected_revision;
 else raise exception 'Invalid training item' using errcode='22023';end if;
 if not found then raise exception 'Training revision conflict' using errcode='40001';end if;
end; $$;
create function public.set_legal_training_completion(p_organization_id uuid,p_video_id uuid,p_completed boolean,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_row public.legal_training_progress;begin
 perform public.assert_legal_training_access(p_organization_id,false);
 if p_completed is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid progress' using errcode='22023';end if;
 perform 1 from public.legal_training_videos v join public.legal_training_categories c on c.id=v.category_id and c.organization_id=v.organization_id
 where v.id=p_video_id and v.organization_id=p_organization_id and v.active and c.active for share of v,c;
 if not found then raise exception 'Active video required' using errcode='22023';end if;
 select * into v_row from public.legal_training_progress where organization_id=p_organization_id and video_id=p_video_id and user_id=auth.uid() for update;
 if found then
  if v_row.revision<>p_expected_revision then raise exception 'Training revision conflict' using errcode='40001';end if;
  if (v_row.completed_at is not null)=p_completed then return to_jsonb(v_row);end if;
  update public.legal_training_progress set completed_at=case when p_completed then now() else null end,revision=revision+1,updated_at=now()
   where video_id=p_video_id and user_id=auth.uid() returning * into v_row;
 else
  if p_expected_revision<>0 then raise exception 'Training revision conflict' using errcode='40001';end if;
  insert into public.legal_training_progress(organization_id,video_id,user_id,completed_at)
   values(p_organization_id,p_video_id,auth.uid(),case when p_completed then now() else null end) returning * into v_row;
 end if;return to_jsonb(v_row);
exception when unique_violation then raise exception 'Training revision conflict' using errcode='40001';
end; $$;
revoke all on function public.add_legal_training_category(uuid,text),public.add_legal_training_video(uuid,uuid,text,text,text),public.archive_legal_training_item(uuid,text,uuid,integer),public.set_legal_training_completion(uuid,uuid,boolean,integer) from public,anon;
grant execute on function public.add_legal_training_category(uuid,text),public.add_legal_training_video(uuid,uuid,text,text,text),public.archive_legal_training_item(uuid,text,uuid,integer),public.set_legal_training_completion(uuid,uuid,boolean,integer) to authenticated;

-- Add just one menu identifier, preserving the current validation and access rules.
create or replace function public.set_recorder_menu_preferences(p_organization_id uuid,p_recorder_profile_id uuid,p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_allowed constant text[]:=array['home','dailyChanges','todayWork','attendance','calendar','monthlySchedule','trafficCost','activityPlans','facilityWork','legalTraining','operations','communication','assistant','form','records','meetings','learning','children','templates','team'];
 v_order jsonb;v_hidden jsonb;v_preferences jsonb;
begin
 if p_organization_id is distinct from public.current_organization_id() then raise exception 'Recorder menu settings require organization access.' using errcode='42501';end if;
 if jsonb_typeof(coalesce(p_preferences,'{}'::jsonb))<>'object' then raise exception 'Menu preferences must be an object.' using errcode='22023';end if;
 v_order:=coalesce(p_preferences->'order','[]'::jsonb);v_hidden:=coalesce(p_preferences->'hidden','[]'::jsonb);
 if jsonb_typeof(v_order)<>'array' or jsonb_typeof(v_hidden)<>'array' then raise exception 'Menu order and hidden values must be arrays.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements_text(v_order) v(value) where not(v.value=any(v_allowed))) or exists(select 1 from jsonb_array_elements_text(v_hidden) v(value) where not(v.value=any(v_allowed))) then raise exception 'Menu preferences contain an unknown item.' using errcode='22023';end if;
 select jsonb_build_object('order',coalesce((select jsonb_agg(value order by first_position) from(select value,min(position) first_position from jsonb_array_elements_text(v_order) with ordinality as ordered(value,position) group by value)x),'[]'::jsonb),'hidden',coalesce((select jsonb_agg(value order by first_position) from(select value,min(position) first_position from jsonb_array_elements_text(v_hidden) with ordinality as hidden(value,position) where value<>'home' group by value)x),'[]'::jsonb)) into v_preferences;
 update public.recorder_profiles set menu_preferences=v_preferences where organization_id=p_organization_id and id=p_recorder_profile_id and active;
 if not found then raise exception 'Active recorder profile was not found.' using errcode='P0002';end if;return v_preferences;
end; $$;
revoke all on function public.set_recorder_menu_preferences(uuid,uuid,jsonb) from public,anon;
grant execute on function public.set_recorder_menu_preferences(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
