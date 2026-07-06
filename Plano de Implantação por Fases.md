# Plano de Implantação por Fases

> Documento derivado de `Instruções de Desenvolvimento.md`.
> Este arquivo não substitui nem altera o plano original. Ele organiza a execução em fases para transformar a especificação em um produto implantável.

---

## Parecer sobre o plano atual

O plano de desenvolvimento está tecnicamente forte e cobre bem os grandes pilares de um SaaS clínico: multi-tenant, permissões granulares, agenda, prontuário, financeiro, CRM, automações, relatórios, integrações e requisitos regulatórios.

O ponto principal é que o documento descreve um produto maduro, não apenas um MVP. Se tentarmos construir tudo de uma vez, o risco de atraso e retrabalho é alto. A implantação precisa separar claramente:

1. **Fundação obrigatória:** arquitetura, autenticação, multi-tenancy, RLS, auditoria, permissões e design system.
2. **MVP operacional:** cadastros, pacientes, agenda interna, atendimento, prontuário, documentos básicos e financeiro essencial.
3. **Camada de crescimento:** agenda online, portal do paciente, automações, marketing, funis e relatórios.
4. **Módulos avançados:** TISS, ICP-Brasil, IA, telemedicina, integrações profundas e certificações.

A decisão mais importante é tratar segurança, isolamento de tenant e auditoria como parte da primeira entrega, não como melhoria futura. Em sistema de saúde, corrigir isso depois tende a ser caro e arriscado.

---

## Princípios de execução

1. **Multi-tenant desde o primeiro schema.**
   Toda tabela sensível deve nascer com `organization_id`, RLS e testes de isolamento.

2. **Auditoria desde a primeira ação relevante.**
   Acessos, alterações clínicas, impersonação, alterações financeiras e integrações precisam gerar trilha de auditoria.

3. **MVP não é o produto inteiro.**
   O MVP deve provar a operação clínica diária: cadastrar paciente, agendar, atender, registrar prontuário, emitir documento e registrar pagamento.

4. **Módulos dependentes só entram após a base estar estável.**
   Automações dependem de eventos confiáveis. Relatórios dependem de dados consistentes. Agenda online depende da agenda interna. TISS depende do financeiro e dos convênios.

5. **Compliance é trilho de arquitetura, não checklist final.**
   LGPD, CFM, retenção, consentimento, acesso mínimo necessário e logs devem orientar decisões de banco, API e UI.

6. **Cada fase termina com demonstração funcional.**
   Não considerar uma fase pronta apenas por ter telas. Ela precisa ter fluxo completo, regras de permissão, testes mínimos e dados persistidos corretamente.

---

## Recorte recomendado do MVP

O MVP recomendado deve conter:

- Criação e gestão de tenants.
- Usuários, perfis, permissões e escopos básicos.
- Modo solo e modo clínica.
- Cadastros base: unidades, salas, profissionais, procedimentos e convênios simples.
- Pacientes com dados pessoais, dados clínicos permanentes e consentimentos.
- Agenda interna com agendamento, reagendamento, cancelamento, bloqueios, check-in e check-out.
- Prontuário com template livre, rascunho, finalização imutável, adendo e snapshot de template.
- Prescrições e documentos simples em PDF, ainda sem ICP-Brasil no MVP.
- Financeiro básico: contas a receber, recebimento, contas a pagar, vínculo com consulta e repasse simples.
- Logs, auditoria, backups, RLS e testes críticos.

Ficar fora do MVP inicial:

- IA no prontuário.
- TISS completo.
- Certificação SBIS.
- Assinatura ICP-Brasil completa.
- Telemedicina.
- API pública.
- Google Calendar bidirecional.
- Marketing avançado.
- Kanban completo.
- Automações customizadas complexas.

---

## Fase 0 — Alinhamento e Decisões de Produto

**Objetivo:** transformar a especificação ampla em backlog executável.

**Entregas:**

- Definição do escopo fechado do MVP.
- Lista de módulos pós-MVP.
- Personas prioritárias: profissional solo, recepcionista, admin da clínica e médico.
- Jornadas críticas validadas:
  - primeiro acesso;
  - cadastro de paciente;
  - criação de agenda;
  - marcação de consulta;
  - atendimento;
  - finalização de prontuário;
  - recebimento.
