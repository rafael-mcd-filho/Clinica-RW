import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança em todas as respostas (Raio-X S10).
 *
 * A CSP fica nas diretivas que não dependem de nonce: impedir que outro site
 * embuta o sistema (clickjacking), trocar a base dos links e enviar
 * formulários para fora. Restringir scripts exige nonce por requisição no
 * proxy e vem num passo separado.
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Microfone só para gravar áudio no atendimento do WhatsApp.
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)",
  },
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Fonte Unicode dos PDFs clínicos (Raio-X E13): as rotas que geram PDF
  // leem o arquivo de public/ no servidor, então ele vai junto da função.
  outputFileTracingIncludes: {
    "/documentos/**": ["./public/fonts/pdf/*.ttf"],
    "/(app)/documentos/**": ["./public/fonts/pdf/*.ttf"],
    "/d/**": ["./public/fonts/pdf/*.ttf"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // O link de acompanhamento do agendamento leva um token na URL: nada
      // de enviá-lo como referência para sites de fora.
      {
        source: "/agendar/acompanhar/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Accommodates a logo up to 2 MB plus multipart/form-data overhead.
      bodySizeLimit: "3mb",
    },
    // Phosphor exporta milhares de ícones a partir de um único barrel.
    // Sem isso, importar de "@phosphor-icons/react" tende a puxar muito
    // mais módulo do que o usado, inflando o JS e a hidratação em ~65
    // arquivos. (@tremor/react e recharts já são otimizados por padrão.)
    optimizePackageImports: ["@phosphor-icons/react"],
    // Reaproveita por 30s o payload de páginas já visitadas (client
    // router cache): alternar entre telas recentes vira transição
    // instantânea. Mutações via Server Actions com revalidatePath/Tag
    // continuam invalidando na hora. `static` limita a 60s o frescor do
    // prefetch completo dos links do menu (default seriam 5min — velho
    // demais para um sistema multiusuário); hover re-prefetcha ao expirar.
    staleTimes: {
      dynamic: 30,
      static: 60,
    },
    // Persiste o cache do Turbopack também para `next build` (builds
    // sucessivos bem mais rápidos em `npm run build`/`check`). O cache de
    // dev já é padrão desde o Next 16.1. Flag experimental para builds:
    // se algo estranho aparecer num build, remova esta linha e apague
    // .next para invalidar o cache.
    turbopackFileSystemCacheForBuild: true,
  },
};

export default nextConfig;
