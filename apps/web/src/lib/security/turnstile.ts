import "server-only";
import { headers } from "next/headers";

/**
 * Captcha do agendamento online (Cloudflare Turnstile, Raio-X S4).
 *
 * Fica ligado só quando NEXT_PUBLIC_TURNSTILE_SITE_KEY e
 * TURNSTILE_SECRET_KEY estão configuradas; sem elas o fluxo segue como antes,
 * protegido pelos limites por contato do banco.
 */
export function turnstileEnabled() {
  return Boolean(
    process.env.TURNSTILE_SECRET_KEY &&
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );
}

export async function verifyTurnstile(formData: FormData) {
  if (!turnstileEnabled()) return true;
  const token = String(formData.get("cf-turnstile-response") ?? "");
  if (!token) return false;
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY as string,
    response: token,
  });
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body, cache: "no-store" },
    );
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.error("[turnstile] falha ao validar", error);
    return false;
  }
}
