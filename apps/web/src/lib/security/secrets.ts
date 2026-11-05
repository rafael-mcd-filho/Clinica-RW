import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compara um segredo recebido com o esperado em tempo constante.
 *
 * `===` para no primeiro caractere diferente, e o tempo de resposta denuncia
 * quanto do segredo já está certo. Os dois lados viram SHA-256 antes da
 * comparação, então tamanhos diferentes também não vazam.
 */
export function secretsMatch(
  provided: string | null | undefined,
  expected: string | null | undefined,
) {
  if (!provided || !expected) return false;
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}
