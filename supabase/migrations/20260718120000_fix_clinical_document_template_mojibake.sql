-- Repair document templates that were persisted after UTF-8 text was decoded as
-- Latin-1. Some organizations also received a second, correctly encoded copy of
-- the default template; keep that copy and repoint issued documents to it.

create or replace function pg_temp.fix_document_template_mojibake(p_value text)
returns text
language plpgsql
immutable
strict
as $$
declare
  v_value text := p_value;
  v_fixed text;
  v_pass integer;
begin
  for v_pass in 1..2 loop
    exit when v_value !~ '[ÃÂ]';

    begin
      v_fixed := convert_from(convert_to(v_value, 'LATIN1'), 'UTF8');
    exception
      when character_not_in_repertoire or untranslatable_character then
        return v_value;
    end;

    exit when v_fixed = v_value;
    v_value := v_fixed;
  end loop;

  return v_value;
end;
$$;

-- Issued documents and version rows are immutable during normal application
-- use. Temporarily disable only those guards so the data repair and duplicate
-- cleanup can run atomically. The rendered title/body of issued documents is
-- never changed.
alter table public.clinical_documents
  disable trigger prevent_clinical_document_update_delete;

alter table public.clinical_document_template_versions
  disable trigger prevent_clinical_document_template_version_change;

-- Preserve the relationship for documents issued from a corrupted default when
-- an equivalent, correctly encoded template already exists. A version from the
-- duplicate cannot be reassigned to a different template without falsifying its
-- history, so clear only that optional provenance pointer before the duplicate
-- version is removed. The issued document itself remains byte-for-byte intact.
update public.clinical_documents as document
set template_id = canonical.id,
    template_version_id = null
from public.clinical_document_templates as corrupted
join public.clinical_document_templates as canonical
  on canonical.organization_id = corrupted.organization_id
 and canonical.document_type = corrupted.document_type
 and canonical.name = pg_temp.fix_document_template_mojibake(corrupted.name)
 and canonical.id <> corrupted.id
where document.organization_id = corrupted.organization_id
  and (
    document.template_id = corrupted.id
    or exists (
      select 1
      from public.clinical_document_template_versions as duplicate_version
      where duplicate_version.organization_id = corrupted.organization_id
        and duplicate_version.template_id = corrupted.id
        and duplicate_version.id = document.template_version_id
    )
  )
  and corrupted.name ~ '[ÃÂ]';

-- Remove only mojibake duplicates for which a canonical copy is present. Their
-- version history belongs to the duplicate and is removed by the FK cascade.
delete from public.clinical_document_templates as corrupted
using public.clinical_document_templates as canonical
where corrupted.name ~ '[ÃÂ]'
  and canonical.organization_id = corrupted.organization_id
  and canonical.document_type = corrupted.document_type
  and canonical.name = pg_temp.fix_document_template_mojibake(corrupted.name)
  and canonical.id <> corrupted.id;

-- Repair templates that do not have a duplicate, including their editable copy.
update public.clinical_document_templates
set name = pg_temp.fix_document_template_mojibake(name),
    description = pg_temp.fix_document_template_mojibake(description),
    title_template = pg_temp.fix_document_template_mojibake(title_template),
    body_template = pg_temp.fix_document_template_mojibake(body_template)
where concat_ws(' ', name, description, title_template, body_template) ~ '[ÃÂ]';

update public.clinical_document_template_versions
set title_template = pg_temp.fix_document_template_mojibake(title_template),
    body_template = pg_temp.fix_document_template_mojibake(body_template),
    change_summary = pg_temp.fix_document_template_mojibake(change_summary)
where concat_ws(' ', title_template, body_template, change_summary) ~ '[ÃÂ]';

alter table public.clinical_document_template_versions
  enable trigger prevent_clinical_document_template_version_change;

alter table public.clinical_documents
  enable trigger prevent_clinical_document_update_delete;
