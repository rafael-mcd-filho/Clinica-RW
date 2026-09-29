import { z } from "zod";

const point = z
  .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
  .strict();
export const consentSignatureSchema = z
  .discriminatedUnion("method", [
    z
      .object({
        method: z.literal("typed"),
        name: z.string().trim().min(3).max(160),
      })
      .strict(),
    z
      .object({
        method: z.literal("drawn"),
        strokes: z.array(z.array(point).min(2).max(2048)).min(1).max(100),
      })
      .strict(),
  ])
  .superRefine((signature, ctx) => {
    if (signature.method !== "drawn") return;
    const points = signature.strokes.flat();
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    if (
      points.length < 4 ||
      points.length > 2048 ||
      Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      ) < 0.03
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Faça uma assinatura completa ou use o nome digitado.",
      });
    }
  });
export type ConsentSignature = z.infer<typeof consentSignatureSchema>;
export const consentEvidenceSchema = z
  .object({
    signer_role: z.enum(["patient", "guardian"]),
    signer_name: z.string().trim().min(3).max(160),
    signer_document: z.string().trim().min(3).max(80),
    guardian_relationship: z.string().trim().max(160).default(""),
    acknowledged: z.literal(true),
    signature: consentSignatureSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.signer_role === "guardian" &&
      value.guardian_relationship.length < 3
    )
      ctx.addIssue({
        code: "custom",
        message: "Informe o vínculo do responsável com o paciente.",
      });
    if (
      value.signature.method === "typed" &&
      value.signature.name !== value.signer_name
    )
      ctx.addIssue({
        code: "custom",
        message:
          "A assinatura digitada deve corresponder ao nome do signatário.",
      });
  });
export type ConsentEvent = {
  id: string;
  event_type: "signed" | "cancelled" | "revoked";
  signer_role: "patient" | "guardian" | null;
  signer_name: string | null;
  signer_document: string | null;
  guardian_relationship: string | null;
  signature: ConsentSignature | null;
  reason: string | null;
  document_hash: string;
  recorded_by_name: string;
  created_at: string;
};
export type ConsentDetails = {
  id: string;
  encounterId: string;
  patientId: string;
  title: string;
  body: string;
  issuedAt: string;
  procedure: string;
  patientName: string;
  timeZone: string;
  canManage: boolean;
  events: ConsentEvent[];
};
export type ConsentEventSummary = Pick<
  ConsentEvent,
  "event_type" | "created_at"
>;
export function consentStatus(events: ConsentEventSummary[]) {
  return (
    events.reduce<ConsentEventSummary | undefined>(
      (latest, event) =>
        !latest || event.created_at > latest.created_at ? event : latest,
      undefined,
    )?.event_type ?? "pending"
  );
}
export const consentStatusLabels = {
  pending: "Aguardando assinatura",
  signed: "Assinado presencialmente",
  cancelled: "Cancelado",
  revoked: "Consentimento revogado",
};
