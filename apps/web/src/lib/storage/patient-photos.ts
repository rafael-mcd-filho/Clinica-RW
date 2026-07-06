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

export async function createPatientPhotoSignedUrl(
  path: string | null | undefined,
) {
  if (!path) return null;
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error) return null;
  return data.signedUrl;
}
