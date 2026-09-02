-- Card de funil ligado ao contato do WhatsApp.
--
-- O funil comeca antes do cadastro: quem chega pelo atendimento e um contato,
-- e virar paciente e justamente o que o funil persegue. Exigir patient_id
-- desde a criacao obrigava a cadastrar antes de ter interesse confirmado.
--
-- Agora o card aponta para paciente, contato, ou os dois -- o que permite
-- criar o card direto da conversa e completar o vinculo depois, sem perder o
-- historico do card.

alter table public.funnel_cards
  add column if not exists contact_id uuid;

alter table public.funnel_cards
  alter column patient_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.funnel_cards'::regclass
      and conname = 'funnel_cards_contact_fkey'
  ) then
    alter table public.funnel_cards
      add constraint funnel_cards_contact_fkey
      foreign key (organization_id, contact_id)
      references public.whatsapp_contacts(organization_id, id)
      on delete set null (contact_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.funnel_cards'::regclass
      and conname = 'funnel_cards_subject_check'
  ) then
    -- Um card sem paciente e sem contato nao representa ninguem.
    alter table public.funnel_cards
      add constraint funnel_cards_subject_check
      check (patient_id is not null or contact_id is not null);
  end if;
end;
$$;

-- Espelha a trava que ja existe por paciente: um contato tambem nao pode
-- ocupar dois cards ativos no mesmo funil.
create unique index if not exists funnel_cards_active_contact_key
  on public.funnel_cards (organization_id, funnel_id, contact_id)
  where archived_at is null and contact_id is not null;

comment on column public.funnel_cards.contact_id is
  'Contato do WhatsApp que originou o card, quando veio do atendimento.';
