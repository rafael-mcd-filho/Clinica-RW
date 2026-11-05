-- Raio-X S16: limite no bucket de fotos de pacientes.
--
-- ATENÇÃO: criada no repositório e NÃO aplicada em produção. Teste num
-- branch: trocar a foto de um paciente com JPG/PNG/WebP de até 2 MB funciona;
-- um PDF ou uma imagem maior é recusada pelo próprio Storage.
--
-- O app já recusa arquivo grande ou fora de formato
-- (src/lib/storage/patient-photos.ts), mas o bucket aceitava qualquer coisa:
-- um upload que contornasse o app enchia o Storage com o que quisesse. Agora
-- o bucket aplica o mesmo teto e os mesmos formatos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-photos',
  'patient-photos',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
