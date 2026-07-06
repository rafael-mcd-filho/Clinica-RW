# Roteiro de Implementacao - Fases 1 a 3

## Fase 1 - Fundacao tecnica

### Objetivo

Criar um projeto executavel, testavel e pronto para receber o nucleo multi-tenant.

### Entregas

- Monorepo com npm workspaces.
- App web Next.js com TypeScript, Tailwind, ESLint e App Router.
- Estrutura inicial de pacotes compartilhados.
- Estrutura `supabase/` com migrations versionadas.
- `.env.example` com variaveis obrigatorias.
- Scripts: `dev`, `build`, `lint`, `typecheck`, `test`.
- CI no GitHub Actions.
- README com setup local.
- Preparacao para Sentry/logging estruturado.

### Ordem de execucao

1. Inicializar repositorio e workspace.
2. Criar app web.
3. Padronizar scripts e ambiente.
4. Adicionar estrutura Supabase.
5. Adicionar CI.
6. Validar lint, typecheck e build.

### Pronto quando

- `npm install` conclui sem erro.
- `npm run dev` sobe o app web.
- `npm run build`, `npm run lint` e `npm run typecheck` passam.
- Existe documentacao minima para outro desenvolvedor rodar o projeto.

## Fase 2 - Multi-tenant, autenticacao, permissoes e auditoria

### Objetivo

Construir o nucleo de seguranca antes dos modulos de negocio.

### Entregas

- Migrations de `organizations`, `app_users`, `profiles`, `permissions`, `profile_permissions`, `user_profiles`, `user_permission_overrides`, `resource_scopes`, `audit_logs` e `impersonation_sessions`.
- Seed do catalogo inicial de permissoes.
- RLS nas tabelas da fase.
- Helpers de tenant, usuario atual, permissao e escopo.
- Login/logout via Supabase Auth.
- Criacao de tenant e owner.
- Painel inicial de super admin.
- Auditoria de acoes sensiveis.
- Testes de isolamento por tenant.

### Ordem de execucao

1. Criar migrations e policies base.
2. Criar seed de permissoes e perfis padrao.
3. Implementar cliente Supabase server/browser.
4. Implementar auth pages e middleware.
5. Implementar helpers de autorizacao.
6. Criar testes de RLS.
7. Criar fluxo minimo de tenant e owner.

### Pronto quando

- Usuario autenticado acessa apenas o proprio tenant.
- Usuario sem permissao recebe 403.
- Super admin impersona com banner e log.
- Admin do tenant ve logs da propria organizacao.

## Fase 3 - Design system, shell e navegacao

### Objetivo

Criar a estrutura visual e de navegacao que sustentara os modulos.

### Entregas

- Tokens de cor, tipografia, espacamento, raio, sombra e estados.
- Componentes base com shadcn/ui.
- Layout autenticado com header, sidebar, breadcrumbs e area de configuracoes.
- Menus por permissao e plano.
- Dashboard inicial por perfil.
- Responsividade desktop, tablet e mobile.
- Toasts, tooltips, loaders e estados vazios.

### Ordem de execucao

1. Definir tokens em CSS/Tailwind.
2. Instalar e configurar componentes base.
3. Criar layout autenticado.
4. Criar modelo de navegacao por permissao.
5. Criar dashboard inicial.
6. Verificar responsividade com Playwright.

### Pronto quando

- Menus respeitam permissoes.
- Layout nao quebra em resolucoes comuns.
- Area de configuracoes fica acessivel pela engrenagem.
- Componentes seguem o mesmo padrao visual.
