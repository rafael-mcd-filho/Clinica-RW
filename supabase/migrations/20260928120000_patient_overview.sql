-- Ficha do paciente (Resumo): o que a nova tela precisa guardar.
--
-- 1. Convênio do paciente: o plano que ele usa normalmente, para aparecer na
--    ficha e não depender do último agendamento.
-- 2. Observações gerais: um texto livre da equipe sobre o paciente. Fica junto
--    do resumo clínico porque tem o mesmo acesso (dados sensíveis).
-- 3. Diagnósticos do paciente (CID): a lista de problemas que acompanha o
--    paciente entre os atendimentos. Os CIDs de cada atendimento continuam
--    no prontuário (encounter_diagnoses); esta lista é a visão consolidada.
-- 4. Exames enviados direto na ficha, sem atendimento aberto, com categoria
--    (exame, laudo ou outro) para as abas de Documentos.
--
-- Tudo aditivo: nada existente muda de comportamento.

-- 1) Convênio do paciente -------------------------------------------------

alter table public.patients
  add column if not exists health_insurance_id uuid,
  add column if not exists health_insurance_card text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'patients_health_insurance_fkey'
  ) then
    alter table public.patients
      add constraint patients_health_insurance_fkey
      foreign key (organization_id, health_insurance_id)
      references public.health_insurances(organization_id, id)
      on delete set null (health_insurance_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'patients_health_insurance_card_length_check'
  ) then
    alter table public.patients
      add constraint patients_health_insurance_card_length_check
      check (
        health_insurance_card is null
        or char_length(health_insurance_card) <= 60
      );
  end if;
end $$;

create index if not exists patients_health_insurance_idx
  on public.patients (organization_id, health_insurance_id)
  where health_insurance_id is not null;

-- 2) Observações gerais ---------------------------------------------------

alter table public.patient_clinical_summaries
  add column if not exists general_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'patient_clinical_summaries_general_notes_length_check'
  ) then
    alter table public.patient_clinical_summaries
      add constraint patient_clinical_summaries_general_notes_length_check
      check (general_notes is null or char_length(general_notes) <= 4000);
  end if;
end $$;

-- 3) Diagnósticos do paciente ----------------------------------------------
--
-- Acesso só pelo servidor do app (service role), que confere antes as
-- permissões de prontuário da pessoa — o mesmo desenho dos anexos. Nada é
-- apagado: "remover" só esconde (removed_at) e fica registrado na auditoria.

create table if not exists public.patient_diagnoses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  cid_code text not null check (char_length(cid_code) between 2 and 10),
  description text check (description is null or char_length(description) <= 300),
  is_primary boolean not null default false,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.app_users(id) on delete set null,
  unique (organization_id, id),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade
);

comment on table public.patient_diagnoses is
  'Lista de diagnósticos (CID) do paciente, mantida na ficha. Os CIDs de cada atendimento ficam em encounter_diagnoses.';

-- O mesmo CID não se repete na lista ativa, e só um é o principal.
create unique index if not exists patient_diagnoses_active_code_key
  on public.patient_diagnoses (organization_id, patient_id, cid_code)
  where removed_at is null;

create unique index if not exists patient_diagnoses_single_primary_key
  on public.patient_diagnoses (organization_id, patient_id)
  where is_primary and removed_at is null;

create index if not exists patient_diagnoses_patient_idx
  on public.patient_diagnoses (organization_id, patient_id, created_at desc)
  where removed_at is null;

drop trigger if exists set_patient_diagnoses_updated_at
  on public.patient_diagnoses;
create trigger set_patient_diagnoses_updated_at
before update on public.patient_diagnoses
for each row execute function app_private.set_updated_at();

alter table public.patient_diagnoses enable row level security;
revoke all on public.patient_diagnoses from anon, authenticated;

-- 4) Exames na ficha, sem atendimento, e categoria -------------------------

alter table public.encounter_attachments
  alter column encounter_id drop not null;

alter table public.encounter_attachments
  add column if not exists category text not null default 'exam';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'encounter_attachments_category_check'
  ) then
    alter table public.encounter_attachments
      add constraint encounter_attachments_category_check
      check (category in ('exam', 'report', 'other'));
  end if;
end $$;

comment on table public.encounter_attachments is
  'Exames e documentos do paciente. Com atendimento: <empresa>/<paciente>/<atendimento>/<arquivo>. Enviados direto na ficha (sem atendimento): <empresa>/<paciente>/ficha/<arquivo>.';
