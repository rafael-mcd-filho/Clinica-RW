import "server-only";
import { createHash, createHmac } from "node:crypto";

/**
 * Raio-X E14: sala de vídeo da teleconsulta. Uma sala por agendamento, com
 * nome derivado do ID por HMAC: estável (o mesmo link para médico e
 * paciente, sem guardar nada no banco) e impossível de adivinhar a partir
 * de outro agendamento. Por padrão usa o Jitsi Meet público; para um
 * servidor próprio (recomendado para dado de saúde), TELEHEALTH_BASE_URL.
 */
function secret() {
  const configured =
    process.env.TELEHEALTH_ROOM_SECRET ?? process.env.DOCUMENT_LINK_SECRET;
  if (configured) return `telehealth:${configured}`;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fallback) throw new Error("Sem segredo para salas de teleconsulta.");
  return createHash("sha256").update(`telehealth:${fallback}`).digest("hex");
}

export function telehealthRoomName(appointmentId: string) {
  const digest = createHmac("sha256", secret())
    .update(appointmentId.toLowerCase())
    .digest("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 22);
  return `HiClinic-${digest}`;
}

export function telehealthRoomUrl(appointmentId: string) {
  const base = (process.env.TELEHEALTH_BASE_URL || "https://meet.jit.si")
    .trim()
    .replace(/\/+$/, "");
  return `${base}/${telehealthRoomName(appointmentId)}`;
}
