-- Add the linked homework subject input to the built-in weekday and holiday
-- templates. Existing support record snapshots remain unchanged.

update public.record_templates as template
set sections = (
  select jsonb_agg(
    case
      when section_item ->> 'id' = 'study' then
        jsonb_set(
          section_item || jsonb_build_object('hasSubTitleField', false),
          '{fields}',
          case
            when exists (
              select 1
              from jsonb_array_elements(
                case
                  when jsonb_typeof(section_item -> 'fields') = 'array'
                  then section_item -> 'fields'
                  else '[]'::jsonb
                end
              ) as current_fields(field_item)
              where field_item ->> 'id' = 'homework_content'
                 or field_item ->> 'type' = 'homework_subjects'
            )
            then coalesce(section_item -> 'fields', '[]'::jsonb)
            else jsonb_build_array(
              jsonb_build_object(
                'id', 'homework_content',
                'label', '【宿題内容】',
                'type', 'homework_subjects',
                'options', jsonb_build_array('国語', '算数', '理科', '社会', '英語', '自学', 'その他'),
                'defaultValue', '',
                'hasNote', false,
                'helpText', '教科を複数選択できます。国語・算数・理科・社会・英語では教材を、自学・その他では内容を入力してください。'
              )
            ) || coalesce(section_item -> 'fields', '[]'::jsonb)
          end
        )
      else section_item
    end
    order by section_order
  )
  from jsonb_array_elements(template.sections)
    with ordinality as sections(section_item, section_order)
)
where template.id in ('template-weekday', 'template-holiday')
  and jsonb_typeof(template.sections) = 'array';

-- Give the existing fatigue field its explicit named input format so the
-- template editor and its manual describe the actual five-level behavior.
update public.record_templates as template
set sections = (
  select jsonb_agg(
    case
      when jsonb_typeof(section_item -> 'fields') = 'array' then
        jsonb_set(
          section_item,
          '{fields}',
          (
            select jsonb_agg(
              case
                when field_item ->> 'id' = 'fatigue'
                  or coalesce(field_item ->> 'label', '') like '%疲労感%'
                then field_item || jsonb_build_object('type', 'fatigue_scale')
                else field_item
              end
              order by field_order
            )
            from jsonb_array_elements(section_item -> 'fields')
              with ordinality as fields(field_item, field_order)
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