- Decisão sobre stack final: Next.js, NestJS, Supabase, ORM, fila e provedor de deploy.
- Decisão inicial sobre região de dados, backup, monitoramento e política de logs.
- Definição de critérios de aceite para MVP.

**Critérios de pronto:**

- Backlog priorizado por fase.
- Mapa de entidades validado.
- Decisões técnicas registradas.
- Riscos regulatórios conhecidos.

---

## Fase 1 — Fundação Técnica

**Objetivo:** criar a base do projeto antes dos módulos de negócio.

**Entregas:**

- Repositório estruturado.
- Setup de frontend com Next.js, TypeScript, Tailwind e shadcn/ui.
- Setup de backend/API com TypeScript.
- Projeto Supabase configurado.
- Migrations versionadas.
- Ambiente local, staging e produção planejados.
- CI com lint, typecheck, testes e build.
- Padrão de variáveis de ambiente.
- Sentry ou ferramenta equivalente para erros.
- Padrão de logging estruturado.

**Dependências:** nenhuma.

**Critérios de pronto:**

- Aplicação sobe localmente.
- Build automatizado passa.
- Migrações executam de forma reproduzível.
- Existe documentação mínima para rodar o projeto.

---

## Fase 2 — Multi-tenant, Autenticação, Permissões e Auditoria

**Objetivo:** implementar o núcleo de segurança e isolamento do SaaS.

**Entregas:**

- Entidades de `organizations`, `users`, `profiles`, `permissions`, `profile_permissions`, `user_profiles`, `user_permission_overrides` e `resource_scopes`.
- Catálogo inicial de permissões.
- Login, logout, recuperação de senha e sessão.
- Criação de tenant e admin owner.
- Super Admin com gestão básica de tenants.
- RLS em todas as tabelas multi-tenant criadas nessa fase.
- Middleware/helper de autorização por permissão e escopo.
- Logs de auditoria para ações sensíveis.
- Impersonação com banner fixo e log especial.
- Testes automatizados de isolamento por tenant.

**Dependências:** Fase 1.

**Critérios de pronto:**

- Usuário de uma clínica não acessa dados de outra por API nem por query direta.
- Permissões bloqueiam ações sem autorização.
- Impersonação deixa rastro auditável.
- Admin da clínica consegue ver logs relevantes da própria organização.

---

## Fase 3 — Design System, Shell e Navegação

**Objetivo:** criar a estrutura visual e de navegação que todos os módulos vão usar.

**Entregas:**

- Tokens de cor, tipografia, espaçamento, bordas e estados.
- Componentes base: botões, inputs, selects, checkboxes, radios, switches, badges, cards, modais, tabelas, tabs, toasts, tooltips e loaders.
- Header principal com áreas do sistema.
- Sidebar contextual por área.
- Área de Configurações via engrenagem.
- Breadcrumbs.
- Layout responsivo para desktop, tablet e mobile.
- Dashboard por perfil em versão inicial.
- Controle de itens ocultos/desabilitados por permissão e plano.

**Dependências:** Fase 1 e permissões básicas da Fase 2.

**Critérios de pronto:**

- Navegação principal pronta para receber módulos.
- Componentes seguem os tokens do plano original.
- Usuários com permissões diferentes veem menus coerentes.
- Layout não quebra em resoluções comuns.

---

## Fase 4 — Cadastros e Configurações Base

**Objetivo:** criar os dados estruturais usados por agenda, prontuário e financeiro.

**Entregas:**

- Dados da clínica.
- Unidades.
- Salas.
- Equipamentos.
- Profissionais.
- Especialidades.
- Procedimentos.
- Tabelas de preço simples.
- Convênios em cadastro inicial.
- Horários de funcionamento da clínica.
- Configuração de modo solo vs. modo clínica.
- Transição controlada de solo para clínica.
- Perfis padrão por tenant.

**Dependências:** Fases 2 e 3.

**Critérios de pronto:**

- Um tenant novo consegue completar o onboarding mínimo.
- Profissional solo consegue operar sem ruído de clínica multiprofissional.
- Clínica com vários profissionais consegue configurar unidade, sala, profissionais e procedimentos.

