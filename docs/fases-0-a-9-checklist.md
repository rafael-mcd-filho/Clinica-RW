# Checklist das Fases 0 a 9

## Fase 0 - Alinhamento

- [x] Escopo fechado do MVP
- [x] Personas prioritarias
- [x] Jornadas criticas
- [x] Mapa de entidades
- [x] Decisoes tecnicas
- [x] Criterios de aceite

## Fase 1 - Fundacao tecnica

- [x] Monorepo com npm workspaces
- [x] Frontend Next.js, TypeScript e Tailwind
- [x] Supabase configurado e migrations versionadas
- [x] CI com lint, typecheck, testes e build
- [x] Variaveis de ambiente documentadas
- [x] Plano de ambientes local, staging e producao
- [x] Logging estruturado e captura basica de erros
- [x] Decisao registrada: API NestJS separada permanece adiada ate existir job,
      webhook ou integracao que justifique o processo dedicado

## Fase 2 - Seguranca multi-tenant

- [x] Entidades de identidade, permissao, escopo e auditoria
- [x] Login, logout, sessao e recuperacao de senha
- [x] Empresa e Admin Owner
- [x] Super Admin unico com gestao basica de empresas
- [x] RLS nas tabelas multi-tenant da fase
- [x] Helpers de tenant e permissao
- [x] Impersonacao com cookie HTTP-only, banner e log
- [x] Tela de auditoria para Super Admin e admin da empresa
- [x] Teste SQL de isolamento entre duas empresas

## Fase 3 - Design system e navegacao

- [x] Tokens visuais
- [x] Componentes base
- [x] Sidebar fixavel e drawer responsivo
- [x] Estado ativo e breadcrumbs
- [x] Engrenagem para configuracoes
- [x] Menus filtrados por permissao
- [x] Dashboard inicial por contexto
- [x] Toasts, tooltips, loaders e estados vazios

## Fase 4 - Cadastros e configuracoes base

- [x] Dados institucionais e preferencias da clinica
- [x] Unidades, salas e equipamentos
- [x] Especialidades e profissionais
- [x] Procedimentos e precos base
- [x] Convenios e tabelas de preco simples
- [x] Horarios gerais de funcionamento
- [x] Modo automatico solo ou clinica
- [x] Onboarding minimo com criterio de conclusao
- [x] RLS, chaves compostas de tenant e auditoria
- [x] Teste SQL de isolamento e regras da fase

## Fase 5 - Pacientes e CRM base

- [x] Cadastro, edicao, busca e filtros de pacientes
- [x] Dados pessoais, contato, endereco e preferencias de comunicacao
- [x] Resumo clinico permanente com acesso protegido
- [x] Consentimentos LGPD com aceite e revogacao
- [x] Tags simples e segmentacao
- [x] Arquivamento logico e restauracao
- [x] Ficha preparada para agenda, prontuario, documentos e financeiro
- [x] Indicadores reais de pacientes no dashboard
- [x] Seed demonstrativo por empresa
- [x] RLS, chaves compostas, auditoria e teste de isolamento

## Fase 6 - Agenda interna e fluxo da recepção

- [x] Visualizações diária, semanal e lista
- [x] Criação e remarcação de agendamentos
- [x] Fluxo de confirmação, check-in, atendimento, falta e cancelamento
- [x] Filtros por profissional, unidade, especialidade, convênio, procedimento e status
- [x] Agendas por profissional e unidade
- [x] Disponibilidade recorrente e duração por procedimento
- [x] Prevenção de conflito por profissional e sala
- [x] Bloqueios, folgas e encaixes com permissão específica
- [x] Fila de espera simples
- [x] Histórico consistente de mudanças de status
- [x] Atualização via Supabase Realtime
- [x] RLS, chaves compostas e teste de isolamento

## Fase 7 - Atendimento e Prontuário MVP

- [x] Templates clínicos e versões imutáveis
- [x] Template livre inicial por empresa
- [x] Builder simples de templates
- [x] Atendimento em rascunho vinculado a paciente, profissional e template
- [x] Vínculo opcional com agendamento
- [x] Snapshot do template usado no atendimento
- [x] Campos estruturados, notas livres e CID inicial
- [x] Finalização imutável
- [x] Adendos append-only em atendimento finalizado
- [x] Tela de atendimento com painel do paciente e ficha central
- [x] Seed demonstrativo de prontuários
- [x] RLS de conteúdo clínico por escopo e teste SQL

## Fase 8 - Prescricoes e Documentos Clinicos Basicos

- [x] Modelos reutilizaveis por empresa
- [x] Prescricao simples
- [x] Solicitacao de exames
- [x] Atestado
- [x] Declaracao de comparecimento
- [x] Documento vinculado a atendimento, paciente e profissional
- [x] Documento emitido imutavel
- [x] Historico de documentos na ficha do paciente
- [x] Geracao de PDF com identificacao da clinica e profissional
- [x] Auditoria de emissao
- [x] Seed demonstrativo de documentos
- [x] RLS por escopo clinico e teste SQL

## Fase 9 - Financeiro Operacional

- [x] Contas a receber geradas a partir de agendamentos
- [x] Recebimento no caixa
- [x] Formas de pagamento padrao
- [x] Recibo PDF
- [x] Pendencias financeiras na ficha do paciente
- [x] Contas a pagar
- [x] Baixa de contas a pagar
- [x] Fluxo de caixa basico no painel financeiro
- [x] Categorias financeiras simples
- [x] Repasse profissional simples gerado por pagamento
- [x] Auditoria financeira
- [x] Seed demonstrativo de financeiro
- [x] RLS por escopo financeiro e teste SQL

## Validacao de ambiente

- Aplicacao: `npm run check`.
- Banco: aplicar as migrations e executar os testes SQL das Fases 4, 5, 6, 7,
  8 e 9.
- Demo: executar `npm run seed:demo-patients -- --organization-id UUID`.
- Demo complementar: executar `npm run seed:demo-agenda`,
  `npm run seed:demo-clinical`, `npm run seed:demo-documents` e
  `npm run seed:demo-finance`.
- Fluxo: validar pacientes, agenda e atendimento clínico em desktop, tablet e
  mobile.

## Continuidade

- As Fases 10 a 19 agora estao acompanhadas em
  `docs/fases-10-a-19-checklist.md`.
