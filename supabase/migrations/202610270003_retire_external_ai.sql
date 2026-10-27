-- Retire external AI. Preserve all support/meeting records, histories and legacy
-- AI data; do not delete or rewrite business content.
create or replace function public.get_external_ai_policy() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin raise exception 'EXTERNAL_AI_RETIRED: 外部AI機能は廃止されました。' using errcode='0A000'; end $$;
create or replace function public.set_external_ai_policy(p_enabled boolean,p_expected_revision bigint,p_contract_confirmed boolean,p_informing_confirmed boolean,p_handling_confirmed boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
begin raise exception 'EXTERNAL_AI_RETIRED: 外部AI機能は廃止されました。' using errcode='0A000'; end $$;
revoke all on function public.get_external_ai_policy(), public.set_external_ai_policy(boolean,bigint,boolean,boolean,boolean) from public,anon,authenticated,service_role;

with stopped as (
 update public.external_ai_policies set enabled=false,revision=revision+1 where enabled
 returning organization_id,revision
)
insert into public.audit_logs(organization_id,actor_id,table_name,row_id,action,old_data,new_data)
select organization_id,null,'external_ai_policies',organization_id::text,'UPDATE',jsonb_build_object('enabled',true),jsonb_build_object('enabled',false,'revision',revision,'reason','external_ai_retired') from stopped;
revoke all on public.external_ai_policies from public,anon,authenticated,service_role;
revoke insert,update,delete,truncate,references,trigger on public.organization_ai_settings,public.ai_generation_logs,public.assistant_actions from public,anon,authenticated,service_role;
drop trigger if exists create_default_ai_settings_after_organization on public.organizations;
drop function if exists public.create_default_organization_ai_settings();

-- Historical export events remain readable under their existing RLS, but no
-- additional Tiro handoff events can be written by the application.
revoke insert,update,delete,truncate,references,trigger on public.meeting_export_events from public,anon,authenticated,service_role;