---

## Fase 5 — Pacientes e CRM Base

**Objetivo:** construir a ficha do paciente como entidade central do sistema.

**Entregas:**

- Cadastro de paciente com dados pessoais, contato, endereço, CPF e dados fiscais básicos.
- Resumo clínico permanente: alergias, comorbidades, medicações, antecedentes, hábitos e contato de emergência.
- Preferências de comunicação.
- Consentimentos LGPD.
- Tags simples.
- Busca e filtros.
- Soft delete quando aplicável.
- Abas da ficha: dados pessoais, dados clínicos, histórico, documentos, financeiro, mensagens e configurações.
- Regra de acesso: recepção vê metadados, profissional autorizado vê conteúdo clínico.

**Dependências:** Fases 2, 3 e 4.

**Critérios de pronto:**

- Paciente pode ser cadastrado e encontrado.
- Dados sensíveis respeitam permissão.
- Ficha do paciente já serve de base para agenda e atendimento.
- Consentimentos ficam registrados.

---

## Fase 6 — Agenda Interna e Fluxo da Recepção

**Objetivo:** entregar a operação diária de marcação e controle de atendimentos.

**Entregas:**

- Agenda diária, semanal e lista.
- Agendamento, edição, reagendamento e cancelamento.
- Estados: agendado, confirmado, aguardando atendimento, em atendimento, atendido, faltou e cancelado.
- Filtros por profissional, unidade, especialidade, convênio, procedimento e status.
- Configurações de horário por profissional.
- Múltiplos calendários por profissional em versão inicial.
- Duração por procedimento.
- Bloqueios e folgas.
- Encaixes com permissão específica.
- Check-in e check-out.
- Lista de espera simples.
- Atualização em tempo real quando viável com Supabase Realtime.

**Dependências:** Fases 4 e 5.

**Critérios de pronto:**

- Recepcionista consegue executar o dia inteiro de agenda.
- Médico consegue ver próximos pacientes.
- Mudança de status gera registros consistentes.
- Agenda respeita escopo de usuário.

---

## Fase 7 — Atendimento e Prontuário MVP

**Objetivo:** permitir registrar o atendimento clínico com integridade histórica.

**Entregas:**

- Entidades de templates, versões de templates e atendimentos.
- Template livre obrigatório.
- Templates por especialidade em versão inicial.
- Builder simples de templates com seções e campos essenciais.
- Rascunho de atendimento.
- Finalização imutável.
- Adendo em atendimento finalizado.
- Snapshot da estrutura do template no atendimento.
- Campo `free_notes`.
- Vínculo obrigatório com paciente, profissional e versão de template.
- Vínculo opcional com agendamento.
- Tela de atendimento com painel do paciente, ficha central e ações rápidas.
- CID em versão inicial.
- Anexos clínicos básicos com Storage e policies.

**Dependências:** Fases 5 e 6.

**Critérios de pronto:**

- Médico consegue abrir paciente da agenda, preencher, salvar rascunho e finalizar.
- Atendimento finalizado não pode ser editado diretamente.
- Template alterado no futuro não muda atendimento antigo.
- Recepcionista não acessa conteúdo clínico.

---

## Fase 8 — Prescrições e Documentos Clínicos Básicos

**Objetivo:** emitir documentos vinculados ao atendimento.

**Entregas:**

- Prescrição simples sem base medicamentosa completa.
- Solicitação de exames.
- Atestado.
- Declaração de comparecimento.
- Modelos reutilizáveis.
- Geração de PDF.
- Impressão.
- Envio manual por e-mail ou link seguro, se já houver infraestrutura.
- Histórico de documentos na ficha do paciente.

**Dependências:** Fase 7.

**Critérios de pronto:**

- Todo documento está vinculado a atendimento, paciente e profissional.
- Documento emitido aparece no histórico.
- PDF gerado preserva dados essenciais e identificação do profissional.

---

## Fase 9 — Financeiro Operacional

**Objetivo:** fechar o ciclo básico da consulta até o recebimento.

**Entregas:**

