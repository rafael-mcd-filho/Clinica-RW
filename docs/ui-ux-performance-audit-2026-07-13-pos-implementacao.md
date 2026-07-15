# Auditoria pós-implementação de UI, UX e desempenho

Data: 13/07/2026

Documento de referência: `docs/ui-ux-performance-audit.md`

## Resumo executivo

O plano original foi implementado em sua maior parte no código. Os cinco itens
P0 receberam correções estruturais, e as principais fontes identificadas de
lentidão percebida — consultas globais, payloads excessivos, recargas em rajada,
abas carregadas antecipadamente e mudanças de largura — foram diretamente
tratadas.

A correção mais importante para a variação horizontal entre abas foi reservar
permanentemente o espaço da barra de rolagem com `scrollbar-gutter: stable`, com
fallback para navegadores sem suporte. O shell também passou a usar largura por
módulo, `min-width: 0` nos contêineres críticos e deixou de animar propriedades
de layout. Assim, uma aba mais alta pode ganhar rolagem sem reduzir a largura
útil do conteúdo.

As melhorias têm fundamento técnico para reduzir trabalho de banco, servidor,
rede e navegador, mas esta auditoria não atribui percentuais de ganho: ainda não
há uma linha de base coletada em ambiente representativo. As migrations foram
aplicadas, o build de produção foi concluído e o schema remoto passou no lint. O
gate restante é o QA visual e funcional em navegador real.

## Método e limite desta revisão

A revisão foi feita sobre o plano original, o diff atual e os novos arquivos de
código e banco. Foram executados lint, verificação de tipos, testes automatizados,
build de produção, verificação do diff, aplicação das migrations e lint do schema
remoto.

O navegador integrado ficou indisponível nesta sessão: a lista de navegadores
retornou vazia. Portanto, não houve inspeção visual ao vivo, captura de tela,
medição de Web Vitals ou validação responsiva por interação. As conclusões
visuais abaixo descrevem o comportamento implementado no código, e não uma
observação direta do resultado renderizado.

## Situação do plano original

| Item | Situação | Resultado no código |
| --- | --- | --- |
| Salvar e finalizar o prontuário | Implementado | Operação atômica, validação clínica na mesma transação, confirmação, aviso de alterações pendentes e barra fixa com estado de salvamento. |
| Inventário das regras da Agenda | Implementado | Abas de Agendas, Disponibilidades e Bloqueios, com listas, status, resumos e ações de edição/exclusão. |
| Pacientes do dia fora do caminho crítico | Implementado | O layout não consulta mais os atendimentos antes de renderizar; o painel busca dados por API somente quando aberto. |
| Recargas duplicadas | Implementado parcialmente | Refreshes de Realtime foram agrupados e adiados em aba oculta; ainda há refresh de rota, em vez de patches locais por registro. |
| Loadings fiéis por rota | Implementado | Skeletons próprios para Dashboard, Agenda, Configurações, Financeiro, detalhe do Paciente e Prontuário. |
| Largura orientada pelo módulo | Implementado | Agenda e Kanban usam contêiner amplo; Dashboard, Financeiro, Relatórios e detalhes usam largura intermediária; formulários permanecem contidos. |
| Financeiro por tarefas | Implementado | Abas de Visão geral, A receber, Pagamentos, A pagar e Repasses, com paginação no servidor. |
| Toolbar fixa da Agenda | Implementado | Navegação, data, visão e filtros permanecem disponíveis em desktop durante a rolagem. |
| Calendário compartilhado | Implementado nos fluxos principais | Agenda e Relatórios usam os seletores do sistema; o componente também foi ampliado para intervalos de datas. |
| Abas na URL e sob demanda | Implementado | Abas preservam seleção na URL; Configurações consulta e renderiza somente a aba principal ativa. |
| Adaptação mobile | Implementado nos pontos do plano | Pacientes têm representação móvel, detalhe reorganizado e Funil permite rolagem horizontal explícita. |
| Modais, erros e estados vazios | Implementado parcialmente | Cadastro rápido e configurações da Agenda usam modal acessível; há `FormError` compartilhado e ações no `EmptyState`. Erros específicos por campo ainda não são uniformes em todos os formulários. |
| Voltar contextual do Prontuário | Implementado | O retorno preserva a origem Agenda, Paciente ou lista de Pacientes. |
| Redução do payload da Agenda | Implementado | Data e visão estão na URL; consultas usam apenas o intervalo visível e pacientes relacionados, com busca remota para novos agendamentos. |
| Paginação de Pacientes | Implementado | Busca, filtros, ordenação e paginação estão no servidor; último atendimento vem de RPC específica. |
| Agregações do Dashboard | Implementado | Indicadores e séries usam RPC agregada por período, com fallback temporário para compatibilidade de implantação. |
| Agregações do Funil | Implementado parcialmente | Últimos movimentos, métricas e contagens foram agregados no banco e a busca de pacientes é remota; painéis muito grandes ainda não são paginados ou virtualizados. |
| Instrumentação | Implementado | Coleta de Web Vitals e tempo de navegação, endpoint de observabilidade e `Server-Timing` no painel do dia. |

