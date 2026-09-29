import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const CLINICAL_ATTACHMENTS_BUCKET = "clinical-attachments";
export const CLINICAL_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
export const CLINICAL_ATTACHMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** Aba de Documentos em que o arquivo aparece. */
export type AttachmentCategory = "exam" | "report" | "other";
export const attachmentCategoryLabels: Record<AttachmentCategory, string> = {
  exam: "Exame",
  report: "Laudo",
  other: "Outro",
};

export type EncounterAttachment = {
  id: string;
  /** Nulo quando o arquivo foi enviado direto na ficha do paciente. */
  encounterId: string | null;
  category: AttachmentCategory;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedByName: string | null;
  /** Link temporário (1 h) para abrir ou baixar. */
  url: string | null;
};

type AttachmentRow = {
  id: string;
  encounter_id: string | null;
  category?: string | null;
  storage_path: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  uploaded_by: string | null;
};

/** Pasta do atendimento no bucket. */
export function attachmentFolder(input: {
  organizationId: string;
  patientId: string;
  encounterId: string;
}) {
  return `${input.organizationId}/${input.patientId}/${input.encounterId}/`;
}

/** Pasta dos arquivos enviados direto na ficha, sem atendimento. */
export function patientAttachmentFolder(input: {
  organizationId: string;
  patientId: string;
}) {
  return `${input.organizationId}/${input.patientId}/ficha/`;
}

export function isAttachmentCategory(
  value: unknown,
): value is AttachmentCategory {
  return value === "exam" || value === "report" || value === "other";
}

/** Nome seguro para o caminho (o nome original fica na tabela). */
export function attachmentObjectName(fileName: string) {
  const extension = fileName.includes(".")
    ? fileName
        .split(".")
        .pop()!
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
    : "";
  return `${crypto.randomUUID()}${extension ? `.${extension.slice(0, 8)}` : ""}`;
}

export function validateAttachment(input: {
  fileName: string;
  sizeBytes: number;
  contentType: string;
}) {
  if (!input.fileName.trim()) return "Arquivo sem nome.";
  if (!CLINICAL_ATTACHMENT_TYPES.includes(input.contentType)) {
    return "Envie PDF ou imagem (JPG, PNG, WEBP ou HEIC).";
  }
  if (input.sizeBytes <= 0) return "O arquivo está vazio.";
  if (input.sizeBytes > CLINICAL_ATTACHMENT_MAX_BYTES) {
    return "O arquivo passa de 20 MB. Reduza ou divida antes de enviar.";
  }
  return null;
}

async function withSignedUrls(rows: AttachmentRow[]) {
  const admin = createSupabaseAdminClient();
  const uploaderIds = [
    ...new Set(rows.map((row) => row.uploaded_by).filter(Boolean)),
  ] as string[];
  const [signed, uploaders] = await Promise.all([
    rows.length
      ? admin.storage.from(CLINICAL_ATTACHMENTS_BUCKET).createSignedUrls(
          rows.map((row) => row.storage_path),
          60 * 60,
        )
      : Promise.resolve({ data: [] as Array<{ signedUrl: string | null }> }),
    uploaderIds.length
      ? admin
          .from("app_users")
          .select("id, name")
          .in("id", uploaderIds)
          .returns<Array<{ id: string; name: string }>>()
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);
  const names = new Map(
    (uploaders.data ?? []).map((user) => [user.id, user.name]),
  );
  return rows.map<EncounterAttachment>((row, index) => ({
    id: row.id,
    encounterId: row.encounter_id,
    category: isAttachmentCategory(row.category) ? row.category : "exam",
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at,
    uploadedByName: row.uploaded_by
      ? (names.get(row.uploaded_by) ?? null)
      : null,
    url: signed.data?.[index]?.signedUrl ?? null,
  }));
}

/**
 * Anexos de um atendimento. Quem chama já conferiu o acesso ao atendimento.
 * Tolera o banco sem a tabela (migração pendente): devolve lista vazia.
 */
export async function listEncounterAttachments(
  organizationId: string,
  encounterId: string,
) {
  const { data, error } = await createSupabaseAdminClient()
    .from("encounter_attachments")
    .select(
      "id, encounter_id, storage_path, file_name, content_type, size_bytes, created_at, uploaded_by",
    )
    .eq("organization_id", organizationId)
    .eq("encounter_id", encounterId)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .returns<AttachmentRow[]>();
  if (error || !data) return { attachments: [], available: !error };
  return { attachments: await withSignedUrls(data), available: true };
}

const baseColumns =
  "id, encounter_id, storage_path, file_name, content_type, size_bytes, created_at, uploaded_by";

/**
 * Anexos do paciente que a pessoa enxerga: os dos atendimentos que ela vê
 * (a lista já passou pelas regras do prontuário) e os enviados direto na
 * ficha. Quem chama já conferiu que ela pode ver o prontuário.
 */
export async function listPatientAttachments(
  organizationId: string,
  patientId: string,
  visibleEncounterIds: string[],
) {
  const admin = createSupabaseAdminClient();
  const query = (columns: string, includePatientLevel: boolean) => {
    let request = admin
      .from("encounter_attachments")
      .select(columns)
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId)
      .is("removed_at", null);
    if (includePatientLevel) {
      request = visibleEncounterIds.length
        ? request.or(
            `encounter_id.is.null,encounter_id.in.(${visibleEncounterIds.join(",")})`,
          )
        : request.is("encounter_id", null);
    } else {
      request = request.in("encounter_id", visibleEncounterIds);
    }
    return request
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<AttachmentRow[]>();
  };

  const { data, error } = await query(`${baseColumns}, category`, true);
  if (!error && data) return withSignedUrls(data);
  // Banco ainda sem a migração da ficha (sem categoria nem anexo avulso).
  if (!visibleEncounterIds.length) return [];
  const legacy = await query(baseColumns, false);
  return legacy.error || !legacy.data ? [] : withSignedUrls(legacy.data);
}
