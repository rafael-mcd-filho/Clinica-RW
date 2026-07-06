# SaaS de Gestão Clínica — Documentação Técnica de Desenvolvimento

> Documento base para desenvolvimento de um sistema de gestão de clínicas e consultórios médicos multi-tenant, com prontuário eletrônico configurável por especialidade, agenda inteligente, financeiro completo, CRM de pacientes, marketing e relatórios.

---

## Sumário

1. [Visão Geral do Produto](#1-visão-geral-do-produto)
2. [Arquitetura Multi-tenant e Hierarquia de Usuários](#2-arquitetura-multi-tenant-e-hierarquia-de-usuários)
3. [Adaptabilidade: Solo vs. Multiprofissional](#3-adaptabilidade-solo-vs-multiprofissional)
4. [Design System](#4-design-system)
5. [Estrutura de Navegação](#5-estrutura-de-navegação)
6. [Módulo: Agenda e Agendamento](#6-módulo-agenda-e-agendamento)
7. [Módulo: Agenda Online Pública](#7-módulo-agenda-online-pública)
8. [Módulo: Kanban de Pacientes (Funis)](#8-módulo-kanban-de-pacientes-funis)
9. [Módulo: Automações](#9-módulo-automações)
10. [Módulo: Prontuário Eletrônico](#10-módulo-prontuário-eletrônico)
11. [Módulo: Prescrição e Documentos](#11-módulo-prescrição-e-documentos)
12. [Módulo: Financeiro](#12-módulo-financeiro)
13. [Módulo: Gestão de Pacientes / CRM](#13-módulo-gestão-de-pacientes--crm)
14. [Módulo: Marketing e Relacionamento](#14-módulo-marketing-e-relacionamento)
15. [Módulo: Relatórios](#15-módulo-relatórios)
16. [Modelagem de Dados (Visão Geral)](#16-modelagem-de-dados-visão-geral)
17. [Módulo: Integrações](#17-módulo-integrações)
18. [Considerações Regulatórias](#18-considerações-regulatórias)

---

## 1. Visão Geral do Produto

Sistema SaaS (Software as a Service) multi-tenant para gestão de clínicas e consultórios médicos, construído para competir diretamente com plataformas como Amplimed, iClinic, Feegow e GestãoDS.

**Propósito:** permitir que profissionais de saúde e clínicas gerenciem toda a operação (agenda, atendimento, prontuário, financeiro, marketing) em um único ambiente, de qualquer dispositivo, em conformidade com LGPD e exigências do CFM.

**Diferenciais propostos:**

- Prontuário eletrônico 100% configurável por especialidade, com builder drag-and-drop.
- IA integrada ao prontuário (transcrição automática, sumarização clínica, preenchimento assistido).
- Interface leve e clean (light theme, azul primário, tipografia Inter).
- Versionamento correto de templates (integridade histórica do prontuário).
- Arquitetura orientada a automações (webhooks nativos, API aberta).

---

## 2. Arquitetura Multi-tenant e Hierarquia de Usuários

### 2.1 Visão geral

O sistema é multi-tenant com isolamento total de dados entre clínicas. A estrutura segue 3 níveis hierárquicos e o controle de acesso é construído sobre **3 dimensões independentes**.

### 2.2 Hierarquia de contas

```
SUPER ADMIN (operador do SaaS — você)
   │
   ├─ cria e gerencia contas de clínicas (tenants)
   │
   └─ ORGANIZAÇÃO / TENANT (clínica cliente)
         │
         ├─ admin owner da clínica (criado pelo super admin)
         │
         └─ usuários internos da clínica
               ├─ outros administradores
               ├─ profissionais (médicos, dentistas, psicólogos etc.)
               ├─ atendentes / recepcionistas
               ├─ financeiro
               └─ técnicos / auxiliares
```

#### Nível 1 — Super Admin (operador do SaaS)

Conta que opera a plataforma como um todo. Não pertence a nenhuma clínica.

**Responsabilidades:**

- Criar contas de clínicas (tenants) e configurar o admin owner inicial.
- Gerenciar planos, assinaturas e cobrança recorrente.
- Definir limites de uso por plano (nº de profissionais, pacientes, storage, envios de WhatsApp).
- Ativar, suspender e cancelar contas.
- Acessar logs operacionais, monitoramento e métricas agregadas (MRR, ARR, churn, LTV).
- Configurar feature flags por cliente (liberar funcionalidades beta).
- **Impersonar qualquer conta** para dar suporte (toda sessão impersonada gera log de auditoria visível para o admin da clínica).

#### Nível 2 — Organização / Tenant (clínica cliente)

Cada clínica é uma organização isolada. Toda informação clínica, financeira e operacional pertence a uma única organização. Pode ter:

- Múltiplas **unidades** físicas (filial do bairro X, filial do bairro Y).
- Múltiplos **usuários** com perfis e escopos diferentes.
- Múltiplos **profissionais** atendendo.
- Múltiplas **agendas** configuradas (uma por profissional, ou múltiplas por profissional como visto na seção de Agenda).

#### Nível 3 — Usuários da clínica

Usuários internos da clínica. Cada um tem:

- 1 ou mais **perfis** atribuídos (templates de permissões).
- Conjunto de **permissões granulares** (vem do perfil + overrides individuais).
- **Escopos de acesso** definidos sobre os recursos (quais agendas, profissionais e unidades pode acessar).

### 2.3 Sistema de Permissões — 3 dimensões

O controle de acesso opera em três dimensões independentes que se combinam:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  PERFIL (template)  +  PERMISSÕES  +  ESCOPO DE RECURSO    │
│                                                             │
│   "Médico"           "ver_agenda"      "Agenda Dr. Carlos"  │
│   "Atendente"        "criar_paciente"  "Unidade Centro"     │
│   "Administrador"    "ver_financeiro"  "Todos os recursos"  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Por que 3 dimensões?**

Porque um perfil simples ("Médico", "Atendente") não responde sozinho a perguntas reais:
- "O Dr. Carlos pode ver a agenda do Dr. Paulo?"
- "A Maria atendente pode marcar consulta para qualquer médico ou só para o Dr. Carlos?"
- "Esse usuário pode acessar o financeiro mas só da unidade Centro?"

Sem o conceito de **escopo**, o sistema vira "tudo ou nada".

### 2.4 Dimensão 1 — Perfis (Roles)

Perfis são **templates de permissões** pré-configurados. Cada perfil já vem com um conjunto de permissões padrão. O admin pode usar os perfis padrão ou criar perfis customizados.

#### Perfis padrão do sistema

**Administrador**
- Acesso total à clínica.
- Cria e gerencia usuários, perfis, escopos.
- Configura agendas, procedimentos, convênios, integrações.
- Acessa financeiro completo e relatórios.
- Pode ver prontuários (mas não preenche — só visualiza).
- Útil para o dono da clínica ou gerente administrativo.

**Profissional (Médico / Dentista / Psicólogo / Fisio / etc.)**
- Acessa a própria agenda.
- Acessa prontuários dos próprios pacientes (configurável).
- Preenche prontuário, prescreve, emite documentos.
- Realiza teleconsulta.
- Não acessa financeiro geral (apenas próprio repasse, se configurado).
- Não gerencia usuários.

**Atendente / Recepcionista**
- Acessa agenda(s) que tem escopo.
- Marca, remarca, cancela agendamentos.
- Faz check-in e check-out.
- Cadastra e atualiza pacientes.
- Recebe pagamentos no caixa.
- **Não acessa conteúdo clínico** do prontuário (apenas metadados: data, profissional, status).
- Não acessa financeiro gerencial.

**Financeiro**
- Acesso total ao módulo financeiro (dentro do escopo configurado).
- Gerencia contas a pagar/receber.
- Conciliação bancária.
- Emissão de notas fiscais.
- Relatórios financeiros.
- Não acessa prontuários nem conteúdo clínico.

**Técnico / Auxiliar de enfermagem**
- Faz triagem (PA, peso, altura, queixa inicial).
- Acessa ficha do paciente em atendimento.
- Não prescreve nem emite documentos.

#### Perfis customizados

O admin da clínica pode criar perfis adicionais combinando permissões a seu critério. Exemplos comuns:

- **Gerente de unidade:** Administrador limitado a uma unidade específica.
- **Coordenador clínico:** acesso a prontuários para auditoria, sem poder preencher.
- **Estagiário:** pode preencher prontuário, mas precisa de aprovação do médico responsável.

### 2.5 Dimensão 2 — Permissões granulares

Cada ação no sistema tem uma permissão específica. Permissões usam o padrão `recurso.acao`.

**Catálogo de permissões (visão consolidada):**

#### Agenda
- `agenda.ver` — visualizar agenda(s) dentro do escopo
- `agenda.criar_agendamento` — criar novo agendamento
- `agenda.editar_agendamento` — editar agendamento existente
- `agenda.cancelar_agendamento` — cancelar
- `agenda.encaixar` — fazer encaixe (fora do slot normal)
- `agenda.bloquear_horario` — bloquear horários
- `agenda.configurar` — alterar configurações da agenda

#### Pacientes
- `paciente.ver` — visualizar pacientes dentro do escopo
- `paciente.criar` — cadastrar novo
- `paciente.editar` — editar dados
- `paciente.excluir` — excluir (soft delete)
- `paciente.exportar` — exportar lista
- `paciente.ver_dados_sensiveis` — CPF completo, telefone, endereço

#### Clínico
- `clinico.ver_prontuario` — acessar prontuário
- `clinico.ver_prontuario_proprios` — acessar apenas dos próprios pacientes
- `clinico.preencher_prontuario` — criar/editar atendimento
- `clinico.finalizar_prontuario` — assinar e finalizar (imutável)
- `clinico.adicionar_adendo` — adicionar adendo a prontuário finalizado
- `clinico.prescrever` — emitir prescrição
- `clinico.solicitar_exame` — emitir solicitação
- `clinico.emitir_atestado` — emitir atestado
- `clinico.criar_template` — criar templates de prontuário

#### Financeiro
- `financeiro.ver_geral` — ver financeiro completo
- `financeiro.ver_proprio_repasse` — ver apenas o próprio repasse
- `financeiro.receber_pagamento` — registrar recebimento no caixa
- `financeiro.gerenciar_contas_pagar` — gerenciar despesas
- `financeiro.conciliar` — conciliação bancária
- `financeiro.emitir_nf` — emitir nota fiscal
- `financeiro.tiss` — operar faturamento TISS

#### Crescimento e Automações
- `crescimento.ver_campanhas` — ver campanhas
- `crescimento.criar_campanha` — criar campanhas
- `crescimento.disparar_campanha` — executar disparo
- `automacao.ver` — ver automações
- `automacao.criar` — criar automação
- `automacao.ativar` — ativar/desativar

#### Relatórios
- `relatorio.operacional` — relatórios operacionais
- `relatorio.financeiro` — relatórios financeiros
- `relatorio.clinico` — relatórios clínicos
- `relatorio.exportar` — exportar relatórios

#### Configurações
- `config.geral` — configurações gerais da clínica
- `config.usuarios` — gerenciar usuários e perfis
- `config.integracoes` — gerenciar integrações
- `config.plano` — visualizar e gerenciar plano/cobrança

#### Overrides individuais

Sobre o perfil base, o admin pode adicionar ou remover permissões para um usuário específico. Exemplo: Dr. Carlos é Profissional mas também é sócio — recebe override `financeiro.ver_geral` mantendo o perfil de Profissional.

### 2.6 Dimensão 3 — Escopo de recurso

Definição: **sobre quais registros específicos o usuário pode aplicar suas permissões**.

#### Tipos de escopo

**Por Profissional**
Usuário pode acessar recursos vinculados a profissionais específicos.
- "Maria atendente pode marcar consulta para Dr. Carlos e Dra. Ana — não para Dr. Paulo."
- "Dra. Juliana só vê prontuários dos seus próprios pacientes."

**Por Agenda**
Usuário pode acessar agendas específicas (relembrando: um profissional pode ter várias agendas — particular, convênio, teleconsulta, procedimentos).
- "João atendente pode operar apenas a agenda 'Convênios do Dr. Carlos'."

**Por Unidade**
Usuário pode acessar apenas recursos de uma ou mais unidades físicas.
- "Pedro gerente vê tudo, mas apenas da Unidade Tambaú."

**Por Especialidade**
Útil em policlínicas com áreas separadas.
- "Recepcionista do andar da pediatria só vê agenda das especialidades pediátricas."

**Escopo total (sem restrição)**
- Padrão de Administradores e Super Admin.

#### Estrutura do escopo

Cada usuário tem um conjunto de regras de escopo:

```
Usuário: Maria (Atendente)
Escopos:
  - agendas: [agenda_dr_carlos_particular, agenda_dra_ana_convenio]
  - unidades: [unidade_centro]
  - profissionais_visualizaveis: [dr_carlos, dra_ana]
  - especialidades: [todas]
```

Quando Maria abre a tela de Agenda, o sistema filtra automaticamente para mostrar só o que está nos escopos dela. Quando ela busca um paciente, filtra os que têm relação com profissionais do escopo. E assim por diante.

### 2.7 Combinação das 3 dimensões — exemplo prático

Cenário: clínica multidisciplinar com 4 médicos e 2 atendentes, cada atendente atende um par de médicos.

**Maria — Atendente**
- Perfil: Atendente
- Permissões: vem do perfil (agenda.ver, agenda.criar_agendamento, paciente.criar, paciente.editar, financeiro.receber_pagamento)
- Escopo: agendas de Dr. Carlos e Dra. Ana; unidade Centro

**João — Atendente**
- Mesmo perfil que Maria
- Mesmas permissões
- Escopo diferente: agendas de Dr. Paulo e Dra. Juliana

**Dr. Carlos — Profissional + sócio**
- Perfil: Profissional
- Permissões: vem do perfil + overrides individuais: `financeiro.ver_geral`, `relatorio.financeiro`
- Escopo dele mesmo (próprios pacientes), mas overrides expandem o financeiro para toda a clínica

**Marcos — Administrador**
- Perfil: Administrador
- Permissões: todas
- Escopo: total (todas agendas, todas unidades, todos profissionais)

Quando Marcos abre a agenda, ele vê todos os médicos. Quando Maria abre, vê só Dr. Carlos e Dra. Ana. Quando Dr. Carlos abre, vê só a própria. Quando Marcos abre o financeiro, vê tudo. Quando Dr. Carlos abre o financeiro, vê todos os números porque tem override.

### 2.8 Visualização consolidada para o Administrador

Quando o admin (ou qualquer usuário com acesso a múltiplas agendas/profissionais) abre a Agenda, o sistema oferece:

#### Padrão: "Ver tudo" + filtros progressivos

A tela abre mostrando **todos os agendamentos** dentro do escopo do usuário, sem filtro inicial. O usuário usa filtros laterais para focar:

- Filtro por profissional (multi-select)
- Filtro por unidade
- Filtro por especialidade
- Filtro por convênio
- Filtro por status (agendado, confirmado, atendido, faltou)
- Filtro por tipo de procedimento

#### Modos de visualização

O usuário escolhe como quer ver na visão consolidada:

1. **Empilhada por cor** — todos os agendamentos no mesmo calendário, cada profissional/agenda com cor própria. Útil para ter percepção geral de ocupação.
2. **Colunas paralelas** — uma coluna por profissional. Útil para análise comparativa.
3. **Por sala** — uma coluna por sala física. Útil para gestão de ocupação de espaço.
4. **Lista cronológica** — formato tabular, ordenado por data/hora.

A escolha do modo é salva como preferência do usuário.

### 2.9 Modelagem técnica das 3 dimensões

```
profiles (perfis padrão e customizados)
├── id
├── organization_id (nullable — perfis padrão são do sistema)
├── name (Administrador, Profissional, Atendente, Financeiro, Técnico)
├── description
└── is_system_default

permissions (catálogo de permissões disponíveis)
├── id
├── code (ex: "agenda.ver", "clinico.preencher_prontuario")
├── description
└── category

profile_permissions (N:N — quais permissões cada perfil tem)
├── profile_id
└── permission_id

users
├── id
├── organization_id
├── name, email, password_hash
└── active

user_profiles (N:N — usuário pode ter múltiplos perfis)
├── user_id
└── profile_id

user_permission_overrides (overrides individuais)
├── user_id
├── permission_id
└── granted (true = adicionado, false = removido)

resource_scopes (escopo de recursos por usuário)
├── id
├── user_id
├── resource_type (agenda, profissional, unidade, especialidade)
├── resource_id (nullable — null significa "todos do tipo")
└── access_level (read, write, full)
```

### 2.10 Avaliação de acesso em runtime

Quando o usuário tenta executar uma ação, o sistema valida na seguinte ordem:

1. **Autenticação:** usuário está logado?
2. **Organização ativa:** o tenant está ativo e dentro do plano?
3. **Permissão da ação:** o usuário tem `permissao_X`? (via perfil + overrides)
4. **Escopo do recurso:** o registro específico que ele quer manipular está no escopo dele?

Se passar nos 4 checks, a ação é permitida. Caso contrário, retorna erro 403 com mensagem clara sobre qual nível barrou o acesso.

No banco (Supabase), tudo isso é reforçado por **Row Level Security**: mesmo que um erro de aplicação tente fazer query proibida, as policies do PostgreSQL impedem.

### 2.11 Super Admin — modo de impersonação

O super admin pode acessar qualquer conta de cliente para dar suporte. Funcionamento:

- Super admin clica em "Acessar como" no painel de gestão da plataforma.
- Sistema abre nova sessão dentro da conta-alvo.
- Banner permanente no topo da tela indica: "Você está acessando como SUPER ADMIN. Todas as ações são registradas."
- Toda ação realizada gera log especial visível para o admin da clínica.
- Super admin pode realizar qualquer ação (sem restrição), incluindo correções de dados quando solicitado pelo cliente.

> **Nota de LGPD:** este modelo "super admin vê tudo" é simples e operacional, mas implica acesso técnico a dados sensíveis de saúde. Recomenda-se documentar isso no contrato com clientes e na Política de Privacidade. Em estágios mais maduros do produto, considerar evoluir para modelo de "convite/aprovação" — onde o admin da clínica precisa autorizar cada sessão de suporte.

---

## 3. Adaptabilidade: Solo vs. Multiprofissional

O mesmo sistema atende tanto profissionais autônomos quanto clínicas com múltiplos profissionais. A UI se **adapta automaticamente** com base no número de profissionais ativos do tenant, sem necessidade de plano diferente ou configuração manual.

### 3.1 Detecção automática

A regra é simples: se o tenant tem apenas 1 profissional ativo, o sistema entra em **modo Solo**. Se tem 2 ou mais, entra em **modo Clínica**. A transição é automática quando um segundo profissional é adicionado, e reversível quando profissionais são desativados.

### 3.2 Diferenças no modo Solo

**Onboarding:**
- Fluxo simplificado: criar conta → preencher dados pessoais e profissionais → primeira consulta em 5 minutos.
- Pula etapas de "convidar equipe", "criar unidades", "atribuir salas".

**Interface:**
- Não exibe seletor de profissional na agenda (já está implícito).
- Esconde filtros por profissional em relatórios e listagens.
- Esconde menu "Profissionais" nas configurações.
- Esconde gestão de repasse médico no financeiro.
- Dashboard mostra apenas KPIs pessoais, sem comparações entre profissionais.

**Permissões:**
- O profissional solo geralmente acumula todos os perfis (Admin + Profissional + Financeiro).
- Pode opcionalmente convidar uma recepcionista/secretária, que entra com perfil limitado sem disparar o modo Clínica (não conta como profissional).

**Configurações padrão:**
- Agenda padrão com 1 sala virtual e 1 profissional já criado.
- Templates de prontuário pré-selecionados conforme especialidade declarada no cadastro.
- Modelos de prescrição e documentos pré-instalados.

### 3.3 Diferenças no modo Clínica

**Onboarding:**
- Fluxo estendido: criar clínica → cadastrar unidades → cadastrar salas e equipamentos → convidar profissionais → cada profissional configura sua agenda.

**Interface:**
- Seletor de profissional aparece em todos os contextos relevantes (agenda, financeiro, relatórios).
- Visões agregadas: "agenda da clínica" (todos), "agenda por sala", "agenda por equipamento".
- Filtros por profissional disponíveis em todos os listings.
- Permissões granulares aplicadas com rigor.
- Repasse médico ativo no financeiro.

**Permissões:**
- Cada usuário tem perfil específico.
- Recepcionista vê agenda de todos, mas não acessa conteúdo clínico.
- Profissional vê apenas seus próprios pacientes por padrão (configurável).
- Admin vê tudo.

### 3.4 Transição entre modos

Quando um profissional solo convida um segundo profissional:

1. Sistema avisa que vai ativar o **modo Clínica**.
2. Solicita criação de pelo menos 1 unidade (se ainda não existe).
3. Habilita gestão de repasse médico (opcional, pode ser configurado depois).
4. Mantém todos os dados existentes — pacientes, atendimentos, agenda — agora vinculados ao novo escopo.
5. Os pacientes do profissional original continuam atribuídos a ele por padrão.

Quando uma clínica reduz para 1 profissional (segundo profissional é desativado):
- O sistema permanece em modo Clínica até que o admin explicitamente "retorne ao modo Solo" nas configurações.
- Isso evita reorganizações automáticas indesejadas.

### 3.5 Regra de design

Toda nova funcionalidade desenvolvida deve responder à pergunta: **"como isso se comporta para um profissional solo e para uma clínica com 15 profissionais?"**. Se a resposta exigir interfaces muito diferentes, considerar feature flag por modo. Se a resposta couber no mesmo desenho com adaptação visual, é o caminho preferido.

---

## 4. Design System

### 4.1 Cores

**Paleta primária:**

| Token | Hex | Uso |
|-------|-----|-----|
| `primary-600` | `#2563EB` | Ações principais, links, botões |
| `primary-700` | `#1E40AF` | Hover de botões primários |
| `primary-50` | `#EFF6FF` | Backgrounds sutis, badges azuis |
| `primary-100` | `#DBEAFE` | Hover de elementos azuis |

**Neutros (base da interface):**

| Token | Hex | Uso |
|-------|-----|-----|
| `neutral-900` | `#0F172A` | Títulos, texto principal |
| `neutral-700` | `#334155` | Corpo de texto |
| `neutral-600` | `#475569` | Texto secundário |
| `neutral-500` | `#64748B` | Texto terciário, labels |
| `neutral-400` | `#94A3B8` | Ícones sutis, placeholders |
| `neutral-200` | `#E2E8F0` | Bordas |
| `neutral-100` | `#F1F5F9` | Backgrounds de itens secundários |
| `neutral-50` | `#F8FAFC` | Background geral da aplicação |
| `white` | `#FFFFFF` | Cards, modais, áreas de conteúdo |

**Semânticas:**

| Token | Hex | Uso |
|-------|-----|-----|
| `success-500` | `#22C55E` | Indicadores de sucesso |
| `success-50` | `#DCFCE7` | Backgrounds de badges verdes |
| `success-700` | `#166534` | Texto em badges verdes |
| `warning-500` | `#F59E0B` | Alertas moderados |
| `warning-50` | `#FEF3C7` | Backgrounds de alertas |
| `danger-500` | `#EF4444` | Alertas críticos, alergias |
| `danger-50` | `#FEF2F2` | Backgrounds de alertas críticos |
| `danger-700` | `#991B1B` | Texto em alertas críticos |

**Cores de especialidade (para categorização visual):**

| Especialidade | Background | Texto |
|---------------|------------|-------|
| Cardiologia | `#FEE2E2` | `#991B1B` |
| Psiquiatria | `#E0E7FF` | `#3730A3` |
| Clínica Geral | `#D1FAE5` | `#065F46` |
| Pediatria | `#FEF3C7` | `#92400E` |
| Dermatologia | `#FCE7F3` | `#9F1239` |
| Ginecologia | `#F3E8FF` | `#6B21A8` |
| Pneumologia | `#CFFAFE` | `#155E75` |
| Ortopedia | `#E0F2FE` | `#075985` |

### 4.2 Tipografia

- **Família:** Inter (`'Inter', -apple-system, BlinkMacSystemFont, sans-serif`)
- **Pesos utilizados:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)

**Escala tipográfica:**

| Uso | Tamanho | Peso |
|-----|---------|------|
| Título de página (H1) | 20px | 600 |
| Título de seção (H2) | 16–18px | 600 |
| Label de seção (uppercase) | 11px | 600 |
| Corpo de texto | 14px | 400 |
| Texto secundário | 13px | 400 |
| Micro (metadados) | 12px | 400 |
| Micro labels (uppercase) | 10–11px | 600 |

### 4.3 Espaçamento e bordas

- **Border radius:** 6px (inputs, badges), 8px (cards, modais)
- **Borders:** 1px solid `#E2E8F0`
- **Sombras:** leves — `0 1px 2px rgba(0,0,0,0.03)` padrão, `0 4px 12px rgba(37,99,235,0.08)` em hover
- **Padding de cards:** 20–24px
- **Gap entre elementos:** 8px, 12px, 16px, 24px (escala em múltiplos de 4)

### 4.4 Princípios visuais

- **Light theme** como padrão (sem opção de dark mode no MVP).
- Interface clean, sem ornamentos desnecessários.
- Uso de cor para informação (status, categorização), não para decoração.
- Alertas críticos (alergias, PA alterada) sempre em vermelho.
- Badges pequenos e funcionais, não decorativos.
- Consistência absoluta entre todos os módulos.

### 4.5 Componentes UI

Todos os componentes seguem o mesmo padrão visual da tela de prontuário usada como referência.

#### Botões

**Botão primário** (ação principal de uma tela):
- Background: `#2563EB`
- Background hover: `#1E40AF`
- Texto: `#FFFFFF`, peso 500, tamanho 13px
- Padding: `8px 16px`
- Border-radius: `6px`
- Sem borda
- Ícone opcional à esquerda (size 14, gap 6px)

**Botão secundário** (ação alternativa):
- Background: `#FFFFFF`
- Background hover: `#F8FAFC`
- Texto: `#475569`, peso 500, tamanho 13px
- Border: `1px solid #E2E8F0`
- Padding: `8px 14px`
- Border-radius: `6px`

**Botão terciário/ghost** (ações de baixa hierarquia):
- Background: transparente
- Background hover: `#F1F5F9`
- Texto: `#2563EB`, peso 500, tamanho 13px
- Sem borda
- Padding: `6px 12px`

**Botão de perigo** (excluir, cancelar, deletar):
- Background: `#FFFFFF`
- Background hover: `#FEF2F2`
- Texto: `#991B1B`, peso 500
- Border: `1px solid #FECACA`
- Border-radius: `6px`

**Tamanhos disponíveis:**
- Small (sm): `padding 6px 10px`, fontSize 12px
- Default (md): `padding 8px 14px`, fontSize 13px
- Large (lg): `padding 10px 18px`, fontSize 14px

**Estados:**
- Hover: cor de background muda conforme acima
- Active: scale 0.98 (sutil)
- Disabled: opacity 0.5, cursor not-allowed
- Loading: spinner à esquerda, texto continua visível, cursor wait

#### Inputs de texto

- Background: `#FFFFFF`
- Border: `1px solid #E2E8F0`
- Border-radius: `6px`
- Padding: `8px 12px`
- Texto: `#0F172A`, 14px
- Placeholder: `#94A3B8`
- Border focus: `#2563EB` (sem ring/outline pesado, apenas mudança de cor)
- Box-shadow focus: `0 0 0 3px rgba(37, 99, 235, 0.1)`
- Label acima: 12px, peso 500, `#475569`, margin-bottom 6px
- Mensagem de erro abaixo: 12px, `#991B1B`, margin-top 4px
- Estado de erro: border `#EF4444`

#### Textarea

- Mesmas regras do input
- Min-height: 80px
- Resize: vertical apenas
- Espaçamento interno mais generoso (`12px`)

#### Select / Dropdown

- Mesmo visual do input quando fechado
- Ícone de chevron à direita (`#94A3B8`)
- Menu aberto: background branco, border `#E2E8F0`, border-radius 6px, box-shadow `0 4px 12px rgba(0,0,0,0.08)`
- Itens: padding `8px 12px`, hover background `#F1F5F9`
- Item selecionado: background `#EFF6FF`, texto `#1E40AF`

#### Checkbox

- Tamanho: 16px x 16px
- Border: `1px solid #CBD5E1` quando não marcado
- Background marcado: `#2563EB`
- Border-radius: 4px
- Ícone de check em branco
- Label à direita: 13px, `#334155`, gap 8px
- Clique no label também alterna o estado

#### Radio button

- Tamanho: 16px x 16px
- Border: `1px solid #CBD5E1` quando não selecionado
- Selecionado: border `#2563EB`, ponto interno `#2563EB` com 8px
- Border-radius: 50%
- Label à direita: 13px, `#334155`, gap 8px

#### Switch (toggle)

- Tamanho: 36px x 20px
- Background desligado: `#CBD5E1`
- Background ligado: `#2563EB`
- Bolinha: branca, 16px, com sombra sutil
- Transição: 150ms ease
- Border-radius: 999px
- Label à esquerda ou direita: 13px, `#334155`

#### Badges / Tags

**Badge informativo padrão:**
- Padding: `3px 8px`
- Border-radius: `4px`
- Font-size: 11px
- Font-weight: 500-600
- Sem borda

**Variantes por cor:**
- Neutro: bg `#F1F5F9`, texto `#475569`
- Azul: bg `#EFF6FF`, texto `#1E40AF`
- Verde (sucesso): bg `#DCFCE7`, texto `#166534`
- Amarelo (alerta): bg `#FEF3C7`, texto `#92400E`
- Vermelho (perigo): bg `#FEE2E2`, texto `#991B1B`
- Roxo: bg `#F3E8FF`, texto `#6B21A8`

**Badges de especialidade:** seguem as cores definidas em 4.1.

#### Cards

- Background: `#FFFFFF`
- Border: `1px solid #E2E8F0`
- Border-radius: `8px`
- Padding interno: `20px` ou `24px` (proporcional ao conteúdo)
- Box-shadow padrão: `0 1px 2px rgba(0,0,0,0.03)`
- Box-shadow hover (cards clicáveis): `0 4px 12px rgba(37,99,235,0.08)`
- Border hover (cards clicáveis): `#93C5FD`
- Transição: 150ms

#### Modais

- Overlay: `rgba(15, 23, 42, 0.4)`, com `backdrop-filter: blur(2px)`
- Container: background branco, border-radius 8px, max-width conforme conteúdo (geralmente 480-640px)
- Box-shadow: `0 20px 40px rgba(0,0,0,0.15)`
- Header: padding `20px 24px`, border-bottom `1px solid #E2E8F0`, título 16px peso 600
- Body: padding `24px`
- Footer: padding `16px 24px`, border-top `1px solid #E2E8F0`, botões alinhados à direita
- Botão de fechar (X): canto superior direito, `#94A3B8`, hover `#475569`

#### Toasts (notificações)

- Posição: canto superior direito da tela
- Background: branco
- Border-left: `4px solid` (cor varia por tipo: verde para sucesso, vermelho para erro, azul para info, amarelo para alerta)
- Padding: `12px 16px`
- Border-radius: `6px`
- Box-shadow: `0 8px 16px rgba(0,0,0,0.1)`
- Ícone à esquerda, texto principal 13px peso 500, texto secundário 12px peso 400
- Duração padrão: 4 segundos (dispensável manualmente)
- Animação: slide in da direita, fade out

#### Tabelas

- Header: background `#F8FAFC`, texto 11px uppercase, peso 600, `#64748B`, letter-spacing 0.05em
- Linhas: border-bottom `1px solid #F1F5F9`
- Padding por célula: `12px 16px`
- Hover de linha: background `#F8FAFC`
- Texto da célula: 13px, `#334155`
- Linha selecionada: background `#EFF6FF`

#### Avatares

- Tamanhos: 24px (xs), 32px (sm), 40px (md), 56px (lg), 72px (xl)
- Border-radius: 50%
- Background gradient quando sem foto: `linear-gradient(135deg, #3B82F6, #1E40AF)`
- Iniciais em branco, peso 600
- Border opcional `2px solid #FFFFFF` quando sobreposto a outro elemento colorido

#### Tabs (abas internas)

- Container: border-bottom `1px solid #E2E8F0`
- Aba padrão: padding `10px 16px`, texto 13px peso 500, `#64748B`, cursor pointer
- Aba ativa: texto `#2563EB`, border-bottom `2px solid #2563EB`
- Hover: texto `#334155`

#### Tooltips

- Background: `#0F172A`
- Texto: branco, 12px
- Padding: `6px 10px`
- Border-radius: `4px`
- Seta apontando para o elemento
- Delay de abertura: 400ms

#### Spinners e loading

- Spinner: `border 2px solid #E2E8F0`, `border-top-color #2563EB`, animação rotate 600ms linear infinite
- Skeleton loaders para tabelas e listas: background `#F1F5F9` com shimmer animation
- Loading state em botões: spinner pequeno (12px) à esquerda do texto

### 4.6 Iconografia

- Biblioteca: **Lucide React** (já utilizada no protótipo de referência).
- Tamanho padrão dentro de botões: 14px
- Tamanho em ícones de menu: 16-18px
- Tamanho em ícones decorativos: 20-24px
- Stroke-width: 2 (default)
- Cor: herda do contexto (texto do botão, label, etc.)

### 4.7 Animações e transições

- Duração padrão: 150ms para micro-interações (hover, focus)
- Duração para mudanças de estado maiores: 200-300ms
- Easing padrão: `ease` ou `ease-in-out`
- Slide-in de modais e drawers: 250ms
- Evitar animações em loops contínuos (exceto loading)

---

## 5. Estrutura de Navegação

### 5.1 Princípio fundamental

O sistema usa **navegação em dois níveis bem separados**:

- **Header (nível 1):** áreas principais do sistema. Apenas o nome da área, sem dropdown nem cascata. Cada clique leva diretamente à página principal daquela área.
- **Sidebar interna (nível 2):** aparece **dentro** de cada área e mostra as sub-páginas e visões daquela área específica. A sidebar muda conforme a área que o usuário está acessando.

Essa separação evita o problema clássico de "menu dentro de menu" (dropdown + sidebar mostrando o mesmo conteúdo) e mantém a hierarquia visual limpa.

### 5.2 Header (nível 1 — áreas principais)

```
[Logo]  Dashboard  Agenda  Pacientes  Clínica  Financeiro  Crescimento  Automações  Relatórios      [🔍] [🔔] [⚙️] [Avatar]
```

**Áreas principais (clicáveis diretamente, sem dropdown):**

1. **Dashboard** — visão geral personalizada por perfil.
2. **Agenda** — gestão de horários, agendamentos e fluxo da agenda.
3. **Pacientes** — base de pacientes, CRM e funis (Kanban).
4. **Clínica** — atendimentos, prontuário, prescrições, documentos clínicos.
5. **Financeiro** — receber, pagar, fluxo de caixa, convênios.
6. **Crescimento** — campanhas, NPS, relacionamento, retenção.
7. **Automações** — fluxos automatizados (lembretes, confirmações, pesquisas, ações por gatilho).
8. **Relatórios** — BI, análises e exportações.

**Ícones à direita:**

- **🔍 Busca global (`Cmd+K` / `Ctrl+K`)** — busca unificada por pacientes, atendimentos, comandos do sistema.
- **🔔 Notificações** — centro de avisos (aprovações pendentes, mensagens, alertas).
- **⚙️ Configurações** — administração do sistema (usuários, profissionais, salas, integrações, plano).
- **Avatar do usuário** — meu perfil, trocar tenant, ajuda, sair.

### 5.3 Sidebar interna (nível 2 — sub-páginas da área)

Ao entrar em qualquer área principal, aparece uma sidebar à esquerda mostrando as sub-páginas daquela área. A sidebar substitui o conteúdo conforme o usuário navega entre áreas.

Largura padrão: 220-240px. Background `#FFFFFF`. Border-right `1px solid #E2E8F0`.

#### Sidebar de "Agenda"

- Visão geral (calendário principal)
- Por profissional
- Por sala
- Por equipamento
- Lista de espera
- Bloqueios e folgas
- Página pública (link de agendamento online)
- Configurações de agenda

#### Sidebar de "Pacientes"

- Lista de pacientes
- Funis (Kanban)
- Segmentações e tags
- Pacientes inativos
- Importar pacientes
- LGPD e consentimentos

#### Sidebar de "Clínica"

- Atendimentos do dia
- Atendimentos em rascunho
- Histórico geral de atendimentos
- Prescrições emitidas
- Solicitações de exame
- Atestados e documentos
- Templates de prontuário
- Builder de templates
- Modelos de documentos

#### Sidebar de "Financeiro"

- Visão geral (fluxo de caixa)
- Contas a receber
- Contas a pagar
- Conciliação bancária
- Notas fiscais
- Convênios (TISS)
- Repasse médico
- DRE

#### Sidebar de "Crescimento"

- Visão geral (métricas de relacionamento)
- Campanhas
- NPS e pesquisas
- Templates de mensagem
- Histórico de envios
- Análise de retenção

#### Sidebar de "Automações"

- Visão geral (automações ativas)
- Lembretes de consulta (lembrete 48h antes, 24h antes, 2h antes)
- Confirmação de agendamento
- Pesquisa de satisfação pós-atendimento
- Reativação de pacientes inativos
- Aniversários
- Cobranças e financeiro
- Automações personalizadas (criar do zero)
- Templates de automação (biblioteca pronta)
- Histórico de execuções
- Configurações de envio (janela de horário, limites, opt-out)

#### Sidebar de "Relatórios"

- Visão geral
- Operacionais (ocupação, no-show, ticket médio)
- Financeiros (DRE, inadimplência, recebimentos)
- Clínicos (CIDs, procedimentos, perfil)
- Por profissional
- Exportações personalizadas

### 5.4 Sidebar de "Configurações" (via ícone ⚙️)

Quando o usuário clica na engrenagem, entra em uma área dedicada de configurações com sua própria sidebar:

- Dados da clínica (nome, CNPJ, logotipo, endereço)
- Horário de funcionamento
- Unidades
- Salas e equipamentos
- Usuários e permissões
- Profissionais
- Procedimentos e tabelas de preço
- Convênios
- Modelos de comunicação
- Integrações (Google Agenda, WhatsApp, Memed, gateways)
- LGPD e termos
- Plano, faturas e assinatura
- Auditoria e logs

### 5.5 Sub-níveis dentro de uma página

Dentro de uma sub-página específica, podem existir mais navegações contextuais — mas sempre dentro da página, sem afetar o header ou a sidebar principal. Padrões comuns:

- **Abas horizontais (tabs)** quando uma página tem visões alternativas do mesmo dado (ex: ficha do paciente com abas "Dados pessoais", "Clínico", "Histórico", "Documentos", "Financeiro", "Mensagens").
- **Painel lateral direito** quando ações contextuais são frequentes (ex: durante o atendimento, painel à direita com "Prescrever", "Solicitar exame", "Atestado").
- **Wizard de etapas** quando há fluxo sequencial (ex: criação de automação, configuração inicial da clínica).

### 5.6 Estados da sidebar

- **Item ativo:** background `#EFF6FF`, texto `#1E40AF`, indicador de seleção (barra esquerda de 3px em `#2563EB`).
- **Item hover:** background `#F8FAFC`, texto `#0F172A`.
- **Item padrão:** background transparente, texto `#475569`.
- **Item com sub-níveis:** chevron à direita; expansível inline ou navega para sub-página.
- **Item desabilitado:** opacity 0.5, cursor not-allowed (ex: feature do plano superior).

### 5.7 Estados do header

- **Área ativa:** texto `#2563EB`, peso 600, indicador inferior (barra de 2px em `#2563EB`).
- **Área hover:** texto `#0F172A`.
- **Área padrão:** texto `#475569`, peso 500.
- **Badge de contagem:** ao lado da área quando há ação pendente (ex: "Clínica (3)" se há 3 prontuários em rascunho).

### 5.8 Breadcrumbs

Logo abaixo do header, breadcrumb com a trilha:

```
Clínica  ›  Atendimentos do dia  ›  Maria Eduarda Silva  ›  Atendimento #301
```

- Cor: `#64748B`
- Tamanho: 12px
- Separador: caractere `›`
- Último item (página atual): peso 500, cor `#0F172A`, não clicável.

### 5.9 Dashboard por perfil

A área "Dashboard" mostra conteúdo diferente para cada perfil:

- **Médico:** consultas de hoje, próximo paciente, pendências (prontuários não finalizados, exames a revisar).
- **Recepcionista:** agenda do dia de todos os profissionais, confirmações pendentes, check-ins.
- **Admin:** KPIs do mês (faturamento, nº de consultas, taxa de no-show, ticket médio).
- **Financeiro:** contas a vencer, inadimplência, fluxo de caixa do mês.

### 5.10 Responsividade

- **Desktop (≥ 1024px):** header completo + sidebar fixa à esquerda dentro da área.
- **Tablet (768-1023px):** header completo + sidebar colapsável (ícone de menu mostra/esconde).
- **Mobile (< 768px):** header com hamburger menu. Áreas principais viram lista no menu. Sidebar da área aparece como segundo nível dentro do mesmo drawer.

### 5.11 Princípios de UX adotados

1. **Cada clique do header é uma navegação direta**, nunca abre menu ou cascata.
2. **A sidebar mostra apenas o contexto da área atual** — nunca repete o que está no header.
3. **Mesmo conteúdo nunca aparece em dois lugares** (ex: "Lista de pacientes" só vive na sidebar de Pacientes, não duplica em outro lugar).
4. **Nomenclatura orientada ao usuário, não ao banco de dados** — ex: "Atendimentos do dia" em vez de "Lista de medical_records com status = em_atendimento".
5. **Configurações administrativas separadas do uso diário** — ficam todas na engrenagem, não poluem o header principal.

---

## 6. Módulo: Agenda e Agendamento

### 6.1 Visualizações

#### Visualização padrão

- **Diária:** detalhe completo do dia, mostrando faixas de 15/30/60 minutos.
- **Semanal:** visão de 7 dias com slots compactos.
- **Mensal:** visão macro com indicadores de ocupação por dia.
- **Lista:** formato tabular ordenado por data/hora, ideal para recepção.

#### Modos de exibição

- **Por profissional:** colunas representam profissionais.
- **Por sala:** colunas representam salas físicas (importante para clínicas com salas compartilhadas).
- **Por equipamento:** colunas representam equipamentos (ex: aparelho de ultrassom, sala de espirometria).
- **Agrupada:** todos os profissionais em uma única linha, útil para visão geral da clínica.

#### Filtros

- Por profissional (multiselect)
- Por especialidade
- Por convênio
- Por tipo de procedimento
- Por status (agendado, confirmado, atendido, faltou)
- Por unidade (em clínicas multi-unidade)

### 6.2 Estados do agendamento

```
agendado → confirmado → aguardando_atendimento → em_atendimento → atendido
    ↓          ↓                  ↓                      ↓
cancelado  cancelado          faltou              cancelado_parcial
```

Cada estado tem cor própria na agenda e dispara automações específicas (ver Módulo de Automações).

### 6.3 Configurações avançadas de horário

Esta é uma das funcionalidades mais críticas. Cada profissional tem um conjunto de regras configuráveis que define como sua agenda funciona.

#### 6.4.1 Horários de atendimento por dia da semana

Para cada dia da semana, o profissional define:

- **Períodos de atendimento:** múltiplas faixas no mesmo dia (ex: segunda 8h-12h e 14h-18h).
- **Duração padrão de consulta:** 15, 20, 30, 45, 60 minutos ou personalizado.
- **Intervalo entre consultas:** tempo de buffer (ex: 5 minutos entre atendimentos).
- **Horário de almoço/pausa:** bloqueio padrão (não bloqueia recorrentemente, é regra fixa).

#### 6.4.2 Calendários múltiplos dentro do mesmo profissional

Um único profissional pode ter **múltiplos sub-calendários** com regras distintas. Exemplos:

- **Calendário "Consultas particulares":** segundas e quartas, 14h-18h, duração 30min.
- **Calendário "Convênios":** terças e quintas, 8h-12h, duração 45min.
- **Calendário "Telemedicina":** sextas, 18h-21h, duração 30min.
- **Calendário "Procedimentos":** quartas, 8h-12h, duração 60min.

Cada sub-calendário pode ter:
- Regras próprias de duração
- Procedimentos aceitos diferentes
- Convênios aceitos diferentes
- Cor de identificação visual diferente
- Permissão de agendamento online diferente

#### 6.4.3 Capacidade por horário (paralelismo)

Por padrão, um slot de horário aceita apenas 1 paciente. Mas o sistema permite configurar **slots com múltiplas vagas** para casos específicos:

- **Atendimento em grupo:** terapeuta atende 4 pacientes em sessão de grupo no mesmo horário.
- **Vacinação:** 8 pacientes em paralelo no mesmo slot.
- **Coleta laboratorial:** 6 vagas simultâneas.
- **Procedimentos rápidos:** 3 pacientes em paralelo (com salas/macas diferentes).

Configuração por slot ou por padrão do calendário.

#### 6.4.4 Regras por tipo de procedimento

Cada procedimento pode ter regras próprias dentro do calendário:

- **Duração própria:** "Primeira consulta" dura 60min, "Retorno" dura 30min, "Procedimento X" dura 90min.
- **Antecedência mínima para agendamento:** quanto tempo antes da consulta o paciente pode marcar (ex: primeira consulta exige 48h antes).
- **Antecedência máxima:** quantos dias no futuro pode marcar (ex: máximo 90 dias).
- **Dias e horários permitidos:** procedimento X só pode ser marcado nas terças à tarde.
- **Sala obrigatória:** procedimento requer sala específica (ex: ECG só na Sala 2).
- **Equipamento obrigatório:** requer equipamento específico.
- **Preço base e por convênio.**

#### 6.4.5 Regras especiais por data

Configurações que sobrescrevem o padrão:

- **Feriados:** marcação de dias bloqueados (com base em calendário nacional e municipal + customizáveis).
- **Bloqueios pontuais:** viagem, congresso, férias, dia de plantão hospitalar.
- **Bloqueio de horários:** "toda quinta-feira das 17h às 19h fica bloqueado para reuniões internas".
- **Dias especiais:** "no dia 15/12, atender apenas convênio X" ou "no sábado promocional, duração de 20min".
- **Recorrências:** bloqueio que se repete (semanal, mensal, anual).

#### 6.4.6 Antecedência e janelas de agendamento

- **Antecedência mínima para marcar:** evita marcações de última hora (ex: paciente não pode marcar com menos de 4h de antecedência).
- **Antecedência mínima para cancelar:** paciente só pode cancelar até X horas antes (após isso, requer contato com a clínica).
- **Antecedência mínima para reagendar online:** similar ao cancelamento.
- **Janela de visibilidade:** quantos dias para frente a agenda fica visível para o paciente (ex: mostra os próximos 60 dias).

### 6.4 Gestão de lista de espera

- Lista por profissional, especialidade ou procedimento.
- Quando um horário fica livre (cancelamento), sistema sugere automaticamente pacientes da lista.
- Notificação automática para pacientes da lista quando vaga abre.
- Ordem por prioridade (data de inscrição, urgência clínica, paciente VIP).
- Conversão direta de item da lista de espera em agendamento.

### 6.5 Bloqueios e folgas

- Bloqueio rápido (clicar em horário e bloquear).
- Motivos pré-cadastrados (almoço, reunião, congresso, plantão).
- Bloqueio recorrente.
- Bloqueio em massa (selecionar vários dias).
- Visualização de bloqueios diferenciada na agenda (hachurado ou cor neutra).

### 6.6 Check-in, check-out e fluxo na recepção

- Recepcionista marca check-in quando paciente chega.
- Status do agendamento muda automaticamente.
- Notificação no app/painel do profissional.
- Cronômetro: tempo de espera do paciente desde o check-in.
- Após atendimento, check-out registra o término.
- Métricas geradas: tempo médio de espera, tempo médio de atendimento, pontualidade do profissional.

### 6.7 Encaixes

- Modo "encaixe" permite agendamentos fora do slot normal.
- Visualmente diferenciado (cor ou ícone específico).
- Necessita permissão (geralmente recepcionista e admin podem encaixar).
- Não desloca os agendamentos seguintes — apenas adiciona em paralelo.

### 6.8 Configurações da agenda (admin)

- Duração padrão da consulta por tipo (primeira, retorno, procedimento).
- Intervalo entre consultas.
- Horário de funcionamento da clínica (sobrepõe individuais quando relevante).
- Feriados e bloqueios da clínica inteira.
- Tipos de procedimento (cada um com duração, valor e regras).
- Regras de agendamento online por especialidade e procedimento.

---

## 7. Módulo: Agenda Online Pública

A clínica disponibiliza uma URL pública (ou widget embedável) onde pacientes podem agendar diretamente.

### 7.1 Estrutura da página pública

URL no formato:
- `nomedaclinica.seusistema.com.br` (subdomínio padrão)
- `agendar.nomedaclinica.com.br` (domínio próprio com CNAME, fase posterior)

**Conteúdo público da página:**

- Logo, nome e descrição curta da clínica.
- Endereço, telefone, mapa.
- Lista de profissionais (foto, nome, especialidade, mini-bio).
- Lista de procedimentos disponíveis para agendamento online.
- Avaliações (futuro).
- Botão "Agendar consulta".

### 7.2 Fluxo de agendamento pelo paciente

#### Passo 1 — Autenticação obrigatória

O paciente precisa criar uma conta antes de marcar. Justificativa:
- Validação de identidade (e-mail e telefone confirmados).
- Histórico do paciente (consultas anteriores, no-shows, preferências).
- Comunicação direta e segura (LGPD).
- Reaproveitamento de dados em marcações futuras.
- Possibilidade de acessar prescrições, atestados e exames pelo portal.

**Cadastro:**
- Nome completo
- CPF (validado)
- Data de nascimento
- E-mail (com confirmação)
- Telefone (com OTP via SMS ou WhatsApp)
- Senha (ou login social: Google, Apple)

**Confirmação:**
- Magic link por e-mail
- OTP no WhatsApp/SMS

#### Passo 2 — Seleção do que quer marcar

- Especialidade
- Profissional (opcional — pode marcar "qualquer disponível")
- Procedimento (primeira consulta, retorno, exame específico)
- Convênio ou particular

#### Passo 3 — Escolha de data e horário

- Calendário visual mostrando dias disponíveis.
- Slots horários do dia selecionado.
- Respeita todas as regras configuradas (antecedência mínima, capacidade, dia/horário do procedimento).
- Informa duração esperada e valor (se particular).

#### Passo 4 — Confirmação

- Resumo do agendamento.
- Termo de consentimento LGPD.
- Política de cancelamento (de acordo com configuração da clínica).
- Opção de pagamento antecipado (se configurado).

#### Passo 5 — Pós-agendamento

- E-mail e WhatsApp de confirmação.
- Adicionar ao Google Calendar/Apple Calendar (arquivo .ics).
- Lembrete automático conforme configuração (ver módulo de Automações).

### 7.3 Portal do paciente

Após criar conta, o paciente acessa um portal onde pode:

- Ver agendamentos futuros e passados.
- Reagendar ou cancelar (respeitando antecedência configurada).
- Acessar histórico de consultas (somente metadados — não conteúdo clínico).
- Baixar atestados, prescrições, solicitações de exame emitidos.
- Atualizar dados pessoais.
- Gerenciar preferências de comunicação (LGPD).
- Visualizar pendências financeiras.
- Pagar consultas pendentes online.

### 7.4 Configurações da página pública (admin)

- Quais profissionais aparecem na página.
- Quais procedimentos ficam disponíveis para agendamento online.
- Política de cancelamento (X horas antes).
- Política de no-show (consequências, taxa de penalidade se aplicável).
- Personalização visual (cor primária, logo, banner).
- Texto de boas-vindas e termos próprios.
- Pagamento online obrigatório, opcional ou desativado.
- Validação adicional (ex: aprovação manual de novos pacientes antes de confirmar agendamento).

### 7.5 Anti-abuso

- Limite de marcações por paciente em janela de tempo (ex: máximo 3 agendamentos ativos).
- Bloqueio temporário de pacientes com múltiplos no-shows (configurável).
- Captcha em criação de conta.
- Verificação de telefone obrigatória.
- Detecção de e-mails descartáveis.

---

## 8. Módulo: Kanban de Pacientes (Funis)

Sistema de funis configuráveis que permite acompanhar a jornada do paciente em qualquer fluxo: comercial (lead → cliente), clínico (triagem → alta), tratamento (sessão 1 → sessão 10), ou qualquer outro definido pela clínica.

### 8.1 Conceito

Cada **funil** é um quadro Kanban próprio com etapas customizáveis. Cada **card** representa um paciente (ou potencial paciente) em uma etapa específica. O paciente pode estar simultaneamente em múltiplos funis (ex: funil "Primeira consulta" e funil "Tratamento ortodôntico").

### 8.2 Funis pré-configurados (templates)

O sistema oferece templates prontos que a clínica pode adotar e customizar:

#### Template "Funil Comercial"
- Lead → Tentativa de contato → Contato realizado → Agendamento marcado → Compareceu → Cliente ativo → Perdido

#### Template "Pré-consulta"
- Cadastrado → Documentação enviada → Pagamento confirmado → Confirmado para consulta

#### Template "Pós-consulta"
- Aguardando NPS → NPS respondido → Retorno agendado → Tratamento em curso → Alta clínica

#### Template "Tratamento contínuo"
- Avaliação inicial → Plano de tratamento aceito → Sessão 1 → Sessão 2 → ... → Alta → Manutenção

#### Template "Recuperação de inativos"
- Inativo identificado → Tentativa 1 → Tentativa 2 → Retornou → Não retornou

### 8.3 Criação de funil customizado

Admin pode criar funis do zero com:

- **Nome do funil**
- **Descrição/objetivo**
- **Etapas (colunas):** ilimitadas, com:
  - Nome
  - Cor da coluna
  - Ordem
  - Tipo (inicial / intermediária / sucesso / falha)
  - Limite de cards (WIP limit, opcional)
- **Quem pode ver e mover cards** (perfis autorizados)
- **Automações vinculadas** (mover paciente para X dispara ação Y — ver Módulo de Automações)

### 8.4 Card do paciente

Cada card mostra:

- Foto/avatar do paciente
- Nome
- Etiquetas (tags coloridas)
- Próxima ação (texto curto: "Ligar dia 22/06")
- Data da última movimentação
- Profissional responsável (atribuído)
- Valor associado (se for funil comercial)
- Indicador visual de estagnação (card amarelo se está há X dias na mesma etapa)

Ao clicar no card, abre painel lateral com:

- Detalhes completos do paciente (link para a ficha)
- Histórico de movimentações no funil (timeline)
- Notas internas (anotações da equipe)
- Tarefas atribuídas
- Histórico de comunicações enviadas
- Botão para criar agendamento direto
- Botão para abrir prontuário (se permitido)

### 8.5 Etiquetas (tags)

Sistema de tags personalizáveis para classificar cards. Exemplos:

- **Origem:** Instagram, Google Ads, indicação, walk-in
- **Tipo de paciente:** VIP, frequente, primeira vez
- **Status especial:** urgente, em negociação, em risco de desistir
- **Característica clínica:** alérgico, gestante, idoso

Tags podem ser criadas livremente. Cards podem ter múltiplas tags. Funcionam como filtro no Kanban.

### 8.6 Movimentação de cards

- Arrastar e soltar entre colunas.
- Histórico de movimentações registrado (quem moveu, quando, de onde para onde).
- Tempo médio em cada etapa calculado automaticamente.
- Notificação opcional quando um card é movido (ex: avisar profissional quando paciente vai para "agendado").

### 8.7 Origem dos cards

Cards entram no funil de várias formas:

- **Manual:** alguém da equipe cria o card e atribui ao funil.
- **Automático via agendamento:** ao marcar primeira consulta, paciente entra no funil "Pré-consulta" na etapa "Cadastrado".
- **Automático via formulário web:** lead vindo do site/anúncio entra no funil "Comercial" na etapa "Lead".
- **Automático via integração:** webhook de Meta Ads, Google Ads, formulário externo.
- **Em massa:** importação por planilha.

### 8.8 Saída dos cards (resultado)

Quando um card chega a uma etapa marcada como "sucesso" ou "falha":

- Sistema registra o desfecho.
- Pode disparar automação (NPS, pesquisa de satisfação, campanha de reativação).
- Estatística do funil é atualizada.

### 8.9 Análises de funil

Cada funil tem painel de análise nativo:

- **Conversão por etapa:** % de cards que avança de uma etapa para a próxima.
- **Tempo médio por etapa:** quanto tempo um card permanece em cada coluna.
- **Tempo médio total do funil:** entrada → desfecho.
- **Taxa de sucesso:** % de cards que chegam ao desfecho positivo.
- **Origem dos cards:** distribuição por canal de entrada.
- **Cards estagnados:** cards parados há mais de X dias na mesma etapa.
- **Gargalos identificados:** etapas onde mais cards são perdidos.
- **Comparação entre períodos:** este mês vs. anterior.

### 8.10 Integrações nativas

- **Com Agenda:** mover card para "agendado" pode automaticamente criar agendamento. Marcar consulta pode mover card para etapa correspondente.
- **Com Prontuário:** atendimento finalizado pode mover card automaticamente para próxima etapa.
- **Com Marketing:** card movido para etapa final pode disparar pesquisa de satisfação.
- **Com Financeiro:** cobrança paga pode mover card.

---

## 9. Módulo: Automações

Sistema de automações construído sobre **gatilhos + condições + ações**. Permite que a clínica configure fluxos sem código.

### 9.1 Anatomia de uma automação

```
GATILHO (quando algo acontece)
   ↓
CONDIÇÕES (filtros opcionais — só executa se...)
   ↓
AÇÕES (faça isso) — pode ter delay ou sequência
```

### 9.2 Gatilhos disponíveis

#### Relacionados a agendamento

- Agendamento criado
- Agendamento confirmado
- Agendamento cancelado
- Agendamento marcado como faltoso
- Check-in realizado
- Atendimento finalizado
- Próximo agendamento em X tempo (24h, 2h, 30min antes)

#### Relacionados a paciente

- Paciente cadastrado
- Paciente faz aniversário
- Paciente inativo há X dias (sem consulta)
- Paciente atinge marco (ex: 10 consultas realizadas)
- Card movido para etapa X em um funil
- Tag adicionada ou removida

#### Relacionados a financeiro

- Cobrança criada
- Cobrança vence em X dias
- Cobrança vencida há X dias
- Pagamento confirmado
- Estorno realizado

#### Relacionados a clínico

- Prescrição emitida
- Solicitação de exame emitida
- Atestado emitido
- Retorno solicitado pelo médico

#### Manuais

- Disparo manual (botão na ficha do paciente)
- Disparo via importação em massa

### 9.3 Condições (filtros)

Após o gatilho, é possível filtrar quando a ação realmente acontece:

- Profissional específico (ex: "só para pacientes do Dr. X").
- Convênio específico.
- Especialidade.
- Procedimento.
- Tag do paciente.
- Etapa do funil.
- Janela de horário (ex: "só envia entre 8h e 20h").
- Dia da semana.

### 9.4 Ações disponíveis

#### Comunicação com paciente

- Enviar WhatsApp (template configurável, com variáveis)
- Enviar SMS
- Enviar e-mail
- Notificação push (se app mobile)

#### Operacionais

- Criar tarefa para a equipe
- Notificar usuário específico do sistema
- Adicionar/remover tag do paciente
- Mover card no funil
- Criar lançamento financeiro
- Bloquear paciente (após X no-shows)
- Adicionar à lista de espera

#### Externos

- Webhook (para n8n, Zapier, sistemas externos)
- Chamada de API customizada

### 9.5 Sequências (delay e múltiplos passos)

Uma automação pode ter múltiplos passos com tempo entre eles:

```
Agendamento criado
  ↓
[Imediato] Enviar WhatsApp de confirmação
  ↓
[48h antes] Enviar lembrete + pedido de confirmação
  ↓
[2h antes] Enviar lembrete final
  ↓
[Aguardar consulta]
  ↓
[24h após] Enviar pesquisa de satisfação
  ↓
[7 dias após] Se ainda não respondeu NPS, enviar lembrete
```

### 9.6 Templates pré-configurados

O sistema vem com automações prontas que podem ser ativadas em 1 clique:

#### "Confirmação de agendamento" (essencial)
- Gatilho: agendamento criado
- Ação: enviar WhatsApp com detalhes (data, hora, profissional, endereço)

#### "Lembrete 48h antes" (essencial)
- Gatilho: 48h antes do agendamento
- Ação: WhatsApp com pedido de confirmação ("Confirmo / Preciso remarcar")

#### "Lembrete 2h antes" (essencial)
- Gatilho: 2h antes do agendamento
- Ação: WhatsApp curto ("Te aguardamos em 2h")

#### "Pós-consulta + NPS" (essencial)
- Gatilho: atendimento finalizado
- Delay: 24h
- Ação: WhatsApp pedindo nota de 0-10 + comentário

#### "Aniversário do paciente"
- Gatilho: aniversário
- Ação: WhatsApp personalizado

#### "Reativação de inativos"
- Gatilho: paciente sem consulta há 6 meses
- Ação: WhatsApp com oferta de retorno

#### "Cobrança em atraso"
- Gatilho: cobrança vencida há 3 dias
- Ação: WhatsApp com link de pagamento

#### "Resultado de exame disponível"
- Gatilho: exame anexado ao prontuário
- Ação: e-mail/WhatsApp avisando paciente

### 9.7 Variáveis em mensagens

Mensagens podem usar variáveis dinâmicas:

- `{{paciente.primeiro_nome}}`
- `{{paciente.nome_completo}}`
- `{{agendamento.data}}`
- `{{agendamento.hora}}`
- `{{profissional.nome}}`
- `{{profissional.especialidade}}`
- `{{clinica.nome}}`
- `{{clinica.endereco}}`
- `{{procedimento.nome}}`
- `{{procedimento.preco}}`
- `{{link.confirmacao}}`
- `{{link.pagamento}}`
- `{{link.portal_paciente}}`

### 9.8 Limites e controle

- Limite diário de envios (evitar excesso/spam).
- Janela de envio (ex: nunca antes das 8h ou após 21h).
- Opt-out automático (paciente pode pedir para não receber).
- Conformidade com a política do WhatsApp Business (templates aprovados pela Meta para mensagens fora da janela de 24h).
- Log completo de execuções (sucesso, falha, erro de entrega).

### 9.9 Histórico de execuções

Tela de auditoria mostrando:

- Quando a automação rodou
- Para qual paciente
- Qual ação foi executada
- Status (entregue, lido, respondido, falha)
- Erro detalhado em caso de falha

---

## 10. Módulo: Prontuário Eletrônico


### 10.1 Definição conceitual

**Prontuário** = pasta do paciente (todo o histórico clínico).
**Atendimento (ou Consulta)** = registro específico dentro dessa pasta (o que aconteceu em uma data específica).

Pela Resolução CFM 1.638/2002, o prontuário **pertence ao paciente** e é um documento legal sigiloso.

### 10.2 Arquitetura em 3 camadas

#### Camada 1 — Estrutura fixa (obrigatória por lei)

Todo prontuário, independente da especialidade, contém:

- Identificação do paciente
- Anamnese (QP, HDA, HPP, HPF, história social)
- Exame físico
- Hipóteses diagnósticas
- Conduta
- Prescrições
- Evolução
- Identificação do profissional (nome, CRM)
- Data e hora

#### Camada 2 — Templates por especialidade

Cada especialidade tem templates próprios com campos específicos. Exemplos:

**Cardiologia:**
- Classe funcional NYHA (I, II, III, IV)
- Ausculta cardíaca (bulhas, sopros, FC)
- ECG (ritmo, eixo, intervalos PR/QRS/QT)
- Fatores de risco cardiovascular
- Escala de Framingham
- Medicações cardiotrópicas

**Pediatria:**
- Peso, estatura, PC
- Curva de crescimento (gráfico automático)
- Calendário de vacinação
- Marcos do DNPM
- Aleitamento
- Tipo de parto

**Dermatologia:**
- Body map (localização da lesão)
- Características da lesão (cor, tamanho, bordas)
- Dermatoscopia (upload de imagem)
- Antes/depois
- Escala de Fitzpatrick

**Psiquiatria:**
- Exame do estado mental
- Escalas (Hamilton, Beck, PHQ-9, GAD-7)
- Protocolo Columbia (risco de suicídio)
- Adesão medicamentosa

**Ginecologia/Obstetrícia:**
- DUM, tipo menstrual, G/P/A
- Idade gestacional
- Curva de peso gestacional
- USG
- Preventivo

**Pneumologia:**
- Escalas de dispneia (mMRC, Borg)
- Espirometria (VEF1, CVF, relação)
- Saturação, FR
- Score CAT (DPOC)
- Classificação GOLD
- Broncoscopia

#### Camada 3 — Customização do médico

Cada profissional pode criar templates próprios em cima dos da especialidade:

- "Template primeira consulta"
- "Template retorno HAS"
- "Template pré-operatório"

### 10.3 Builder de templates

Interface drag-and-drop para criar templates. O criador pode:

- Criar seções (blocos agrupadores de campos)
- Adicionar campos à seção (tipos: text, textarea, number, select, multiselect, date, checkbox, scale, image, body_map)
- Configurar campos como obrigatórios
- Adicionar validações (min/max, regex)
- Configurar valor padrão e placeholder
- Definir ordem de exibição
- Preview em tempo real

### 10.4 Vínculo: paciente vs. atendimento

#### Dados que ficam no PACIENTE (resumo clínico permanente)

Persistem entre atendimentos, visíveis no cabeçalho do prontuário, editáveis por qualquer médico autorizado:

- Alergias
- Comorbidades (HAS, DM, etc.)
- Medicações de uso contínuo
- Antecedentes cirúrgicos
- História familiar
- Hábitos (tabagismo, etilismo)
- Tipo sanguíneo
- Vacinação
- Contato de emergência

#### Dados que ficam no ATENDIMENTO (evento específico)

Imutáveis após finalização:

- Queixa principal
- HDA
- Exame físico do dia
- Sinais vitais medidos
- Hipótese diagnóstica
- Conduta
- Prescrições emitidas
- Evolução
- Template usado e versão

### 10.5 Fluxo de atendimento (prática do médico)

1. Médico clica no paciente da agenda (status `aguardando_atendimento`).
2. Abre tela de atendimento em tela única:
   - Painel esquerdo: dados permanentes do paciente (resumo clínico).
   - Painel central: ficha da consulta (template escolhido).
   - Painel direito: ações rápidas (prescrever, solicitar exame, atestado).
3. Sistema pergunta qual template usar (default: template da especialidade do profissional).
4. Médico preenche — pode usar texto livre, modelos salvos, ou ditado por IA.
5. Ao salvar como rascunho, o atendimento fica editável.
6. Ao finalizar, o atendimento vira registro imutável (correções só via adendo com data).

### 10.6 Versionamento de templates (crítico)

**Problema:** se um template é editado depois de já ter sido usado em atendimentos antigos, os registros antigos não podem ser afetados.

**Solução:** cada atendimento armazena um **snapshot da estrutura do template** no momento da finalização.

```
medical_records
├── template_id (referência)
├── template_version (número da versão)
├── structure_snapshot (JSON com a estrutura completa do template na época)
└── data (JSON com os valores preenchidos)
```

**Opção adotada:** Guardar dados + estrutura snapshot (atendimento auto-contido). Mais storage, mas integridade histórica garantida. Se o template for deletado no futuro, o atendimento continua renderizando corretamente.

### 10.7 Troca de template no meio do atendimento

Permitido, mas com alerta:
- Mostrar o que será mantido (campos existentes nos dois templates).
- Mostrar o que será perdido (campos exclusivos do template original).
- Salvar o que já foi preenchido antes da troca.

### 10.8 Template "Livre" (fallback)

Sempre deve existir um template genérico com apenas os campos mínimos obrigatórios (QP, HDA, exame físico, hipótese, conduta — todos em texto livre). Serve para:

- Médicos que não querem estrutura rígida
- Situações de urgência
- Especialidades sem template criado
- Atendimentos rápidos

### 10.9 Campo `free_notes` (escape hatch)

Todo atendimento tem um campo opcional de notas livres, independente do template. Evita que o sistema engesse a prática clínica.

### 10.10 Recursos clínicos especializados (compartilhados entre templates)

- Gráficos de evolução (PA, peso, IMC, glicemia, HbA1c).
- Curva de crescimento pediátrica.
- Acompanhamento pré-natal.
- Tabelas compartilháveis com o paciente.
- Antes/depois com imagens.
- Anexo de arquivos, fotos, exames.
- Registro de CID-10 com busca rápida.

### 10.11 IA aplicada ao prontuário

- Gravação de áudio da consulta.
- Transcrição automática em tempo real.
- Geração automática de resumo clínico estruturado (QP, HDA, CID, condutas, exames, prescrições).
- Múltiplos formatos de resumo (SOAP, livre, estruturado).
- Busca por informações no histórico usando IA conversacional.

---

## 11. Módulo: Prescrição e Documentos

### 11.1 Prescrição digital

- Base de medicamentos (60 mil+).
- Autocomplete de medicamentos.
- Modelos de prescrição salvos e reutilizáveis.
- Validação automática de interações medicamentosas.
- Prescrição controlada (receita azul e amarela).
- Integração com Memed.

### 11.2 Documentos clínicos

- Atestados médicos.
- Solicitação de exames (modelos salvos).
- Laudos.
- Declarações de comparecimento.
- Receituário simples.
- Envio ao paciente por e-mail, SMS ou WhatsApp.
- Assinatura digital padrão ICP-Brasil.
- Impressão e geração de PDF.

### 11.3 Vínculo

Toda prescrição e todo documento emitido são vinculados a:
- Um atendimento (obrigatório)
- Um paciente (herdado do atendimento)
- Um profissional (herdado do atendimento)

Ficam disponíveis no histórico do paciente mesmo após o atendimento ser finalizado.

---

## 12. Módulo: Financeiro

### 12.1 Controle básico

- Contas a pagar e a receber.
- Fluxo de caixa.
- DRE.
- Fechamento de data.
- Tela de auditoria.
- Conciliação bancária automática (importação de extratos, match automático, baixa automática).
- Relatórios de receita, despesa, inadimplência.
- Controle por centro de custo.
- Repasse médico automático.

### 12.2 Pagamentos

- Pagamento online integrado (cartão, Pix).
- Link de pagamento compartilhável.
- Pagamento no ato do agendamento.
- Emissão de NFS-e integrada.
- Emissão de recibos.
- Comunicação automática com inadimplentes.
- Cobrança recorrente.

### 12.3 Faturamento TISS (convênios)

- Preenchimento automático de guias (consulta, SP/SADT, honorários).
- Validação de campos com apontamento de erros.
- Geração de lotes XML.
- Envio às operadoras.
- Controle de glosas.
- Gestão de tabelas de convênios.

### 12.4 Lógica de funcionamento

Cada consulta atendida gera automaticamente um `lançamento financeiro` com status (a receber, recebido, cancelado).

**Fluxo particular:**
1. Consulta marcada → pendência de pagamento criada.
2. Recepção recebe no caixa → vira receita realizada.

**Fluxo convênio:**
1. Consulta marcada → registro de convênio criado.
2. Ao final do mês, fecha-se o lote TISS → envia à operadora → fica em "aguardando pagamento".
3. Quando pago pela operadora → baixa manual ou por conciliação.
4. Glosas identificadas viram pendências de recurso.

**Repasse médico:**
- Configuração por profissional (ex: Dr. Carlos recebe 70% dos particulares e 50% dos convênios).
- Relatório mensal automático.
- Integração com folha de pagamento (futuro).

---

## 13. Módulo: Gestão de Pacientes / CRM

### 13.1 Funcionalidades

- Cadastro completo (dados pessoais, clínicos, fiscais).
- Segmentação por etiquetas/tags.
- Ranking de pacientes (TOP 4% — "estrela dourada").
- Identificação automática dos pacientes mais valiosos.
- Ticket médio por paciente.
- Histórico de relacionamento (todas as interações).
- Pré-cadastro via formulário público.
- LGPD: termos de consentimento e gestão de dados.

### 13.2 Estrutura da ficha do paciente

A ficha tem **abas internas** (tabs):

- **Dados pessoais:** nome, CPF, nascimento, contato, endereço.
- **Dados clínicos:** resumo clínico permanente (alergias, comorbidades, medicações contínuas, etc.).
- **Histórico de atendimentos:** timeline com todos os atendimentos realizados. Acesso ao conteúdo de cada um sujeito à permissão do usuário logado.
- **Documentos:** arquivos anexados, exames carregados.
- **Financeiro:** histórico de pagamentos, pendências.
- **Mensagens:** comunicações enviadas (WhatsApp, e-mail, SMS).
- **Configurações:** preferências de comunicação, LGPD.

### 13.3 Timeline de atendimentos

Cada atendimento na timeline é um card com:

- Tag colorida da especialidade.
- Tag do tipo (primeira consulta / retorno).
- Data e hora.
- Template usado.
- Resumo em uma linha.
- Profissional que atendeu.
- CID registrado.

Ao clicar em um card, abre o atendimento completo com todos os dados preenchidos naquele dia.

### 13.4 Regra de acesso

O histórico clínico detalhado só é visível para profissionais autorizados. Recepcionista vê "teve consulta em X data com Dr. Y", mas não vê a evolução clínica.

---

## 14. Módulo: Marketing e Relacionamento

### 14.1 Campanhas

- E-mail marketing com modelos personalizáveis.
- Segmentação avançada por perfil.
- E-mail automático de boas-vindas.
- E-mail automático de aniversário.
- Sequências automatizadas (drip campaigns).
- Campanhas via WhatsApp.
- Campanhas para pacientes TOP.
- Reativação de pacientes inativos.

### 14.2 Retenção

- NPS automático pós-consulta.
- Pesquisas de satisfação.
- Módulo de marketing médico.
- Marketing de relacionamento.

### 14.3 Lógica de funcionamento

O módulo lê dados do módulo de Pacientes e cria ações em cima deles:

1. Criar segmento (ex: "pacientes que não voltam há 6 meses").
2. Disparar campanha (e-mail, WhatsApp) para aquele segmento.
3. Agendar envios automáticos baseados em gatilhos (aniversário, pós-consulta, lembrete de exame anual).
4. Medir resposta (abertura, clique, agendamento gerado).

### 14.4 Gatilhos automáticos pré-configurados

- **Pós-consulta (24h):** mensagem de agradecimento + link para NPS.
- **Pré-retorno (3 dias antes):** lembrete do retorno agendado.
- **Aniversário:** mensagem personalizada.
- **Inatividade (6 meses):** campanha de reativação.
- **Aniversário de tratamento:** marcos comemorativos.

---

## 15. Módulo: Relatórios

### 15.1 Tipos de relatórios

**Operacionais:**
- Ocupação de agenda por profissional/período.
- Taxa de no-show.
- Ticket médio por consulta.
- Tempo médio de atendimento.
- Pacientes novos vs. recorrentes.

**Financeiros:**
- DRE (mensal, trimestral, anual).
- Inadimplência.
- Recebimentos por convênio.
- Recebimentos por forma de pagamento.
- Repasse médico.
- Evolução de receita.

**Clínicos:**
- CIDs mais atendidos.
- Procedimentos mais realizados.
- Perfil epidemiológico da clínica.

**Por profissional:**
- Nº de consultas realizadas.
- Faturamento gerado.
- Taxa de retorno dos pacientes atendidos.
- NPS individual.

### 15.2 Regras

- Permissões configuráveis pelo admin: quem vê o quê.
- Exportação em Excel e PDF.
- Filtros por período, profissional, convênio, tipo de procedimento.
- Gráficos interativos.
- Comparação entre períodos (MoM, YoY).

---

## 16. Modelagem de Dados (Visão Geral)

### 16.1 Entidades principais

```
organizations (tenants — clínicas clientes)
├── id
├── name, cnpj, logo, address
├── plan_id
└── settings

units (unidades físicas da clínica)
├── id
├── organization_id
└── name, address

rooms (salas)
├── id
└── unit_id

equipment (equipamentos)
├── id
└── unit_id

users
├── id
├── organization_id
├── name, email, password_hash
└── active

roles (perfis de acesso)
├── id
├── organization_id (nullable — roles padrão do sistema)
└── name

permissions (permissões granulares)
├── id
└── code (ex: "patients.view", "financial.edit")

role_permissions (N:N)
user_roles (N:N, um usuário pode ter múltiplos perfis)
user_permissions_overrides (overrides individuais)

professionals (herda de users)
├── user_id
├── council_number (CRM, CRO, CRP, etc.)
├── specialty_id
└── signature_certificate

specialties
├── id
└── name

patients
├── id
├── organization_id
├── name, cpf, birth_date, gender, contact
└── created_at

patient_clinical_summary (resumo clínico — 1:1 com paciente)
├── patient_id
├── allergies (JSON)
├── comorbidities (JSON)
├── continuous_medications (JSON)
├── surgical_history (JSON)
├── family_history (JSON)
├── habits (JSON)
├── blood_type
└── last_updated_by, last_updated_at

appointments (agendamentos)
├── id
├── organization_id
├── patient_id
├── professional_id
├── unit_id, room_id
├── procedure_id
├── scheduled_at, duration
├── status
└── created_at

procedures (procedimentos/tipos de consulta)
├── id
├── organization_id
├── name, default_duration
└── price_table (JSON)

medical_record_templates
├── id
├── organization_id (nullable — templates do sistema)
├── specialty_id
├── scope (system | organization | professional)
├── professional_id (nullable)
└── name

template_versions (versionamento de templates)
├── id
├── template_id
├── version_number
├── structure (JSON — estrutura completa com seções e campos)
├── is_active
└── created_at

medical_records (atendimentos)
├── id
├── organization_id
├── patient_id
├── professional_id
├── appointment_id
├── template_id, template_version
├── structure_snapshot (JSON — snapshot da estrutura no momento)
├── data (JSON — valores preenchidos)
├── free_notes (text)
├── status (draft | finalized | signed)
├── signed_at, signed_by
├── cid_codes (JSON)
└── created_at

prescriptions
├── id
├── medical_record_id
├── medications (JSON)
└── signed_at

exam_requests
├── id
├── medical_record_id
├── exams (JSON)
└── signed_at

documents (atestados, declarações, laudos)
├── id
├── medical_record_id
├── type, content
└── signed_at

financial_entries (lançamentos financeiros)
├── id
├── organization_id
├── patient_id
├── appointment_id (nullable)
├── type (income | expense)
├── category
├── amount
├── due_date, paid_at
├── payment_method
└── status

tiss_lots (lotes TISS)
├── id
├── organization_id
├── insurance_company_id
├── period
├── xml_file
├── status
└── sent_at

insurance_companies (convênios)
├── id
├── organization_id
├── name, ans_code
└── price_table (JSON)

marketing_campaigns
├── id
├── organization_id
├── name, channel (email | whatsapp | sms)
├── segment_id
├── content
├── scheduled_at
└── status

patient_segments
├── id
├── organization_id
├── name
└── rules (JSON — regras de segmentação)

communications (mensagens enviadas)
├── id
├── patient_id
├── channel
├── content
├── sent_at
└── status (sent | delivered | read | failed)
```

### 16.2 Regras de relacionamento críticas

1. **Todo atendimento (medical_record) é vinculado obrigatoriamente a:** paciente + profissional + template + versão de template.
2. **Opcionalmente vinculado a:** um agendamento (pode haver atendimento sem agendamento prévio, como encaixe).
3. **Prescrições, solicitações de exame e documentos** são sempre vinculados a um atendimento.
4. **Lançamentos financeiros** podem ser vinculados ou não a um agendamento (despesas operacionais não têm vínculo).
5. **Isolamento de tenant:** toda query deve filtrar por `organization_id`. Zero exceções.

### 16.3 Stack técnica geral

Toda a stack é em **TypeScript**, alinhada ao fluxo de desenvolvimento do projeto (VS Code + Claude Code + Codex). A escolha por linguagem unificada (TS no front, no back e nas Edge Functions) reduz contexto-switching e permite compartilhar tipos entre camadas.

#### Backend e Banco de Dados

- **Banco de dados:** PostgreSQL via **Supabase Cloud** no MVP. Aproveita RLS nativo para isolamento multi-tenant, JSONB para campos flexíveis (estrutura de prontuário, regras de funil), Full-Text Search nativo, e extensões como `pgvector` (busca semântica futura) e `pgcrypto` (criptografia em repouso).
- **Migração futura:** quando o projeto escalar e exigir mais controle (compliance específico, soberania de dados, custo), migrar para PostgreSQL auto-hospedado em VPS — a transição é viável porque o Supabase é Postgres puro com camadas adicionais.
- **Autenticação:** Supabase Auth (JWT, magic links, OAuth com Google/Apple, MFA via TOTP).
- **Edge Functions:** Supabase Edge Functions em Deno + TypeScript para lógica próxima ao banco (validações TISS, triggers pós-atendimento, processamento de webhooks).
- **Backend principal (API):** Node.js + TypeScript com **NestJS**. Justificativa: estrutura modular obrigatória dado o tamanho do domínio (10+ módulos), decorators para validação e permissões, injeção de dependência nativa, suporte a OpenAPI/Swagger automático.
- **Validação de schema:** **Zod** (compartilha schemas entre front e back, gera tipos TS automaticamente).
- **ORM/Query builder:** **Drizzle ORM** (lightweight, TypeScript-first, gera tipos do schema do banco, sintaxe próxima a SQL — mais previsível que Prisma para queries complexas com RLS) ou **Prisma** (mais maduro, ecossistema maior, mas pode ter atritos com RLS do Supabase).
- **Filas de jobs:** **pg-boss** (filas nativas no próprio PostgreSQL, evita dependência de Redis no MVP). Migrar para **BullMQ + Redis** se volume exigir.
- **E-mail transacional:** **Resend** (API moderna, boa entregabilidade, free tier suficiente para MVP) ou Amazon SES (mais barato em escala).
- **WhatsApp:** **Meta Cloud API** (oficial, mais estável) ou **Evolution API** (self-host, mais flexível, requer infra).
- **Monitoramento:** **Sentry** para erros, **PostHog** para analytics de produto e session replay, Supabase Logs para banco.

#### Frontend

- **Framework:** **Next.js 14+** com App Router e TypeScript.
- **Linguagem:** TypeScript em todo o código.
- **Estilização:** **Tailwind CSS** com design tokens configurados conforme seção 4 (cores, tipografia, espaçamentos).
- **Sistema de componentes base:** **shadcn/ui** — não é uma lib de componentes, é um conjunto de componentes copiados para o projeto e customizáveis. Ideal para um design system próprio, evita "cara de Bootstrap".
- **Gerenciamento de estado servidor:** **TanStack Query (React Query)** v5 — cache, sincronização, optimistic updates, paginação, tudo resolvido.
- **Gerenciamento de estado cliente:** **Zustand** (simples, lightweight, sem boilerplate de Redux).
- **Formulários:** **React Hook Form + Zod** — performance, validação tipada, integração nativa.
- **Roteamento:** roteamento nativo do Next.js (App Router).
- **Internacionalização:** **next-intl** (preparar para futuro multi-idioma, mesmo que MVP seja só pt-BR).

#### Infraestrutura

- **Frontend:** Vercel (deploy contínuo, edge functions, analytics).
- **Backend:** Supabase Cloud (banco + auth + storage + edge functions) + Railway ou Render para o NestJS (alternativa: Vercel para tudo).
- **CDN de arquivos:** Supabase Storage com CDN integrado para anexos clínicos.
- **CI/CD:** GitHub Actions (lint, test, build, deploy automático).

### 16.4 Bibliotecas específicas por funcionalidade

Esta seção detalha as bibliotecas indicadas para cada funcionalidade complexa do sistema. Todas TypeScript-first.

#### Calendário e agenda

- **Biblioteca principal:** **FullCalendar v6+** (`@fullcalendar/react`).
  - Justificativa: é a biblioteca mais madura do ecossistema React para calendários complexos. Suporta visualização diária/semanal/mensal/lista nativamente, recursos paralelos (múltiplos profissionais em colunas), drag-and-drop para mover agendamentos, redimensionamento de eventos, áreas de bloqueio, recorrência.
  - Alternativa: **react-big-calendar** (mais simples, menos features, MIT permissiva — boa se FullCalendar pesar).
  - Custo: FullCalendar Premium para visualização "Resource Timeline" (colunas por profissional) é pago. Para MVP, dá pra usar a versão MIT com visualização semanal padrão e replicar o paralelismo manualmente.
- **Manipulação de datas:** **date-fns** (mais leve que moment.js, immutable, tree-shakeable). Para timezone: **date-fns-tz**.

#### Seletor de data (date picker)

- **react-day-picker v9+** — leve, acessível, totalmente customizável visualmente, suporta seleção de intervalo (data inicial + data final no mesmo calendário) que é o padrão para filtros de relatórios.
- Estilização aplicada com Tailwind para casar com o design system.

#### Kanban com drag-and-drop

- **Biblioteca principal:** **@dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`).
  - Justificativa: é a evolução do antigo `react-beautiful-dnd` (descontinuado em 2023). Mais leve, mais flexível, suporte completo a touch/mobile, acessível (teclado e leitor de tela), funciona bem com listas longas (virtualização).
  - Alternativa: **dnd kit** combinado com **react-virtuoso** se as colunas tiverem centenas de cards.
- **Componentes pré-prontos:** **shadcn/ui** tem padrões de Kanban que aceleram a construção visual.

#### Editor de prontuário (rich text)

- **TipTap v2** baseado em ProseMirror.
  - Justificativa: editor moderno, headless (estilização totalmente sua), extensões para tabelas, imagens, atalhos, salvar como JSON estruturado (essencial para versionamento de prontuário).
  - Alternativa: **Lexical** (Meta) — também ótimo, mais novo, menos extensões prontas.

#### Builder de templates (drag-and-drop de campos)

- **@dnd-kit** (mesmo do Kanban) para mover blocos de campos.
- **react-jsonschema-form** ou **uniforms** se quiser gerar formulários a partir de schema JSON — útil para o lado do médico que usa o template.

#### Gráficos e relatórios

- **Recharts** — boa integração com React, declarativo, performance suficiente para dashboards típicos.
  - Alternativa: **Tremor** (camada sobre Recharts com componentes prontos de dashboard tipo "card de KPI + gráfico"). Acelera muito relatórios.
- Para gráficos médicos específicos (curva de crescimento, gráfico de pressão arterial): Recharts custom.

#### Tabelas avançadas

- **TanStack Table v8** — headless, lida com sort, filter, paginação, agrupamento. Combinar com **TanStack Virtual** quando a tabela tiver milhares de linhas.

#### Animações e transições

- **Framer Motion** — animações declarativas, transições de página, modais, drawers. É o padrão de fato para React.
- **AutoAnimate** — biblioteca minúscula que anima entrada/saída de itens em listas automaticamente, sem código. Útil para Kanban e listas dinâmicas.

#### Notificações (toasts)

- **Sonner** — toast moderno, leve, acessível, animações suaves. Padrão atual da comunidade.

#### Diálogos, modais, dropdowns acessíveis

- **Radix UI Primitives** — primitives acessíveis sem estilo (já vem com shadcn/ui).

#### Ícones

- **Lucide React** — biblioteca de ícones já usada no protótipo. Mais de 1500 ícones, tree-shakeable, consistente.

#### Máscaras de input (CPF, telefone, CEP)

- **react-imask** ou **@react-input/mask** para máscaras de entrada.
- **Validação:** **validar-cpf**, **brazilian-values** para validações brasileiras.

#### Upload de arquivos

- **Uppy** ou implementação direta com Supabase Storage SDK. Para drag-and-drop de exames e anexos clínicos.

#### PDFs (geração e exibição)

- **Geração:** **@react-pdf/renderer** para gerar PDFs no client (atestados, prescrições, receituários).
- **Exibição:** **react-pdf** (Mozilla pdf.js wrapper) para mostrar PDFs anexados.

#### Assinatura digital ICP-Brasil

- **Web Crypto API** nativa do navegador + integração com SDKs de provedores (Certisign, Soluti, ViDaaS).
- Para certificado A3 (token físico): **Lacuna Web PKI**.

#### Telemedicina (videochamada)

- **LiveKit** (open source, self-host opcional) ou **Daily.co** (SaaS, fácil de integrar).
- Alternativa enterprise: **Twilio Video**.

#### Editor de mensagens (rich text leve para WhatsApp/Email)

- **TipTap** (mesma do prontuário) ou **react-markdown-editor-lite** para algo mais simples.

#### WebSockets e Realtime

- **Supabase Realtime SDK** (já incluso no `@supabase/supabase-js`) para subscrições no banco — usado para atualização ao vivo da agenda quando outro usuário marca uma consulta.

#### Internacionalização e moedas

- **next-intl** para textos.
- **Intl.NumberFormat** nativo para formatação de moeda (R$).
- **Intl.DateTimeFormat** para datas localizadas.

#### Testes

- **Vitest** para testes unitários (mais rápido que Jest, compatível com TS nativo).
- **Playwright** para testes end-to-end.
- **MSW (Mock Service Worker)** para mockar API em testes.
- **Supabase RLS Test Helpers** — testar policies de segurança em CI.

### 16.5 Estratégia de instalação (resumo executável)

Para o início do projeto:

```bash
# Frontend
npx create-next-app@latest clinica-saas --typescript --tailwind --app
cd clinica-saas

# UI e design system
npx shadcn-ui@latest init
npm install lucide-react sonner framer-motion

# Estado e formulários
npm install @tanstack/react-query zustand react-hook-form zod @hookform/resolvers

# Datas e calendário
npm install date-fns date-fns-tz react-day-picker
npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction

# Kanban
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# Tabelas
npm install @tanstack/react-table @tanstack/react-virtual

# Gráficos
npm install recharts

# Editor rich text
npm install @tiptap/react @tiptap/starter-kit @tiptap/pm

# Validações BR
npm install brazilian-values @react-input/mask

# PDFs
npm install @react-pdf/renderer react-pdf

# Supabase
npm install @supabase/supabase-js @supabase/ssr
```

### 16.6 Considerações específicas da escolha Supabase

**Vantagens para este projeto:**

1. **RLS (Row Level Security):** isolamento multi-tenant por `organization_id` diretamente no banco via policies, sem depender exclusivamente da camada de aplicação. Reduz drasticamente o risco de vazamento de dados entre clínicas.
2. **Realtime nativo:** agenda atualiza ao vivo quando uma recepcionista marca uma consulta em outra aba, sem precisar implementar WebSockets manualmente.
3. **Storage integrado:** upload direto de exames, fotos de dermatologia, body maps e laudos, com policies de acesso por tenant.
4. **Auth robusto:** 2FA, magic link, OAuth, políticas de senha — tudo pronto. Essencial para dados sensíveis de saúde.
5. **Versionamento de schema via migrations:** alinhado à prática de desenvolvimento profissional e necessário para rastreabilidade regulatória.
6. **Stack já dominada:** redução significativa da curva de aprendizado e do tempo até o MVP funcional.

**Pontos de atenção:**

1. **Soberania de dados:** Supabase Cloud hospeda em AWS (múltiplas regiões). Para dados de saúde no Brasil, avaliar hospedar na região `sa-east-1` (São Paulo) ou considerar self-host para clínicas com exigência contratual de soberania.
2. **RLS exige disciplina:** toda tabela multi-tenant precisa ter policies bem escritas. Erros em policies podem causar vazamento silencioso. Recomenda-se testes automatizados específicos para validar isolamento.
3. **Limites de Edge Functions:** não usar para lógica de longa duração (>30s). Fluxos complexos como geração de lote TISS devem rodar em jobs assíncronos.
4. **Pricing:** monitorar uso de bandwidth e storage, principalmente com anexos clínicos que podem crescer rapidamente.

### 16.7 Estrutura de RLS recomendada

Toda tabela multi-tenant deve seguir o padrão:

```sql
-- Exemplo: tabela patients
alter table patients enable row level security;

create policy "Users can only see patients from their organization"
  on patients for select
  using (organization_id = (
    select organization_id from users where id = auth.uid()
  ));

create policy "Users with permission can insert patients"
  on patients for insert
  with check (
    organization_id = (select organization_id from users where id = auth.uid())
    and exists (
      select 1 from user_permissions
      where user_id = auth.uid() and permission_code = 'patients.create'
    )
  );
```

O mesmo padrão se aplica a `medical_records`, `appointments`, `financial_entries` e todas as demais tabelas sensíveis. Nenhuma query da aplicação deve poder escapar dessas policies.

---

## 17. Módulo: Integrações

Hub central de integrações com serviços externos. Cada integração é configurada uma vez pelo admin e fica disponível em todo o sistema.

### 17.1 Integração com Google Agenda

#### Objetivo

Sincronização bidirecional entre a agenda do sistema e o Google Calendar do profissional. Quando um evento é criado, editado ou cancelado no sistema, reflete imediatamente no Google Calendar do profissional (e vice-versa, conforme configuração).

#### Justificativa

Profissionais de saúde frequentemente usam o Google Calendar como agenda pessoal unificada (consultas + reuniões + vida pessoal). Sem integração, ficam alternando entre dois calendários, o que gera conflitos e esquecimentos. Esta é uma feature de **alta percepção de valor** que reduz fricção e amarra o profissional ao sistema.

#### Modos de sincronização

O profissional escolhe um dos modos:

1. **Sincronização total (bidirecional):**
   - Eventos criados no sistema aparecem no Google Calendar.
   - Eventos criados diretamente no Google Calendar (ex: "almoço com fornecedor") aparecem como bloqueios no sistema.
   - Edições em qualquer lado refletem no outro.
   - Mais conveniente, mais complexo de implementar (resolver conflitos, evitar loops).

2. **Sincronização unidirecional sistema → Google:**
   - Apenas eventos do sistema vão para o Google.
   - Eventos criados direto no Google não vêm para o sistema.
   - Mais simples e mais comum como padrão inicial.

3. **Sincronização unidirecional Google → sistema (somente bloqueios):**
   - Sistema lê o Google Calendar e cria bloqueios automáticos para os horários ocupados.
   - Não cria agendamentos reais (sem paciente associado).
   - Útil para evitar que recepcionista marque consulta em horário de reunião pessoal do médico.

#### Conteúdo do evento sincronizado

Cada evento sincronizado contém:

- **Título:** "[Nome da clínica] Consulta — Nome do paciente"
- **Horário de início e fim**
- **Localização:** endereço da unidade ou link de teleconsulta
- **Descrição:** procedimento, convênio, observações (sem dados clínicos sensíveis)
- **Lembrete:** 30min antes (configurável)
- **Status:** confirmado / tentativo / cancelado
- **Calendário de destino:** o profissional escolhe em qual calendário do Google os eventos vão parar (geralmente um calendário dedicado tipo "Consultório - Dr. Carlos")

#### Privacidade e LGPD na sincronização

Tratamento de dado de saúde no Google Calendar é um ponto sensível. O sistema oferece três níveis de privacidade configuráveis:

1. **Detalhado:** título com nome completo do paciente + procedimento. Útil para profissional solo que controla o próprio Google. **Requer consentimento explícito do paciente.**
2. **Anonimizado:** título apenas com iniciais do paciente ou número do prontuário. Sem dados clínicos.
3. **Genérico:** título apenas como "Atendimento" ou "Bloqueado". Sem identificação alguma. Modo padrão recomendado.

O profissional escolhe o nível nas configurações pessoais. O sistema avisa as implicações de cada escolha.

#### Resolução de conflitos

Quando o mesmo evento sofre alteração simultânea nos dois lados:

- Sistema prevalece sobre o Google em campos clínicos (paciente, procedimento, profissional).
- Google prevalece em campos pessoais (cor do evento, lembretes adicionais que o profissional configurou).
- Conflito de horário (mesmo evento movido em ambos os lados): mais recente vence, evento anterior fica em log de auditoria.
- Loop de sincronização prevenido por `sync_token` e `etag` do Google Calendar API.

#### Implementação técnica

- **Autenticação:** OAuth 2.0 com escopo `https://www.googleapis.com/auth/calendar.events`.
- **Armazenamento de tokens:** refresh tokens criptografados no banco (Supabase com `pgcrypto`).
- **Sincronização inicial:** ao conectar, sistema importa eventos futuros (próximos 90 dias).
- **Sincronização contínua:** push notifications via Google Calendar API (webhooks) + fallback de polling a cada 5 minutos.
- **Mapeamento de IDs:** cada evento do sistema guarda o `google_event_id` correspondente.
- **Logs de sincronização:** todas as operações são registradas com status (sucesso, falha, conflito).

#### Configuração pelo profissional

Tela "Configurações > Integrações > Google Agenda" mostra:

1. Botão "Conectar Google Agenda" (abre OAuth do Google).
2. Após conectado: e-mail conectado, calendário de destino selecionável, modo de sincronização, nível de privacidade.
3. Botão "Sincronizar agora" (força sincronização imediata).
4. Botão "Desconectar" (remove tokens e para sincronização).
5. Log das últimas 50 operações de sincronização.

#### Considerações de uso

- **Reagendamentos:** quando recepcionista move uma consulta para outro horário, o evento no Google se move automaticamente. O paciente, se foi convidado pelo Google, recebe o e-mail de atualização.
- **Cancelamentos:** consulta cancelada vira evento cancelado no Google (não deletado, para manter rastro).
- **Encaixes:** encaixes são marcados como "tentative" no Google (cinza), diferenciando dos confirmados.
- **Teleconsulta:** evento inclui o link da sala de teleconsulta no campo "localização" e "descrição".

### 17.2 Outras integrações previstas

#### Google Drive
- Backup automático de prontuários (criptografados).
- Armazenamento de exames anexados (alternativa ao Supabase Storage para clínicas que preferem manter no próprio Drive).
- Compartilhamento de pastas de paciente com o próprio paciente (futuro).

#### WhatsApp Business
- API oficial (Meta Cloud API) ou parceiros (Z-API, Evolution API).
- Envio de templates aprovados pela Meta.
- Recebimento de mensagens (para confirmações via clique).
- Sessão de 24h para mensagens livres.

#### Memed
- Prescrição eletrônica com base de medicamentos validada.
- Assinatura digital integrada.
- Envio direto ao paciente.

#### Gateways de pagamento
- Stripe, Pagar.me, Mercado Pago, Asaas.
- Link de pagamento dinâmico.
- Pix com QR Code.
- Cartão de crédito (com tokenização).
- Webhook de confirmação para automações.

#### Assinatura digital ICP-Brasil
- Integração com Certisign, Soluti, Valid ou similar.
- Assinatura de prontuários, prescrições, atestados, laudos.
- Token A3 ou certificado em nuvem.

#### Webhooks de saída
- Disparo para URLs externas (n8n, Zapier, sistema próprio do cliente).
- Eventos disponíveis: agendamento criado, atendimento finalizado, pagamento recebido, paciente cadastrado etc.
- Retry automático em caso de falha.
- Assinatura HMAC para validar origem.

#### API pública
- REST API documentada (OpenAPI/Swagger).
- Autenticação via API key por tenant.
- Rate limiting configurável.
- Endpoints para: pacientes, agendamentos, atendimentos (metadados), financeiro.
- Sandbox de testes.

### 17.3 Logs e auditoria de integrações

- Cada integração mantém log próprio.
- Sucessos, falhas e payloads (com mascaramento de dados sensíveis).
- Retenção mínima de 90 dias.
- Alertas automáticos para admin em caso de falhas recorrentes.
- Dashboard de saúde das integrações.

---

## 18. Considerações Regulatórias

### 18.1 LGPD aplicada à saúde

- Dado de saúde é **dado pessoal sensível** (Art. 5º, II da LGPD).
- Exige base legal específica (consentimento, tutela da saúde, etc.).
- Necessidade de DPO designado.
- Registro de operações de tratamento.
- Direito do titular: acesso, correção, eliminação, portabilidade.

### 18.2 Resoluções do CFM aplicáveis

- **CFM 1.638/2002:** definição de prontuário médico.
- **CFM 1.821/2007:** viabiliza prontuário eletrônico com validade jurídica.
- **CFM 2.299/2021:** regulamenta a telemedicina.
- Prontuário eletrônico exige **arquivamento permanente**.

### 18.3 Certificações e padrões

- **SBIS (Sociedade Brasileira de Informática em Saúde):** certificação de prontuário eletrônico. Nível 1 (básico) e Nível 2 (avançado). Complexa, longa e cara — planejar para versão madura.
- **ICP-Brasil:** assinatura digital obrigatória para validade jurídica do prontuário.
- **TISS 4.x:** padrão obrigatório para comunicação com operadoras de saúde. Exige homologação com cada operadora.

### 18.4 Segurança técnica obrigatória

- Criptografia em trânsito (TLS 1.2+).
- Criptografia em repouso (banco de dados).
- Backup automático diário com retenção mínima de 30 dias.
- Trilha de auditoria completa (log de quem acessou o quê e quando).
- Autenticação forte (2FA recomendado para admins).
- Política de senhas.
- Isolamento de dados entre tenants (inegociável).
- Retenção de prontuário: mínimo 20 anos após último registro.

---

## Observações finais

Este documento é a base de escopo e especificação do produto. À medida que o desenvolvimento avança, recomenda-se:

1. Validar cada módulo com um médico-parceiro (preferencialmente um que já usou 2-3 sistemas concorrentes).
2. Priorizar arquitetura de dados correta desde o início — migrações futuras de estrutura clínica são dolorosas.
3. Construir logs e auditoria desde a primeira linha de código — retrofit é inviável.
4. Não subestimar a complexidade do faturamento TISS: é o módulo que mais exige tempo de desenvolvimento e homologação.
5. Testes automatizados de RLS são obrigatórios — qualquer falha de policy pode causar vazamento de dados entre clínicas.

---

**Documento versão 1.0 — Base de desenvolvimento**