## Implementações realizadas

### 1. Estabilidade de largura, shell e movimento

- `scrollbar-gutter: stable` reserva o espaço da barra vertical antes de ela ser
  necessária. O fallback usa `overflow-y: scroll`.
- Scrollbars de Firefox e navegadores WebKit receberam trilha transparente,
  espessura fina, thumb arredondado e cores derivadas da paleta do produto.
- O contêiner principal usa largura por rota, `width: 100%` e `min-width: 0`,
  reduzindo overflow e mudanças de geometria entre módulos.
- O estado fixado da barra lateral e do painel do dia é lido no servidor por
  cookie, reduzindo divergência de largura durante a hidratação.
- Foi removida a transição de padding do shell, que causava recálculo de layout
  quadro a quadro.
- O conteúdo de abas deixou de receber animação de entrada a cada seleção. As
  transições restantes priorizam cor, opacidade e transform.
- O componente compartilhado de abas mantém largura total, rolagem horizontal,
  teclado, URL e carregamento sob demanda sem prefetch de todas as seções.

Ganho esperado: troca de abas sem deslocamento horizontal causado pela barra de
rolagem e com menos recalculação de layout.

### 2. Fluxos clínicos e Agenda

- A finalização do prontuário foi movida para uma RPC transacional. Conteúdo,
  validações obrigatórias e finalização passam a ocorrer de forma atômica.
- O editor mostra estados Pendente, Salvando e Salvo, mantém ações visíveis e
  alerta antes de sair com alterações não gravadas.
- Configurações da Agenda agora permitem revisar, editar, ativar/desativar e
  excluir agendas, disponibilidades e bloqueios.
- Agenda persiste `date` e `view` na URL e consulta somente dia, semana ou mês
  visível, respeitando o fuso horário configurado.
- Apenas pacientes presentes no intervalo são enviados inicialmente. A seleção
  de outro paciente usa busca remota protegida e debounced.
- A toolbar principal é sticky e o calendário segue o componente visual do
  sistema.
- Eventos Realtime próximos são consolidados; atualizações em abas ocultas são
  postergadas até o retorno do usuário.

Ganho esperado: menor payload inicial da Agenda, navegação reproduzível por URL
e menos recargas em sequência.

### 3. Consultas, payloads e renderização

- Configurações carrega somente a aba principal ativa. Cadastros, Agenda,
  Agendamento online, Tags e Modelos clínicos deixaram de compor simultaneamente
  a mesma resposta.
- Pacientes usa páginas de 25 registros, filtros no banco e RPC para o último
  atendimento de cada paciente exibido.
- Dashboard usa uma RPC agregada para período atual e comparação, mantendo
  fallback durante a implantação da migration.
- Financeiro usa resumo agregado e paginação independente para recebíveis,
  pagamentos, contas a pagar e repasses.