- Contas a receber.
- Contas a pagar.
- Lançamento financeiro automático a partir de consulta.
- Recebimento no caixa.
- Formas de pagamento.
- Recibos simples.
- Controle de pendências financeiras do paciente.
- Fluxo de caixa básico.
- Categorias e centros de custo simples.
- Repasse médico em versão inicial.
- Auditoria financeira.

**Dependências:** Fases 6, 7 e 8.

**Critérios de pronto:**

- Consulta particular gera cobrança.
- Recepção consegue registrar pagamento.
- Admin consegue ver recebimentos e pendências.
- Profissional consegue ver repasse próprio, quando permitido.

---

## Marco 1 — MVP Clínico-operacional

Ao concluir as Fases 0 a 9, o sistema deve estar apto para piloto controlado com uma clínica parceira ou profissional solo.

**O que validar no piloto:**

- Tempo para configurar uma clínica nova.
- Tempo para cadastrar paciente e marcar consulta.
- Clareza da agenda para recepção.
- Usabilidade do prontuário para médico.
- Segurança das permissões.
- Qualidade dos documentos emitidos.
- Aderência do financeiro ao fluxo real da clínica.
- Lacunas de LGPD, auditoria e suporte.

---

## Fase 10 — Agenda Online e Portal do Paciente

**Objetivo:** abrir parte da operação para o paciente sem comprometer segurança e controle.

**Entregas:**

- Página pública por tenant.
- Fluxo de criação de conta do paciente.
- Confirmação por e-mail e/ou telefone.
- Seleção de especialidade, profissional, procedimento, convênio e horário.
- Consentimento LGPD no agendamento.
- Política de cancelamento configurável.
- Reagendamento e cancelamento dentro das regras.
- Portal do paciente com agendamentos, documentos, dados pessoais e preferências.
- Anti-abuso: captcha, limites, verificação de telefone e controle de no-show.

**Dependências:** Fases 5, 6, 8 e 9.

**Critérios de pronto:**

- Paciente consegue marcar consulta online respeitando regras da agenda.
- Clínica controla o que aparece publicamente.
- Portal não expõe conteúdo clínico indevido.

---

## Fase 11 — Eventos, Jobs e Automações Essenciais

**Objetivo:** criar a base de automações antes de campanhas e fluxos complexos.

**Entregas:**

- Event log interno.
- Fila de jobs.
- Motor simples de gatilho, condição e ação.
- Templates essenciais:
  - confirmação de agendamento;
  - lembrete 48h antes;
  - lembrete 2h antes;
  - NPS pós-consulta;
  - cobrança em atraso.
- Variáveis de mensagem.
- Janela de envio.
- Opt-out.
- Histórico de execuções.
- Tratamento de falhas e retentativas.

**Dependências:** Fases 6, 9 e infraestrutura de comunicação.

**Critérios de pronto:**

- Automação essencial executa no horário correto.
- Falhas ficam visíveis para suporte/admin.
- Paciente pode sair de comunicações não obrigatórias.

---

## Fase 12 — Kanban de Pacientes e Funis

**Objetivo:** organizar jornadas comerciais, pré-consulta, pós-consulta e tratamentos.

**Entregas:**

- Funis configuráveis.
- Templates de funil.
- Cards vinculados a pacientes.
- Tags.
- Drag-and-drop.
- Histórico de movimentações.
- Painel lateral do card.
- Conversão por etapa.
- Tempo médio por etapa.
- Cards estagnados.
- Integração inicial com agenda, prontuário, financeiro e automações.

**Dependências:** Fases 5, 6 e 11.

**Critérios de pronto:**

- Equipe consegue acompanhar leads e pacientes em tratamento.
- Movimentações geram histórico.
- Eventos do funil podem disparar automações simples.

---

## Fase 13 — Relatórios e BI Inicial

**Objetivo:** transformar dados operacionais em gestão.

**Entregas:**

- Relatórios operacionais: ocupação, no-show, tempo de espera, pacientes novos vs. recorrentes.
- Relatórios financeiros: recebimentos, inadimplência, repasse, evolução de receita.
- Relatórios clínicos básicos: CIDs, procedimentos, perfil epidemiológico.
- Relatórios por profissional.
- Filtros por período, profissional, unidade, convênio e procedimento.
- Exportação Excel e PDF.
- Controle de permissão por tipo de relatório.

