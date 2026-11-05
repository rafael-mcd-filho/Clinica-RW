"use client";

import Script from "next/script";

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** Widget do captcha dentro do formulário: o script da Cloudflare injeta o
    campo `cf-turnstile-response`, conferido no servidor. Sem a chave
    configurada, não renderiza nada. */
export function TurnstileWidget() {
  if (!siteKey) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div
        className="cf-turnstile min-h-[65px]"
        data-sitekey={siteKey}
        data-language="pt-br"
        data-size="flexible"
      />
    </>
  );
}
