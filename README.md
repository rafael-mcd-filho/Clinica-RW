# Hi Clinic

SaaS multi-tenant para gestao clinica, seguindo o plano em [Plano de Implantacao por Fases](Plano%20de%20Implanta%C3%A7%C3%A3o%20por%20Fases.md).

## Requisitos

- Node.js 22 ou superior
- npm 10 ou superior
- Supabase CLI para executar migrations localmente

## Setup local

```bash
npm install
cp .env.example .env
cp .env apps/web/.env.local
npm run dev
```

O app web roda em `http://localhost:3000`.

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run check
npm run seed:demo-patients -- --organization-id UUID_DA_EMPRESA
npm run seed:demo-agenda -- --organization-id UUID_DA_EMPRESA
npm run seed:demo-clinical -- --organization-id UUID_DA_EMPRESA
npm run seed:demo-documents -- --organization-id UUID_DA_EMPRESA
npm run seed:demo-finance -- --organization-id UUID_DA_EMPRESA
```

## Primeiro Super Admin

Depois de configurar `.env`, crie o operador unico do SaaS:

```bash
npm run bootstrap:super-admin -- --email voce@exemplo.com --password "senha-forte" --name "Seu Nome"
```

Depois acesse `http://localhost:3000/login`.

O Super Admin e unico na plataforma. Admins de clinica serao usuarios vinculados a uma empresa.

## Estrutura

```text
apps/web          Aplicacao Next.js
docs/fase-0      Artefatos executaveis da Fase 0
docs/operacao    Ambientes e observabilidade
supabase         Configuracao e migrations do banco
```

## Fase atual

- Fases 0 a 9: implementadas.
- Marco MVP clinico-operacional: pronto para validacao em piloto controlado.
- Fase 10: agenda online publica, acompanhamento por token e controles de
  abuso iniciais implementados; ainda faltam conta autenticada do paciente,
  portal completo e envio real/captcha.
- Fase 11: eventos, jobs, templates e motor essencial de automacoes
  implementados; validar localmente com os testes SQL.
- Proximo avanco sugerido: fechar o portal autenticado da Fase 10 ou iniciar
  a Fase 12 (Kanban de pacientes e funis).
- Validacao local adicional: executar `npx supabase test db` com Docker Desktop
  ativo.

Consulte [o checklist das Fases 0 a 9](docs/fases-0-a-9-checklist.md).
