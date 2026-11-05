-- Raio-X FI1: estorno de recebimento.
--
-- ATENÇÃO: criada no repositório e NÃO aplicada em produção. Teste num
-- branch do Supabase: estornar um recebimento parcial (a conta volta a
-- "parcial" ou "aberta"), tentar estornar um recebimento cujo repasse ao
-- profissional já foi pago (deve recusar) e conferir caixa/DRE do período.
--
-- Lançou errado não tinha volta: não havia como estornar um recebimento.
-- O estorno remove o pagamento (e o repasse pendente gerado por ele),
-- recalcula o saldo da conta e guarda na auditoria o pagamento inteiro, quem
-- estornou e o motivo. Os relatórios de caixa, que somam public.payments,
-- passam a refletir o estorno sem nenhuma outra mudança.
--
-- Cancelar e editar contas em aberto não precisa de migração: as políticas
-- de RLS de contas a receber e a pagar já permitem, e o app faz isso direto.

create or replace function public.reverse_receivable_payment(
  p_payment_id uuid,
  p_reason text,
  p_impersonation_session_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_payment public.payments%rowtype;
  v_payout public.professional_payouts%rowtype;
  v_receivable public.accounts_receivable%rowtype;
  v_paid numeric(12,2);
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if length(v_reason) < 3 then
    raise exception 'Reversal reason is required.' using errcode = '22023';
  end if;

  select *
    into v_context
  from app_private.resolve_effective_request_context(p_impersonation_session_id);

  if v_context.effective_user_id is null
    or not (
      app_private.user_has_permission(v_context.effective_user_id, 'financeiro.ver_geral')
      or app_private.user_has_permission(v_context.effective_user_id, 'financeiro.receber_pagamento')
    ) then
    raise exception 'Not allowed to reverse payments.' using errcode = '42501';
  end if;

  select *
    into v_payment
  from public.payments
  where id = p_payment_id
    and organization_id = v_context.organization_id
  for update;

  if v_payment.id is null then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;

  select *
    into v_receivable
  from public.accounts_receivable
  where organization_id = v_payment.organization_id
    and id = v_payment.account_receivable_id
  for update;

  select *
    into v_payout
  from public.professional_payouts
  where organization_id = v_payment.organization_id
    and payment_id = v_payment.id
  for update;

  if v_payout.id is not null and v_payout.status = 'paid' then
    raise exception 'Professional payout already paid for this payment.'
      using errcode = '55000';
  end if;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_payment.organization_id,
    v_context.actor_user_id,
    'payment.reversed',
    'payment',
    v_payment.id,
    jsonb_build_object(
      'reason', v_reason,
      'account_receivable_id', v_payment.account_receivable_id,
      'payment', to_jsonb(v_payment),
      'payout', case when v_payout.id is null then null else to_jsonb(v_payout) end,
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id
    )
  );

  if v_payout.id is not null then
    delete from public.professional_payouts where id = v_payout.id;
  end if;

  delete from public.payments where id = v_payment.id;

  select coalesce(sum(payments.amount), 0)
    into v_paid
  from public.payments
  where payments.organization_id = v_payment.organization_id
    and payments.account_receivable_id = v_payment.account_receivable_id;

  update public.accounts_receivable
  set paid_amount = v_paid,
      status = case
        when v_paid <= 0 then 'open'
        when v_paid < v_receivable.amount then 'partial'
        else 'paid'
      end,
      updated_at = now()
  where id = v_receivable.id;
end;
$$;

revoke all on function public.reverse_receivable_payment(uuid, text, uuid)
  from public, anon;
grant execute on function public.reverse_receivable_payment(uuid, text, uuid)
  to authenticated, service_role;

comment on function public.reverse_receivable_payment(uuid, text, uuid) is
  'Estorna um recebimento (com motivo), remove o repasse pendente e recalcula a conta; registra tudo na auditoria.';
