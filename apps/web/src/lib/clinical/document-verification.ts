import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Raio-X E5 (parte sem provedor externo): código de verificação impresso no
 * PDF como QR Code. Quem recebe o papel (farmácia, laboratório, empresa)
 * abre /validar/<código> e confere que o documento foi emitido pela clínica,
 * por qual profissional e quando. Não substitui a assinatura ICP-Brasil, que
 * protege o conteúdo e exige um provedor de certificado em nuvem.
 *
 * O código é o ID do documento mais uma assinatura HMAC: não dá para chutar
 * códigos de outros documentos. Não expira (o papel circula por meses).
 */
function secret() {
  const configured = process.env.DOCUMENT_LINK_SECRET;
  if (configured) return `verify:${configured}`;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fallback) throw new Error("Sem segredo para verificar documentos.");
  return createHash("sha256")
    .update(`document-verify:${fallback}`)
    .digest("hex");
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signature(documentId: string) {
  return createHmac("sha256", secret())
    .update(documentId.toLowerCase())
    .digest()
    .subarray(0, 12)
    .toString("base64url");
}

export function createDocumentVerificationCode(documentId: string) {
  if (!uuidPattern.test(documentId)) throw new Error("ID inválido.");
  const id = Buffer.from(documentId.replace(/-/g, ""), "hex").toString(
    "base64url",
  );
  return `${id}.${signature(documentId)}`;
}

export function verifyDocumentVerificationCode(code: string): string | null {
  const [id, provided] = code.split(".");
  if (!id || !provided || id.length !== 22) return null;
  const hex = Buffer.from(id, "base64url").toString("hex");
  if (hex.length !== 32) return null;
  const documentId = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
  const expected = Buffer.from(signature(documentId));
  const received = Buffer.from(provided);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }
  return documentId;
}

export function documentVerificationUrl(baseUrl: string, documentId: string) {
  return `${baseUrl.replace(/\/+$/, "")}/validar/${createDocumentVerificationCode(documentId)}`;
}