- Funil usa RPCs para último movimento, métricas por etapa e contagem de cards na
  lista de painéis. O modal de novo card não recebe mais a base inteira de
  pacientes.
- Dados de autenticação, permissões e configurações da plataforma são
  memoizados por requisição e carregados em paralelo quando possível.
- O painel “Pacientes do dia” foi removido do bloqueio do layout e passou a ter
  carregamento, erro, retry e atualização próprios.
- Providers e dependências globais sem consumidores foram removidos, assim como
  atrasos artificiais dos gráficos.

Ganho esperado: menos linhas transferidas, menor custo de serialização e menos
trabalho antes da primeira renderização útil.

### 3.1. Diagnóstico do ambiente de desenvolvimento

- O Next.js detectou filesystem lento no caminho atual e mediu cerca de 1.016 ms
  no benchmark interno. Isso afeta sobretudo compilações frias do Turbopack e
  pode ser percebido como travamento ao visitar uma rota ainda não compilada.
- Antes de o cache ser aquecido, uma compilação de `/login` chegou a 32,6 s.
  Depois do build e com o cache preservado, o servidor reiniciado respondeu a
  primeira requisição em aproximadamente 1,28 s e a seguinte em 252 ms.
- Esses números são diagnósticos locais, não uma medição de produção. Além das
  melhorias de código, vale manter o repositório e `.next` em SSD local e evitar
  sincronização ou varredura em tempo real dessas pastas durante o desenvolvimento.

### 4. Consistência de UI e acessibilidade

- `PageHeader` unifica título, descrição, ícone, retorno e ações nos módulos
  principais.
- `Tabs` unifica o padrão segmentado e preserva seleção em Configurações,
  Financeiro, Relatórios, Pacientes e subseções.
- `HelpTooltip` foi aplicado a configurações cujo efeito ou precedência não era
  evidente.
- `FormError` anuncia falhas com `role="alert"`, `aria-live` e recebe foco; inputs
  e selects têm tratamento visual para `aria-invalid`.
- `EmptyState` aceita ações e diferencia ausência de dados de ausência de
  resultados para filtros.
- Cadastro rápido de paciente e modais de configuração usam a base acessível em
  Radix, com foco e fechamento por teclado.
- Tabelas podem oferecer uma representação móvel própria, sem forçar todas as
  colunas em telas pequenas.
- O switch compartilhado passou a usar checkbox nativo com semântica de switch,
  foco visível e thumb com posição determinística. Isso corrige o desalinhamento
  visto em Configurações e no filtro de painéis excluídos.

### 5. Ajustes solicitados após o plano inicial

- A tela de Agendamento online ganhou card de acesso ao endereço público, status,
  ação de copiar e ação de abrir a página.
- A disponibilidade semanal por agenda profissional permite expediente único ou
  dois períodos com pausa opcional para almoço. Configurações com mais de dois
  períodos são preservadas e encaminhadas para a edição avançada.
- “Procedimentos” passou a ser apresentado como “Procedimentos e serviços”.
- Custos opcionais por procedimento/serviço aceitam comissão, taxa de local ou
  outro custo, com valor fixo ou percentual.
- Formas de pagamento foram movidas para Configurações, com cadastro, edição,
  ativação/desativação, exclusão segura e taxas opcionais fixas ou percentuais.
- A migration normaliza os nomes das formas padrão já existentes sem sobrescrever
  nomes personalizados.
- Cards da lista de Painéis agora têm estrutura, área de descrição e rodapé
  uniformes. Elementos sem função — escopo “Para toda a empresa”, engrenagem e
  pin — foram removidos; permanecem contagem real e ação Abrir.
- A contagem dos cards de cada painel passou a ser agregada por RPC, evitando
  carregar todos os registros apenas para contar.

## Validações executadas

