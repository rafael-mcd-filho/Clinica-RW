-- Raio-X FI4: chave Pix na forma de pagamento.
--
-- ATENÇÃO: criada no repositório e NÃO aplicada em produção. Teste num
-- branch: em Configurações > Financeiro, editar a forma "Pix" e informar a
-- chave; no Financeiro, abrir uma conta a receber e usar "Cobrar por Pix".
--
-- Com a chave cadastrada o sistema gera o Pix "copia e cola" e o QR Code com
-- o valor exato da conta (BR Code estático do Banco Central). Não há banco
-- nem gateway envolvido: a baixa continua sendo registrada pela recepção.

begin;

alter table public.payment_methods
  add column if not exists pix_key text,
  add column if not exists pix_key_type text;

alter table public.payment_methods
  drop constraint if exists payment_methods_pix_key_type_check;
alter table public.payment_methods
  add constraint payment_methods_pix_key_type_check
  check (
    pix_key_type is null
    or pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'random')
  );

alter table public.payment_methods
  drop constraint if exists payment_methods_pix_key_check;
alter table public.payment_methods
  add constraint payment_methods_pix_key_check
  check (
    (pix_key is null and pix_key_type is null)
    or (
      method_type = 'pix'
      and pix_key_type is not null
      and char_length(pix_key) between 1 and 77
    )
  );

comment on column public.payment_methods.pix_key is
  'Chave Pix da clínica (CPF/CNPJ só números, celular +55DDD, e-mail ou chave aleatória). Usada para gerar o Pix copia e cola das contas a receber.';

commit;
