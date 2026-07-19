import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
