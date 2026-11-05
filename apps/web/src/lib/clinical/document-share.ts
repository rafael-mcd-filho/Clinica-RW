import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Link do documento para o paciente (Raio-X E7): token assinado com prazo,
 * sem tabela nova. Quem tem o link abre só aquele PDF, até a data de
 * validade. O segredo é DOCUMENT_LINK_SECRET; sem ele, deriva da service role
 * (nunca vai ao navegador).
 */
const defaultTtlDays = 7;

function secret() {
  const configured = process.env.DOCUMENT_LINK_SECRET;
  if (configured) return configured;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fallback) throw new Error("Sem segredo para links de documento.");
  return createHash("sha256").update(`document-link:${fallback}`).digest("hex");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createDocumentShareToken(
  documentId: string,
  organizationId: string,
  ttlDays = defaultTtlDays,
) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlDays * 86_400;
  const payload = Buffer.from(
    JSON.stringify({ d: documentId, o: organizationId, e: expiresAt }),
  ).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function verifyDocumentShareToken(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(signature);
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      d?: string;
      o?: string;
      e?: number;
    };
    if (!data.d || !data.o || !data.e) return null;
    if (data.e < Math.floor(Date.now() / 1000)) return null;
    return { documentId: data.d, organizationId: data.o, expiresAt: data.e };
  } catch {
    return null;
  }
}