**Dependências:** Fases 6, 7, 9 e 12, quando aplicável.

**Critérios de pronto:**

- Admin acessa indicadores confiáveis.
- Usuário sem permissão não acessa relatório sensível.
- Exportações refletem os filtros aplicados.

---

## Fase 14 — Marketing e Relacionamento

**Objetivo:** ampliar retenção e reativação de pacientes.

**Entregas:**

- Segmentação avançada.
- Campanhas por e-mail.
- Campanhas por WhatsApp, se provedor estiver definido.
- Templates de mensagem.
- Histórico de envios.
- NPS consolidado.
- Reativação de inativos.
- Campanhas de aniversário.
- Métricas de abertura, clique e agendamento gerado, quando o canal permitir.

**Dependências:** Fases 5, 11, 12 e 13.

**Critérios de pronto:**

- Segmento pode ser criado e usado em campanha.
- Disparos respeitam opt-out e limites.
- Resultados básicos são mensurados.

---

## Fase 15 — Integrações Prioritárias

**Objetivo:** conectar o produto com serviços externos de alto valor.

**Ordem recomendada:**

1. **WhatsApp Business:** necessário para lembretes, confirmações e automações.
2. **Gateway de pagamento:** Pix, cartão e link de pagamento.
3. **Google Agenda unidirecional sistema para Google:** menor complexidade e alto valor.
4. **Google Agenda com bloqueios Google para sistema:** útil para evitar conflitos.
5. **Memed:** prescrição eletrônica com base validada.
6. **Webhooks de saída:** integração com n8n, Zapier e sistemas externos.
7. **API pública:** apenas quando contratos e rate limit estiverem maduros.

**Dependências:** variam por integração, mas todas dependem de Fases 2, 6, 8, 9 e 11.

**Critérios de pronto:**

- Tokens e credenciais são armazenados com segurança.
- Logs de integração mascaram dados sensíveis.
- Webhooks têm retry e assinatura quando aplicável.
- Integração pode ser desativada por tenant.

---

## Fase 16 — TISS, Convênios Avançados e Glosas

**Objetivo:** implementar faturamento de convênios de forma controlada.

**Entregas:**

- Guias TISS.
- Tabelas de convênio.
- Validação de campos obrigatórios.
- Geração de lotes XML.
- Controle de envio.
- Status de pagamento por operadora.
- Gestão de glosas.
- Relatórios de convênio.
- Processo de homologação por operadora.

**Dependências:** Fases 6, 7, 9 e 13.

**Critérios de pronto:**

- Lote XML é gerado conforme padrão exigido.
- Erros são apontados antes do envio.
- Glosa vira pendência rastreável.

**Observação:** este módulo deve ser tratado como projeto próprio dentro do produto. Ele tem complexidade operacional e regulatória maior que a maioria dos outros módulos.

---

## Fase 17 — Assinatura Digital, ICP-Brasil e Maturidade Regulatória

**Objetivo:** aumentar validade jurídica e maturidade regulatória do prontuário e documentos.

**Entregas:**

- Integração com provedor ICP-Brasil.
- Assinatura de prontuário, prescrição, atestado, laudo e solicitação.
- Suporte a certificado em nuvem.
- Avaliação de certificado A3, se necessário.
- Política de retenção formal.
- Rotina de exportação legal do prontuário.
- Plano de preparação para SBIS.
- Revisão de termos, política de privacidade e contratos.

**Dependências:** Fases 2, 7 e 8.

**Critérios de pronto:**

- Documento assinado tem cadeia de validação.
- Registro assinado não pode ser alterado sem adendo.
- Fluxos regulatórios estão documentados.

---

## Fase 18 — IA, Telemedicina e Recursos Clínicos Avançados

**Objetivo:** adicionar diferenciais competitivos depois da base clínica estar estável.

**Entregas:**

- Transcrição de áudio.
- Sumarização clínica.
- Preenchimento assistido do prontuário.
- Busca conversacional no histórico clínico.
- Teleconsulta.
- Curvas clínicas especializadas.
- Body map, antes/depois e imagens especializadas.
- Recursos por especialidade priorizados conforme demanda real.

**Dependências:** Fases 7, 8 e 11. Recursos que exigirem assinatura ou validade jurídica dependem também da Fase 17.

