import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "user-avatars";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB (o navegador já envia ~50 KB)
const ALLOWED_TYPES = ["image/webp", "image/jpeg", "image/png"];

/** Pasta da pessoa no bucket: `<empresa|platform>/<app_user_id>/`. */
export function userAvatarFolder(
  organizationId: string | null,
  appUserId: string,
) {
  return `${organizationId ?? "platform"}/${appUserId}/`;
}

export async function uploadUserAvatar({
  file,
  organizationId,
  appUserId,
}: {
  file: FormDataEntryValue | null;
  organizationId: string | null;
  appUserId: string;
}): Promise<{ path?: string; error?: string }> {
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione uma imagem." };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Use uma imagem PNG, JPG ou WEBP." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "A imagem deve ter no máximo 2 MB." };
  }

  const extension = file.type === "image/png" ? "png" : file.type.split("/")[1];
  // Nome novo a cada envio: o link antigo nunca mostra a foto nova e o cache
  // do navegador não segura a velha.
  const path = `${userAvatarFolder(organizationId, appUserId)}${crypto.randomUUID()}.${extension}`;
  const { error } = await createSupabaseAdminClient()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return {
      error: /bucket/i.test(error.message)
        ? "O envio de fotos ainda não está disponível. Ele entra com a próxima atualização do sistema."
        : "Não foi possível enviar a foto. Tente de novo.",
    };
  }
  return { path };
}

export async function deleteUserAvatar(path: string | null | undefined) {
  if (!path) return;
  await createSupabaseAdminClient().storage.from(BUCKET).remove([path]);
}

// Mesmo cuidado das fotos de pacientes: a URL assinada vale 1h e a janela de
// 30min entra na chave do cache, para nunca servir uma URL já vencida.
const signedUrlTtlSeconds = 60 * 60;
const signedUrlWindowMs = 30 * 60 * 1000;

const createCachedSignedUrl = unstable_cache(
  async (path: string, window: number) => {
    void window;
    const { data, error } = await createSupabaseAdminClient()
      .storage.from(BUCKET)
      .createSignedUrl(path, signedUrlTtlSeconds);
    if (error) return null;
    return data.signedUrl;
  },
  ["user-avatar-signed-url"],
  { revalidate: 45 * 60 },
);

export async function createUserAvatarSignedUrl(
  path: string | null | undefined,
) {
  if (!path) return null;
  return createCachedSignedUrl(
    path,
    Math.floor(Date.now() / signedUrlWindowMs),
  );
}

/**
 * Fotos (URL assinada) de vários usuários da mesma empresa. Tolera o banco
 * ainda sem a coluna `avatar_path` (migração não aplicada): devolve vazio em
 * vez de quebrar a página.
 */
export async function loadUserAvatarUrls(
  userIds: string[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return urls;

  const { data, error } = await createSupabaseAdminClient()
    .from("app_users")
    .select("id, avatar_path")
    .in("id", ids)
    .returns<Array<{ id: string; avatar_path: string | null }>>();
  if (error || !data) return urls;

  await Promise.all(
    data.map(async (row) => {
      const url = await createUserAvatarSignedUrl(row.avatar_path);
      if (url) urls.set(row.id, url);
    }),
  );
  return urls;
}
