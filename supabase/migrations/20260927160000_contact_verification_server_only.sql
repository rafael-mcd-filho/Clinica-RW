-- Verificação de contato do agendamento online: o código de 6 dígitos voltava
-- na resposta da função, e a função podia ser chamada direto do navegador
-- (anon), com a chave pública do site. Qualquer pessoa lia o código sem
-- recebê-lo, e a verificação não verificava nada.
--
-- Agora só o servidor do app (service role) gera o código. Ele o envia pelo
-- WhatsApp da clínica e nunca o repassa ao navegador. A conferência do código
-- (verify_online_booking_contact) continua pública: ela só compara o hash.

revoke execute on function public.start_online_booking_contact_verification(text, text, text)
  from anon, authenticated;

grant execute on function public.start_online_booking_contact_verification(text, text, text)
  to service_role;
