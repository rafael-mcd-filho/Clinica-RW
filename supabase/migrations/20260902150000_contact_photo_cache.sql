-- Cache das fotos de perfil dos contatos.
--
-- A rota /api/whatsapp/contact-photo respondia com Cache-Control para o
-- navegador, mas nao guardava nada do lado do servidor: cada requisicao
-- montava a credencial da Evolution (duas queries + descriptografia), pedia a
-- URL da foto na Evolution API e so entao baixava a imagem no CDN do WhatsApp.
-- Numa caixa de entrada com dezenas de conversas isso e uma rajada de chamadas
-- externas a cada cache frio do navegador -- dai a sensacao de "foto sempre
-- carregando".
--
-- Storage foi escolhido no lugar de um cache em memoria porque o projeto ja
-- usa buckets (marca, foto de paciente, midia do WhatsApp), sobrevive a
-- restart e vale para todas as instancias da aplicacao.

insert into storage.buckets (id, name, public, file_size_limit)
values ('contact-photos', 'contact-photos', false, 2097152)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

-- `photo_checked_at` marca a ultima consulta -- inclusive quando o contato nao
-- tem foto. Sem isso, contato sem foto voltaria a bater na Evolution a cada
-- visita, que e o caso mais comum numa lista grande.
alter table public.whatsapp_contacts
  add column if not exists photo_path text,
  add column if not exists photo_checked_at timestamptz;

comment on column public.whatsapp_contacts.photo_path is
  'Caminho da foto no bucket contact-photos. Nulo quando o contato nao tem foto no WhatsApp.';
comment on column public.whatsapp_contacts.photo_checked_at is
  'Quando a foto foi conferida na Evolution pela ultima vez, com ou sem resultado.';

create index if not exists whatsapp_contacts_photo_refresh_idx
  on public.whatsapp_contacts (organization_id, photo_checked_at);

-- Limpa o cache de uma organizacao inteira: o botao "limpar cache" do perfil.
-- Apaga so o rastro; o arquivo no bucket e sobrescrito na proxima visita.
create or replace function public.clear_contact_photo_cache()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_organization_id uuid;
  v_cleared integer;
begin
  v_organization_id := app_private.current_organization_id();

  if v_organization_id is null
    or not (
      app_private.current_user_has_permission('atendimento.ver')
      or app_private.current_user_has_permission('atendimento.configurar')
    ) then
    raise exception 'Not allowed to clear the photo cache.' using errcode = '42501';
  end if;

  with cleared as (
    update public.whatsapp_contacts
    set photo_path = null,
        photo_checked_at = null
    where organization_id = v_organization_id
      and (photo_path is not null or photo_checked_at is not null)
    returning 1
  )
  select count(*)::integer into v_cleared from cleared;

  return coalesce(v_cleared, 0);
end;
$$;

revoke all on function public.clear_contact_photo_cache() from public;
grant execute on function public.clear_contact_photo_cache()
  to authenticated, service_role;
