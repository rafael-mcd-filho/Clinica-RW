import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "patient-photos";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export type PatientPhotoUploadResult = { path?: string; error?: string };

export async function uploadPatientPhoto({
  file,
  organizationId,
  patientId,
  previousPath,
}: {
  file: FormDataEntryValue | null;
  organizationId: string;
  patientId: string;
  previousPath?: string | null;
}): Promise<PatientPhotoUploadResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione uma imagem para enviar." };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Use uma imagem PNG, JPG ou WEBP." };
  }

  if (file.size > MAX_BYTES) {
    return { error: "A imagem deve ter no máximo 2 MB." };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "webp";
  const path = `${organizationId}/${patientId}/${crypto.randomUUID()}.${extension}`;
  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return { error: "Não foi possível enviar a foto do paciente." };
  }

  if (previousPath) {
    await deletePatientPhoto(previousPath);
  }

  return { path };
}

export async function deletePatientPhoto(path: string | null | undefined) {
  if (!path) return;
  const supabaseAdmin = createSupabaseAdminClient();
  await supabaseAdmin.storage.from(BUCKET).remove([path]);
}

// createSignedUrl é um POST de rede ao Storage por foto. As URLs valem
// 1h; o cache evita pagar esse round-trip a cada navegação. O path muda a
// cada upload (uuid novo), então troca de foto nunca serve URL antiga.
//
// O revalidate sozinho não bastava: o unstable_cache é stale-while-
// revalidate, e depois do prazo ainda entrega a URL velha uma vez enquanto
// busca outra. Sem visita por mais de 1h, essa URL velha já tinha vencido e
// a primeira pessoa a abrir a ficha via a foto quebrada. A janela de 30min
// entra na chave: janela nova é chave nova, buscada na hora, e nenhuma URL
// servida tem mais de ~30min dos 60 de validade.
const signedUrlTtlSeconds = 60 * 60;
const signedUrlWindowMs = 30 * 60 * 1000;

const createCachedSignedUrl = unstable_cache(
  // `window` só existe para compor a chave do cache.
  async (path: string, window: number) => {
    void window;
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, signedUrlTtlSeconds);

    if (error) return null;
    return data.signedUrl;
  },
  ["patient-photo-signed-url"],
  { revalidate: 45 * 60 },
);

export async function createPatientPhotoSignedUrl(
  path: string | null | undefined,
) {
  if (!path) return null;
  return createCachedSignedUrl(
    path,
    Math.floor(Date.now() / signedUrlWindowMs),
  );
}
