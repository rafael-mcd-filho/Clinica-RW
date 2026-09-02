-- Responder citando uma mensagem, como no WhatsApp.
--
-- A citacao e enviada a Evolution no campo `quoted` (chave da mensagem
-- original), mas quem exibe a thread e o sistema: sem guardar a referencia, a
-- resposta chegaria no aparelho do contato citando, e aqui apareceria solta.
-- Dai a coluna apontando para a mensagem respondida.

alter table public.whatsapp_messages
  add column if not exists reply_to_message_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.whatsapp_messages'::regclass
      and conname = 'whatsapp_messages_reply_to_fkey'
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_reply_to_fkey
      foreign key (organization_id, reply_to_message_id)
      references public.whatsapp_messages(organization_id, id)
      on delete set null (reply_to_message_id);
  end if;
end;
$$;

create index if not exists whatsapp_messages_reply_to_idx
  on public.whatsapp_messages (organization_id, reply_to_message_id)
  where reply_to_message_id is not null;

comment on column public.whatsapp_messages.reply_to_message_id is
  'Mensagem citada por esta resposta (quoted da Evolution).';
