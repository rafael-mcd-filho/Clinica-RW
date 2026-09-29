-- Exames e documentos enviados no atendimento (PDF, fotos de exames, laudos).
--
-- Acesso só pelo servidor do app (service role): ele confere, com a sessão da
-- pessoa, se ela enxerga o atendimento (as regras de encounters valem) antes
-- de listar, gerar link ou gravar — o mesmo desenho das fotos de pacientes.
-- Por isso a tabela e o bucket não têm política para clientes.
--
-- Nada é apagado de verdade: o prontuário precisa ser guardado por anos
-- (CFM). "Remover" só esconde (removed_at) e fica registrado na auditoria.

create table if not exists public.encounter_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  encounter_id uuid not null,
  patient_id uuid not null references public.patients(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.app_users(id) on delete set null,
  foreign key (organization_id, encounter_id)
    references public.encounters(organization_id, id) on delete cascade
);

comment on table public.encounter_attachments is
  'Arquivos anexados a um atendimento. Caminho no bucket privado clinical-attachments: <empresa>/<paciente>/<atendimento>/<arquivo>.';

create index if not exists encounter_attachments_encounter_idx
  on public.encounter_attachments (organization_id, encounter_id, created_at desc)
  where removed_at is null;

create index if not exists encounter_attachments_patient_idx
  on public.encounter_attachments (organization_id, patient_id, created_at desc)
  where removed_at is null;

alter table public.encounter_attachments enable row level security;
revoke all on public.encounter_attachments from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinical-attachments',
  'clinical-attachments',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
