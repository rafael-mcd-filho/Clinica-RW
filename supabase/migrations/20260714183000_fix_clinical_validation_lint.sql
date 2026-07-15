-- Match volatility declarations to PostgreSQL's date/time casts and remove an
-- unused PL/pgSQL variable reported by the linked database linter.

alter function app_private.is_iso_date(text) stable;
alter function app_private.is_iso_time(text) stable;

create or replace function app_private.validate_clinical_structured_data(
  p_schema jsonb,
  p_data jsonb
)
returns void
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_section jsonb;
  v_field jsonb;
  v_array_item jsonb;
  v_field_id text;
  v_label text;
  v_field_type text;
  v_text text;
  v_value jsonb;
  v_value_type text;
  v_number numeric;
  v_missing boolean;
  v_option_matches boolean;
begin
  if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid clinical payload.' using errcode = '22023';
  end if;

  for v_section in
    select section_item.value
    from jsonb_array_elements(
      coalesce(p_schema -> 'sections', '[]'::jsonb)
    ) as section_item(value)
  loop
    for v_field in
      select field_item.value
      from jsonb_array_elements(
        coalesce(v_section -> 'fields', '[]'::jsonb)
      ) as field_item(value)
    loop
      v_field_id := v_field ->> 'id';
      v_label := coalesce(nullif(trim(v_field ->> 'label'), ''), v_field_id);
      v_value := p_data -> v_field_id;
      v_value_type := jsonb_typeof(v_value);
      v_missing := not (p_data ? v_field_id)
        or v_value_type is null
        or v_value_type = 'null'
        or (v_value_type = 'string' and nullif(trim(v_value #>> '{}'), '') is null)
        or (v_value_type = 'array' and jsonb_array_length(v_value) = 0);

      if coalesce((v_field ->> 'required')::boolean, false) and v_missing then
        raise exception 'Required clinical fields are missing.'
          using errcode = '23514';
      end if;
      if v_missing then
        continue;
      end if;

      -- Legacy versions had no schemaVersion and only need the corrected
      -- required-value semantics. Typed validation applies to v2 snapshots.
      if p_schema -> 'schemaVersion' is distinct from '2'::jsonb then
        continue;
      end if;

      v_field_type := v_field ->> 'type';
      if v_field_type in ('text', 'textarea') then
        if v_value_type <> 'string' then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        v_text := v_value #>> '{}';
        if v_field ? 'minLength'
          and char_length(v_text) < (v_field ->> 'minLength')::integer then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        if v_field ? 'maxLength'
          and char_length(v_text) > (v_field ->> 'maxLength')::integer then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
      elsif v_field_type = 'number' then
        if v_value_type <> 'number' then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        v_number := (v_value #>> '{}')::numeric;
        if v_field ? 'min' and v_number < (v_field ->> 'min')::numeric then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        if v_field ? 'max' and v_number > (v_field ->> 'max')::numeric then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        if v_field ? 'step' and mod(
          v_number - coalesce((v_field ->> 'min')::numeric, 0),
          (v_field ->> 'step')::numeric
        ) <> 0 then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
      elsif v_field_type = 'date' then
        if v_value_type <> 'string'
          or not app_private.is_iso_date(v_value #>> '{}') then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
      elsif v_field_type = 'time' then
        if v_value_type <> 'string'
          or not app_private.is_iso_time(v_value #>> '{}') then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
      elsif v_field_type = 'boolean' then
        if v_value_type <> 'boolean' then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
      elsif v_field_type = 'select' then
        if v_value_type <> 'string' then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        v_text := v_value #>> '{}';
        select exists (
          select 1
          from jsonb_array_elements(v_field -> 'options') as option_item(value)
          where case jsonb_typeof(option_item.value)
            when 'string' then option_item.value #>> '{}'
            when 'object' then coalesce(
              option_item.value ->> 'id',
              option_item.value ->> 'value'
            )
            else null
          end = v_text
        ) into v_option_matches;
        if not v_option_matches then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
      elsif v_field_type = 'multiselect' then
        if v_value_type <> 'array' then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        for v_array_item in
          select array_item.value
          from jsonb_array_elements(v_value) as array_item(value)
        loop
          if jsonb_typeof(v_array_item) <> 'string' then
            raise exception 'Invalid clinical field value: %.', v_label
              using errcode = '23514';
          end if;
          v_text := v_array_item #>> '{}';
          select exists (
            select 1
            from jsonb_array_elements(v_field -> 'options') as option_item(value)
            where case jsonb_typeof(option_item.value)
              when 'string' then option_item.value #>> '{}'
              when 'object' then coalesce(
                option_item.value ->> 'id',
                option_item.value ->> 'value'
              )
              else null
            end = v_text
          ) into v_option_matches;
          if not v_option_matches then
            raise exception 'Invalid clinical field value: %.', v_label
              using errcode = '23514';
          end if;
        end loop;
      else
        raise exception 'Invalid clinical field value: %.', v_label
          using errcode = '23514';
      end if;
    end loop;
  end loop;
end;
$$;

-- CREATE OR REPLACE retains the existing ACL; reassert the intended private
-- helper boundary explicitly for future-proofing.
revoke all on function app_private.validate_clinical_structured_data(
  jsonb,
  jsonb
) from public;

