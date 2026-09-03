-- Cadastrar paciente falhava com "permission denied for function
-- phone_match_key".
--
-- A migration 20260901130000 criou dois indices de expressao sobre
-- public.patients usando app_private.phone_match_key(...) e, no final, revogou
-- a funcao de `public` sem conceder de volta a ninguem. Indice de expressao nao
-- e avaliado pelo dono da tabela: o Postgres calcula a expressao durante o
-- INSERT/UPDATE com as permissoes de quem esta escrevendo. Como a interface
-- grava em `patients` como `authenticated` (PostgREST), todo cadastro de
-- paciente passou a falhar -- inclusive o cadastro rapido do agendamento e da
-- fila de espera.
--
-- Confirmar solicitacao online continuava funcionando porque aquele caminho
-- passa por uma funcao security definer, avaliada como o dono.
--
-- Mesma armadilha vale para os outros indices de expressao criados sobre
-- funcoes de app_private, entao todos ganham grant aqui.

grant usage on schema app_private to authenticated, service_role;

-- Indices patients_phone_match_idx / patients_whatsapp_match_idx /
-- whatsapp_contacts_phone_match_idx.
grant execute on function app_private.phone_match_key(text)
  to authenticated, service_role;

-- Indice notification_outbox_recipient_tail_idx.
grant execute on function app_private.normalize_communication_recipient(text, text)
  to authenticated, service_role;

comment on function app_private.phone_match_key(text) is
  'Ultimos 8 digitos de um telefone, para casar cadastro e WhatsApp mesmo com DDI/nono digito diferentes. Null abaixo de 8 digitos. Precisa de execute para authenticated: e usada em indice de expressao em patients, avaliado no INSERT com as permissoes de quem escreve.';
