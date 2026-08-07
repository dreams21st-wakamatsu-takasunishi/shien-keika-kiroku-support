-- The unified record form is a built-in application template. Existing
-- organizations predate it, so add the persistence row required by the
-- support_records (organization_id, template_id) foreign key.
insert into public.record_templates (
  organization_id,
  id,
  name,
  template_type,
  is_default,
  description,
  sections,
  version,
  effective_from,
  archived_at,
  wizard_questions
)
select
  organization.id,
  'template-unified',
  '支援経過記録（統合）',
  'カスタム',
  true,
  'その日に行った内容だけを選んで記録する統合フォーマット',
  coalesce(
    (
      select jsonb_agg(section_item.value)
      from jsonb_array_elements(coalesce(weekday_template.sections, '[]'::jsonb)) as section_item(value)
      where section_item.value ->> 'id' = 'life'
    ),
    '[]'::jsonb
  ),
  1,
  current_date,
  null,
  coalesce(weekday_template.wizard_questions, '{}'::jsonb)
from public.organizations as organization
left join public.record_templates as weekday_template
  on weekday_template.organization_id = organization.id
 and weekday_template.id = 'template-weekday'
on conflict (organization_id, id) do update
set archived_at = null;
