import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getOrganizationBrandingPrefix,
  parseOrganizationLogoPublicUrl,
} from "./branding-paths";

const BUCKET = "branding";
const MAX_BYTES = 2 * 1024 * 1024;
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export type LogoUploadResult = { url?: string | null; error?: string };
export type LogoRemovalResult = { removed?: boolean; error?: string };

/**
 * Uploads a logo file to the public `branding` bucket using the service role.
 * This low-level helper is kept for platform branding and company creation.
 * Tenant settings should use `uploadOrganizationLogo`, which isolates objects
 * below the organization's UUID.
 */
export async function uploadBrandingLogo(
  file: FormDataEntryValue | null,
  prefix: string,
): Promise<LogoUploadResult> {
  if (!(file instanceof File) || file.size === 0) {
    return {};
  }

  const extension = EXTENSION_BY_MIME_TYPE[file.type];
  if (!extension) {
    return { error: "Use uma imagem PNG, JPG, WEBP ou SVG." };
  }

  if (file.size > MAX_BYTES) {
    return { error: "A imagem deve ter no máximo 2 MB." };
  }

  const path = `${prefix}/${crypto.randomUUID()}.${extension}`;
  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return { error: "Não foi possível enviar a imagem." };
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

/**
 * Uploads a logo below `organizations/{organizationId}`. Authorization must be
 * checked by the calling Server Action before invoking this service-role
 * helper.
 */
export async function uploadOrganizationLogo(
  file: FormDataEntryValue | null,
  organizationId: string,
): Promise<LogoUploadResult> {
  const prefix = getOrganizationBrandingPrefix(organizationId);
  if (!prefix) {
    return { error: "Empresa inválida para o envio da logo." };
  }

  return uploadBrandingLogo(file, prefix);
}

/**
 * Removes only a generated public logo belonging to the supplied organization.
 * URLs from another host, bucket, organization, legacy unscoped paths or with
 * unexpected filenames are rejected before the service-role client is used.
 */
export async function removeOrganizationLogo(
  logoUrl: string | null | undefined,
  organizationId: string,
): Promise<LogoRemovalResult> {
  if (!logoUrl) {
    return {};
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return { error: "Configuração do armazenamento indisponível." };
  }

  const path = parseOrganizationLogoPublicUrl(
    logoUrl,
    organizationId,
    supabaseUrl,
  );
  if (!path) {
    return { error: "A logo informada não pertence a esta empresa." };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
  if (error) {
    return { error: "Não foi possível remover a logo anterior." };
  }

  return { removed: true };
}