| Validação | Resultado |
| --- | --- |
| `git diff --check` | Aprovado, sem erro de whitespace. Foram emitidos apenas avisos de normalização LF/CRLF no Windows. |
| `npm run typecheck` | Aprovado. |
| `npm run lint` | Aprovado. |
| `npm run test` | Aprovado: 9 arquivos e 54 testes. |
| `npm run format:check` | Aprovado. |
| `npm run build` | Aprovado: compilação em 28,8 s, TypeScript em 13,0 s e 30 rotas geradas. |
| QA no navegador integrado | Não executado: a lista de navegadores disponíveis retornou vazia nesta sessão. |
| Migrations em banco de destino | Aplicadas e sincronizadas no Supabase remoto. |
| `supabase db lint --linked` | Aprovado: nenhum erro ou warning no schema remoto. |
| Servidor local | Ativo em `http://localhost:3000`; `/login` respondeu HTTP 200. |

## Pendências reais, priorizadas

### P0 — antes de liberar

1. Fazer QA visual e funcional em navegador real, cobrindo desktop, tablet,
   celular, zoom, teclado e `prefers-reduced-motion`.
2. Confirmar especificamente que alternar entre abas curtas e longas não muda a
   largura do conteúdo e que a scrollbar mantém contraste e área de interação
   adequados nos navegadores suportados.
3. Executar testes funcionais dos fluxos de maior risco: salvar/finalizar
   prontuário, editar regras da Agenda, publicar agendamento online, salvar pausa
   de almoço e cadastrar/editar/excluir custos e formas de pagamento.

### P1 — próxima rodada de desempenho

1. Mover o repositório/cache de desenvolvimento para filesystem local rápido ou
   excluir `.next` da sincronização e da varredura em tempo real; repetir o
   benchmark frio do Turbopack para confirmar o ganho.
2. Substituir o `router.refresh()` ainda usado pelo Realtime por patches locais
   de agendamento/card quando o payload do evento for suficiente.
3. Paginar ou virtualizar Funis com grande quantidade de cards. As métricas já
   estão agregadas, mas os cards do quadro ainda são carregados integralmente.
4. Dividir o componente cliente da Agenda e carregar editores menos frequentes
   apenas quando forem abertos.
5. Coletar Web Vitals e tempo de navegação em homologação/produção para criar a
   linha de base. A instrumentação existe, mas ainda não há série comparativa.
6. Completar o padrão de erro por campo com mapa de validação,
   `aria-describedby` e foco direto no primeiro campo inválido em todos os
   formulários; hoje o resumo compartilhado recebe foco, mas a cobertura por
   campo não é total.

### P2 — refinamento de produto

1. Avaliar drawers/modais para novos lançamentos no Financeiro caso os formulários
   dentro das abas ainda deixem a tela longa em dispositivos menores.
2. Ampliar testes automatizados de navegação por URL, histórico do navegador,
   busca remota e layouts responsivos.
3. Remover os fallbacks de consulta bruta somente depois que todas as migrations
   agregadas estiverem implantadas e monitoradas.

## Migrations adicionadas nesta implementação

- `20260713190000_dashboard_commercial_period_index.sql`
- `20260713210000_atomic_clinical_encounter_finalize.sql`
- `20260713211000_latest_patient_encounters_rpc.sql`
- `20260713220000_dashboard_company_aggregates_rpc.sql`
- `20260713221000_funnel_board_aggregates_rpc.sql`
- `20260713223000_operational_finance_summary_rpc.sql`
- `20260713224000_configurable_catalog_costs.sql`
- `20260713225000_funnel_panel_card_counts_rpc.sql`
- `20260713230000_fix_dashboard_period_points_ambiguity.sql`
- `20260713231000_fix_audit_metadata_summary_volatility.sql`

## Conclusão

O código agora ataca as causas principais da sensação de travamento em vez de
apenas adicionar animações: menos dados são carregados, as abas deixam de montar
conteúdo oculto, refreshes são consolidados e o shell reserva a scrollbar sem
alterar a largura. A base também ficou mais consistente em navegação,
configurações, estados de carregamento, acessibilidade e organização visual.

A implementação está validada estaticamente, por testes unitários, build de
produção e lint do banco remoto. A validação visual e funcional em navegador real
e as medições em ambiente representativo permanecem como gates de liberação.
