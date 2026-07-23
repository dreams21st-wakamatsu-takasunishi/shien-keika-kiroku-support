-- Convert every existing fatigue field to the standard five-level scale.
-- Historical record snapshots remain unchanged; new records use the updated templates.

update public.record_templates as template
set sections = (
  select jsonb_agg(
    case
      when jsonb_typeof(section_item -> 'fields') = 'array' then
        jsonb_set(
          section_item,
          '{fields}',
          coalesce(
            (
              select jsonb_agg(
                case
                  when field_item ->> 'id' = 'fatigue'
                    or coalesce(field_item ->> 'label', '') like '%疲労感%'
                  then field_item || jsonb_build_object(
                    'type', 'radio',
                    'options', jsonb_build_array(
                      '1：なし',
                      '2：少ない',
                      '3：中程度',
                      '4：強い',
                      '5：非常に強い'
                    ),
                    'defaultValue', '1：なし',
                    'helpText', '疲労感を1（なし）から5（非常に強い）の5段階で選択してください。'
                  )
                  else field_item
                end
                order by field_order
              )
              from jsonb_array_elements(section_item -> 'fields')
                with ordinality as fields(field_item, field_order)
            ),
            '[]'::jsonb
          )
        )
      else section_item
    end
    order by section_order
  )
  from jsonb_array_elements(template.sections)
    with ordinality as sections(section_item, section_order)
)
where jsonb_typeof(template.sections) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(template.sections) as sections(section_item)
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(section_item -> 'fields') = 'array'
        then section_item -> 'fields'
        else '[]'::jsonb
      end
    ) as fields(field_item)
    where field_item ->> 'id' = 'fatigue'
      or coalesce(field_item ->> 'label', '') like '%疲労感%'
  );