**Critérios de pronto:**

- IA deixa claro o que foi gerado automaticamente.
- Médico revisa e confirma antes de finalizar.
- Dados clínicos usados por IA seguem política de privacidade e segurança.
- Teleconsulta gera registro no atendimento.

---

## Fase 19 — Escala, Billing e Operação SaaS

**Objetivo:** preparar crescimento comercial e operação da plataforma.

**Entregas:**

- Planos e limites por tenant.
- Cobrança recorrente do SaaS.
- Feature flags por cliente.
- Métricas SaaS: MRR, ARR, churn, LTV, ativação e uso.
- Dashboard do Super Admin.
- Alertas de uso de storage, bandwidth e WhatsApp.
- Rotinas de backup e restore testadas.
- Testes de carga.
- Revisão de custos por tenant.
- Playbook de suporte e incidentes.

**Dependências:** Fases 2, 9, 13 e integrações de pagamento.

**Critérios de pronto:**

- Plataforma consegue cobrar clientes.
- Operação consegue suspender, reativar e alterar plano.
- Custos por tenant são monitoráveis.
- Restore de backup foi testado.

---

## Dependências críticas entre módulos

| Módulo | Depende de |
|---|---|
| Agenda interna | tenants, usuários, profissionais, procedimentos, permissões |
| Agenda online | agenda interna, pacientes, consentimento LGPD, regras de cancelamento |
| Prontuário | pacientes, profissionais, permissões, templates, auditoria |
| Prescrições e documentos | prontuário e identificação do profissional |
| Financeiro | agenda, pacientes, procedimentos e permissões |
| Automações | eventos confiáveis, jobs, canais de comunicação |
| Kanban | pacientes, tags, agenda e automações |
| Relatórios | dados reais de agenda, prontuário e financeiro |
| Marketing | pacientes, segmentação, opt-out e canais |
| TISS | financeiro, convênios, procedimentos e atendimentos finalizados |
| IA | prontuário maduro, consentimento, logs e revisão médica |
| ICP-Brasil | documentos/prontuário e política de assinatura |

---

## Riscos principais

1. **Escopo grande demais para MVP.**
   Mitigação: congelar MVP nas Fases 0 a 9.

2. **Falha de isolamento multi-tenant.**
   Mitigação: RLS obrigatório, testes automatizados e revisão de policies.

3. **Auditoria implementada tarde.**
   Mitigação: criar audit log desde a Fase 2.

4. **Prontuário sem integridade histórica.**
   Mitigação: snapshot de template e imutabilidade desde a primeira versão.

5. **TISS subestimado.**
   Mitigação: manter fora do MVP e tratar como fase própria.

6. **Integrações travando o core.**
   Mitigação: implementar core funcional antes de Google, Memed, WhatsApp avançado e API pública.

7. **Uso indevido de dados sensíveis em comunicação externa.**
   Mitigação: níveis de privacidade, consentimento, opt-out e mascaramento em logs.

8. **Custo de storage e mensagens crescendo sem controle.**
   Mitigação: métricas por tenant, limites por plano e alertas.

---

## Decisões pendentes antes de iniciar código pesado

- Confirmar se o projeto será monorepo ou repositórios separados.
- Escolher Drizzle ou Prisma considerando RLS e queries complexas.
- Definir provedor de WhatsApp.
- Definir gateway de pagamento prioritário.
- Definir região e estratégia de soberania de dados.
- Definir política inicial de backup e retenção.
- Definir modelo de impersonação: acesso livre auditado ou aprovação da clínica.
- Definir se FullCalendar Premium será usado ou se o MVP contornará recursos pagos.
- Definir quais especialidades terão templates iniciais.
- Definir quais documentos clínicos entram no MVP.

---

## Próximo passo recomendado

Executar a **Fase 0** como uma etapa curta e objetiva, produzindo:

1. backlog priorizado;
2. mapa de entidades do MVP;
3. critérios de aceite;
4. decisões técnicas pendentes resolvidas;
5. roteiro de implementação das Fases 1 a 3.

Depois disso, iniciar a fundação técnica sem mexer no escopo avançado até o MVP clínico-operacional estar funcionando em piloto.
