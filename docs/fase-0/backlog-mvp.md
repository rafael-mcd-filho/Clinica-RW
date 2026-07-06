# Backlog Priorizado do MVP

## Escopo fechado do MVP

O MVP cobre as Fases 1 a 9 do plano:

- fundacao tecnica;
- multi-tenant, autenticacao, permissoes e auditoria;
- design system, shell e navegacao;
- cadastros e configuracoes base;
- pacientes e CRM base;
- agenda interna;
- atendimento e prontuario MVP;
- prescricoes e documentos clinicos basicos;
- financeiro operacional.

Ficam fora do MVP inicial: IA, TISS completo, certificacao SBIS, ICP-Brasil completo, telemedicina, API publica, Google Calendar bidirecional, marketing avancado, Kanban completo e automacoes complexas.

## Personas prioritarias

| Persona             | Objetivo principal                               | Deve conseguir no MVP                                                                               |
| ------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Profissional solo   | Operar agenda, atendimento e recebimento sozinho | configurar conta, cadastrar paciente, atender, emitir documento e registrar pagamento               |
| Recepcionista       | Controlar agenda e fluxo do dia                  | cadastrar paciente, agendar, reagendar, cancelar, fazer check-in/check-out e receber pagamento      |
| Admin da clinica    | Configurar operacao e acompanhar riscos          | gerenciar usuarios, unidades, profissionais, procedimentos, permissoes, logs e financeiro           |
| Medico/profissional | Atender com seguranca clinica                    | ver agenda propria, abrir atendimento, preencher rascunho, finalizar prontuario e emitir documentos |
| Super admin unico   | Operar o SaaS                                    | criar tenant, suspender/reativar tenant, impersonar com auditoria e ver logs operacionais           |

## Jornadas criticas

1. Primeiro acesso
   - Super admin cria tenant e admin owner.
   - Admin owner acessa a plataforma e completa configuracao minima.
   - Sistema cria perfis padrao e agenda inicial.

2. Cadastro de paciente
   - Usuario autorizado cria paciente com dados pessoais, contato, consentimento LGPD e dados clinicos permanentes.
   - Sistema registra auditoria e aplica escopo do tenant.

3. Criacao de agenda
   - Admin configura unidade, profissional, procedimento e horario.
   - Agenda fica disponivel apenas para usuarios com permissao e escopo.

4. Marcacao de consulta
   - Recepcionista seleciona paciente, profissional, procedimento, horario e convenio/particular.
   - Sistema valida conflito, disponibilidade, escopo e gera registro auditavel.

5. Atendimento
   - Profissional abre consulta da agenda.
   - Sistema cria atendimento em rascunho vinculado a paciente, profissional, template e agendamento.

6. Finalizacao de prontuario
   - Profissional finaliza atendimento.
   - Registro finalizado fica imutavel, mantendo snapshot do template usado.
   - Qualquer ajuste posterior entra como adendo.

7. Recebimento
   - Consulta particular gera conta a receber.
   - Recepcionista ou financeiro registra pagamento.
   - Admin acompanha pendencias e fluxo de caixa basico.

## Backlog por prioridade

### P0 - Obrigatorio para piloto

| Item                               | Fase | Resultado esperado                           |
| ---------------------------------- | ---: | -------------------------------------------- |
| Monorepo com app web, scripts e CI |    1 | projeto sobe localmente e build passa        |
| Variaveis de ambiente padronizadas |    1 | `.env.example` documenta configuracao minima |
| Supabase local/cloud preparado     |    1 | migrations versionadas e reproduziveis       |
| Modelo multi-tenant com RLS        |    2 | dados isolados por `organization_id`         |
| Auth e sessao                      |    2 | login, logout e recuperacao de senha         |
| Perfis, permissoes e escopos       |    2 | autorizacao por acao e recurso               |
| Auditoria base                     |    2 | acoes sensiveis geram log                    |
| Shell autenticado                  |    3 | navegacao principal por area e perfil        |
| Cadastros base minimos             |    4 | tenant novo consegue configurar operacao     |
| Pacientes                          |    5 | paciente pode ser cadastrado e encontrado    |
| Agenda interna                     |    6 | recepcao opera o dia de agenda               |
| Prontuario MVP                     |    7 | medico registra, salva rascunho e finaliza   |
| Documentos PDF simples             |    8 | atestado, prescricao simples e solicitacao   |
| Financeiro operacional             |    9 | consulta gera cobranca e pagamento           |

### P1 - Necessario logo apos piloto inicial

| Item                                   | Fase | Resultado esperado                             |
| -------------------------------------- | ---: | ---------------------------------------------- |
| Dashboard por perfil                   |    3 | usuarios veem indicadores basicos relevantes   |
| Busca e filtros avancados de pacientes |    5 | operacao encontra registros com rapidez        |
| Bloqueios, folgas e lista de espera    |    6 | agenda cobre excecoes reais do dia             |
| Anexos clinicos basicos                |    7 | exames e arquivos ficam vinculados ao paciente |
| Recibos simples                        |    9 | comprovante pode ser gerado apos pagamento     |
| Relatorios operacionais basicos        |   13 | admin valida ocupacao e no-show no piloto      |

### P2 - Pos-MVP controlado

| Item                                  | Fase | Resultado esperado                                         |
| ------------------------------------- | ---: | ---------------------------------------------------------- |
| Agenda online e portal do paciente    |   10 | paciente agenda com regras publicas                        |
| Eventos, jobs e automacoes essenciais |   11 | lembretes e cobrancas rodam com historico                  |
| Kanban de pacientes                   |   12 | funis de leads/tratamento entram no fluxo                  |
| Marketing e relacionamento            |   14 | campanhas respeitam opt-out                                |
| Integracoes prioritarias              |   15 | WhatsApp, gateway e Google Calendar entram por adaptadores |
| TISS                                  |   16 | faturamento de convenio vira projeto proprio               |
| ICP-Brasil e maturidade regulatoria   |   17 | assinatura e retencao ganham validade formal               |
| IA e telemedicina                     |   18 | recursos avancados entram apos prontuario maduro           |
| Billing SaaS e escala                 |   19 | plataforma opera planos, limites e cobranca recorrente     |

## Itens explicitamente congelados

- IA no prontuario.
- TISS completo.
- Certificacao SBIS.
- Assinatura ICP-Brasil completa.
- Telemedicina.
- API publica.
- Google Calendar bidirecional.
- Marketing avancado.
- Kanban completo.
- Automacoes customizadas complexas.
