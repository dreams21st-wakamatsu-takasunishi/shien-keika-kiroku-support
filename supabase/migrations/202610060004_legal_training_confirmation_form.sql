-- Organization-wide external form link. Never retrieve the URL or include it in generic audits.
create table public.legal_training_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 id uuid not null unique default gen_random_uuid(),
 confirmation_form_url text check(confirmation_form_url is null or (
  length(confirmation_form_url)<=2048
  and confirmation_form_url ~ '^https://[^/@[:space:]]+(?:[/?#]|$)'
  and confirmation_form_url !~ '[[:space:][:cntrl:]]')),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now()
);
alter table public.legal_training_settings enable row level security;
create policy training_settings_read on public.legal_training_settings for select to authenticated
 using(organization_id=public.current_organization_id());
revoke all on public.legal_training_settings from public,anon,authenticated;
grant select on public.legal_training_settings to authenticated;
create trigger training_settings_audit after insert or update on public.legal_training_settings
 for each row execute function public.audit_legal_training();

create function public.set_legal_training_confirmation_form(p_organization_id uuid,p_url text,p_expected_revision integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_row public.legal_training_settings;v_url text:=nullif(btrim(p_url),'');begin
 perform public.assert_legal_training_access(p_organization_id,true);
 if p_expected_revision is null or p_expected_revision<0 then
  raise exception 'Invalid training settings revision' using errcode='22023';
 end if;
 -- Serialize even the first insert and reject an outdated blank-settings snapshot.
 perform 1 from public.organizations where id=p_organization_id for update;
 select * into v_row from public.legal_training_settings where organization_id=p_organization_id for update;
 if found then
  if v_row.revision<>p_expected_revision then raise exception 'Training revision conflict' using errcode='40001';end if;
  if v_row.confirmation_form_url is not distinct from v_url then return;end if;
  update public.legal_training_settings set confirmation_form_url=v_url,revision=revision+1,updated_at=now()
   where organization_id=p_organization_id;
 else
  if p_expected_revision<>0 then raise exception 'Training revision conflict' using errcode='40001';end if;
  insert into public.legal_training_settings(organization_id,confirmation_form_url) values(p_organization_id,v_url);
 end if;
end; $$;
revoke all on function public.set_legal_training_confirmation_form(uuid,text,integer) from public,anon;
grant execute on function public.set_legal_training_confirmation_form(uuid,text,integer) to authenticated;
notify pgrst,'reload schema';
