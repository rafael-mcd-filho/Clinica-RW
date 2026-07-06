# Decisoes Tecnicas Iniciais

## Decisoes fechadas para iniciar

| Tema              | Decisao                                       | Motivo                                                                                   |
| ----------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Estrutura         | Monorepo com npm workspaces                   | permite evoluir web, banco e pacotes compartilhados sem multiplos repositorios no inicio |
| Frontend          | Next.js com App Router, TypeScript e Tailwind | combina SSR, rotas protegidas, app shell e produtividade no MVP                          |
| UI                | shadcn/ui, Radix primitives e lucide-react    | componentes acessiveis, customizaveis e alinhados ao design system proprio               |
| Banco             | Supabase/Postgres                             | RLS, auth, storage e realtime reduzem complexidade operacional inicial                   |
| Multi-tenancy     | `organization_id` + RLS em tabelas sensiveis  | isolamento deve ser garantido tambem pelo banco                                          |
| ORM/query builder | Drizzle                                       | SQL tipado, boa convivencia com Postgres/RLS e migrations explicitas                     |
| Validacao         | Zod                                           | contratos compartilhaveis entre forms, server actions e APIs                             |
| Forms             | React Hook Form                               | bom desempenho e integracao direta com Zod                                               |
| Estado servidor   | TanStack Query                                | cache, invalidacao, optimistic updates e paginacao                                       |
| Estado cliente    | Zustand                                       | simples para preferencias locais e estado de shell                                       |
| Datas             | date-fns e date-fns-tz                        | manipulacao leve e explicita de timezone                                                 |
| Calendario        | FullCalendar MIT no MVP                       | cobre agenda diaria/semanal/lista sem assumir custo Premium                              |
| Testes            | Vitest e Playwright                           | unitarios rapidos e e2e para fluxos criticos                                             |
| CI                | GitHub Actions                                | lint, typecheck, testes e build por pull request                                         |
| Observabilidade   | Sentry ou equivalente                         | rastreamento de erros desde o piloto                                                     |
| Regiao de dados   | preferir Brasil/Sao Paulo quando disponivel   | reduz risco contratual e latencia para dados sensiveis                                   |

## Decisoes pendentes controladas

| Tema                    | Direcao inicial                                                          | Quando decidir                                                           |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Provedor WhatsApp       | criar adaptador; avaliar Meta Cloud API e provedores brasileiros         | antes da Fase 11                                                         |
| Gateway de pagamento    | criar camada de interface; avaliar Asaas/Pagar.me/Mercado Pago           | antes de links de pagamento e billing SaaS                               |
| Impersonacao            | iniciar com acesso livre auditado por super admin                        | revisar antes do piloto pago                                             |
| Backup e retencao       | backup diario, retencao minima de 30 dias; prontuario com politica longa | detalhar na Fase 1 e revisar na Fase 17                                  |
| Especialidades iniciais | iniciar com template livre e modelos genericos                           | antes da Fase 7                                                          |
| Documentos do MVP       | prescricao simples, solicitacao de exame, atestado e declaracao          | confirmar no inicio da Fase 8                                            |
| FullCalendar Premium    | evitar no MVP                                                            | reavaliar se colunas por recurso virarem bloqueio operacional            |
| NestJS separado         | nao criar no inicio                                                      | reavaliar quando jobs, webhooks ou integracoes exigirem backend dedicado |

## Padroes arquiteturais

- Toda regra sensivel deve existir em duas camadas: aplicacao e banco.
- Server Components podem ler dados; mutacoes devem passar por server actions ou route handlers com autorizacao explicita.
- Nenhuma query de modulo operacional deve omitir filtro/escopo de organizacao.
- `audit_logs` nao deve armazenar payload clinico completo; usar metadados minimizados e mascarados.
- Integracoes externas entram por adaptadores, nunca acopladas diretamente a telas ou entidades centrais.
- Conteudo clinico finalizado e append-only: adendos corrigem ou complementam.
