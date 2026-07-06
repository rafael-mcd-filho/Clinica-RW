# Web

Aplicacao Next.js do Hi Clinic.

## Scripts

Execute pela raiz do monorepo:

```bash
cp .env apps/web/.env.local
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

Ou diretamente neste workspace:

```bash
npm --workspace web run dev
```

## Estrutura inicial

- `src/app`: rotas e layout do App Router.
- `src/components/ui`: componentes base reutilizaveis.
- `src/lib`: utilitarios, Supabase e autorizacao.
- `src/db/schema.ts`: entrada do schema Drizzle.
