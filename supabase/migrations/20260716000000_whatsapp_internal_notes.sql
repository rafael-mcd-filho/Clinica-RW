-- Atendimento: notas internas na conversa (visíveis só para a equipe).
-- Uma nota é uma whatsapp_message com message_type = 'note' — nunca é enviada
-- à Evolution e não altera o preview da conversa.

alter table public.whatsapp_messages
  drop constraint whatsapp_messages_message_type_check;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_message_type_check
  check (
    message_type in (
      'text', 'image', 'audio', 'video', 'document',
      'sticker', 'location', 'contact', 'system', 'note'
    )
  );

comment on constraint whatsapp_messages_message_type_check
  on public.whatsapp_messages is
  'Inclui ''note'' para notas internas da equipe (não enviadas ao WhatsApp).';
