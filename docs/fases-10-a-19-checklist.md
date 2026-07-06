# Checklist das Fases 10 a 19

## Fase 10 - Agenda Online e Portal do Paciente

- [x] Configuracao por empresa para habilitar/desabilitar agendamento online
- [x] Slug publico por empresa para rota `/agendar/[slug]`
- [x] Pagina publica inicial de solicitacao de agendamento
- [x] Calculo de horarios publicos a partir de disponibilidade, bloqueios,
      agendamentos e solicitacoes pendentes
- [x] Consentimento LGPD obrigatorio no envio publico
- [x] Solicitacoes online protegidas por RLS, sem leitura anonima
- [x] Confirmacao interna cria paciente, consentimento e agendamento em transacao
- [x] Triagem interna de solicitacoes pendentes na agenda
- [x] Token publico secreto para acompanhamento da solicitacao
- [x] Cancelamento pelo paciente respeitando antecedencia configurada
- [x] Remarcacao pelo paciente enquanto a solicitacao ainda esta pendente
- [x] Limite configuravel de solicitacoes por contato em 24h
- [x] Bloqueio configuravel por historico recente de faltas
- [x] Verificacao opcional de contato por codigo antes do envio publico
- [x] Teste SQL inicial de isolamento e fluxo anonimo/autenticado
- [ ] Conta autenticada do paciente
- [ ] Confirmacao por e-mail e/ou telefone
- [ ] Portal do paciente com agendamentos, documentos, dados pessoais e preferencias
- [ ] Anti-abuso complementar: captcha e envio real de codigo por provedor

## Fase 11 - Eventos, Jobs e Automacoes Essenciais

- [x] Event log interno
- [x] Fila de jobs
- [x] Motor simples de gatilho, condicao e acao
- [x] Templates essenciais de confirmacao, lembretes, NPS e cobranca
- [x] Variaveis de mensagem
- [x] Janela de envio
- [x] Opt-out
- [x] Historico de execucoes
- [x] Tratamento de falhas e retentativas

## Fase 12 - Kanban de Pacientes e Funis

- [x] Funis configuraveis (etapas com cor, tipo e limite de WIP)
- [x] Templates de funil (5 presets do documento de especificacao, aplicados
      na criacao e editaveis antes de salvar)
- [x] Cards vinculados a pacientes (1 card ativo por paciente por funil)
- [x] Drag-and-drop entre etapas (@dnd-kit, com atualizacao otimista e
      realtime via Supabase)
- [x] Historico de movimentacoes (tabela append-only + timeline no painel do
      card)
- [x] Painel lateral do card (ficha do paciente, timeline, notas internas,
      atalho para agenda)
- [x] Metricas por etapa: contagem, limite de WIP, card estagnado, conversao
      por etapa e tempo medio calculados a partir de `funnel_card_movements`
- [x] Integracao inicial com agenda, prontuario, financeiro e automacoes —
      card linka para a ficha do paciente e agenda; movimentacao de etapa
      emite evento `kanban.card_moved` que a Fase 11 ja consegue consumir;
      integracao com financeiro fica para quando o modulo de funis tiver
      cards com natureza comercial mais definida

## Fase 13 - Relatorios e BI Inicial

- [x] Relatorios operacionais
- [x] Relatorios financeiros
- [x] Relatorios clinicos basicos
- [x] Relatorios por profissional
- [x] Filtros por periodo, profissional, unidade, convenio e procedimento
- [x] Exportacao Excel e PDF
- [x] Controle de permissao por tipo de relatorio

## Fases 14 a 19

- [ ] Marketing e relacionamento
- [ ] Integracoes prioritarias
- [ ] TISS, convenios avancados e glosas
- [ ] Assinatura digital, ICP-Brasil e maturidade regulatoria
- [ ] IA, telemedicina e recursos clinicos avancados
  - [ ] Documentacao clinica assistida por IA, no estilo scribe/ambient
        listening: escutar ou transcrever a consulta e preencher secoes do
        prontuario com base em prompts configuraveis por modelo
  - [ ] Modelos clinicos com secoes, tipos de campo e instrucoes por secao para
        orientar o preenchimento automatico
  - [ ] Revisao e confirmacao obrigatoria pelo profissional antes de salvar ou
        assinar qualquer conteudo gerado por IA
  - [ ] Consentimento, trilha de auditoria, controle de retencao de audio/texto
        e regras de seguranca/LGPD para uso de IA em atendimento
- [ ] Escala, billing e operacao SaaS

## Validacao

- Aplicacao: `npm run check`.
- Banco: aplicar migrations e executar `npx supabase test db`, incluindo
  `phase10_online_booking_rls.sql`, `phase11_events_jobs_notifications.sql`,
  `phase12_kanban_funnel.sql` e `phase13_reports_rls.sql`.
- Demo: `npm run seed:demo-funnels -- --organization-id UUID` cria o "Funil
  Comercial" com cards para os pacientes demo existentes.
- Fluxo manual: habilitar agendamento online em `/agenda`, abrir
  `/agendar/[slug]`, enviar solicitacao, abrir o link de acompanhamento,
  remarcar/cancelar quando aplicavel e confirmar pela agenda interna.
