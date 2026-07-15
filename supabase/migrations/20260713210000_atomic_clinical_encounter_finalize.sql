-- Save the latest clinical content and finalize it as one database operation.
-- PostgreSQL rolls the draft update back if finalization or its validations fail.
create or replace function public.save_and_finalize_clinical_encounter(
  p_encounter_id uuid,
  p_structured_data jsonb,
  p_free_notes text,
  p_diagnoses jsonb default '[]'::jsonb
)
returns timestamptz
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
declare
  v_finalized_at timestamptz;
begin
  perform public.save_clinical_encounter_draft(
    p_encounter_id,
    p_structured_data,
    p_free_notes,
    p_diagnoses
  );

  if exists (
    select 1
    from public.encounter_entries as entry
    cross join lateral jsonb_array_elements(
      coalesce(entry.template_snapshot -> 'schema' -> 'sections', '[]'::jsonb)
    ) as section
    cross join lateral jsonb_array_elements(
      coalesce(section -> 'fields', '[]'::jsonb)
    ) as field
    where entry.encounter_id = p_encounter_id
      and field ->> 'required' = 'true'
      and nullif(trim(coalesce(p_structured_data ->> (field ->> 'id'), '')), '') is null
  ) then
    raise exception 'Required clinical fields are missing.' using errcode = '23514';
  end if;

  v_finalized_at := public.finalize_clinical_encounter(p_encounter_id);
  return v_finalized_at;
end;
$$;

revoke all on function public.save_and_finalize_clinical_encounter(
  uuid, jsonb, text, jsonb
) from public;

grant execute on function public.save_and_finalize_clinical_encounter(
  uuid, jsonb, text, jsonb
) to authenticated, service_role;

comment on function public.save_and_finalize_clinical_encounter(
  uuid, jsonb, text, jsonb
) is 'Atomically persists the encounter draft payload and finalizes the encounter.';
