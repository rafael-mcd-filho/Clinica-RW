import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "branding";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
];

export type LogoUploadResult = { url?: string | null; error?: string };

/**
 * Uploads a logo file to the public `branding` bucket using the service role
 * (bypasses RLS) and returns its public URL. Returns an empty result when no
 * file is provided so callers can keep the previous value.
 */
export async function uploadBrandingLogo(
  file: FormDataEntryValue | null,
  prefix: string,
): Promise<LogoUploadResult> {
  if (!(file instanceof File) || file.size === 0) {
    return {};
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Use uma imagem PNG, JPG, WEBP ou SVG." };
  }

  if (file.size > MAX_BYTES) {
    return { error: "A imagem deve ter no máximo 2 MB." };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${prefix}/${crypto.randomUUID()}.${extension}`;

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    return { error: "Não foi possível enviar a imagem." };
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}
