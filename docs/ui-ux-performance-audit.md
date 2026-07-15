# Auditoria de UI, UX e desempenho

Data: 13/07/2026

## Resumo executivo

O sistema já possui uma boa base visual: tokens consistentes, feedback por
toast, suporte a movimento reduzido e componentes reutilizáveis. A sensação de
lentidão, porém, não é causada principalmente pela falta de animações. Os
maiores fatores são consultas repetidas no servidor, grandes volumes enviados
ao navegador, telas que carregam conteúdo de abas fechadas e atualizações que
recarregam a rota inteira.

O trabalho imediato padronizou as abas no estilo segmentado definido para o
produto, melhorou a ajuda contextual nas configurações e removeu alguns custos
globais e atrasos artificiais. As mudanças estruturais abaixo devem entrar no
backlog por prioridade.

## Melhorias já aplicadas

- Componente único de abas com contêiner segmentado, item ativo branco,
  sublinhado da cor primária, ícones, rolagem horizontal e navegação por teclado.
- Aplicação do padrão em Configurações, Cadastros da clínica, Relatórios e edição
  de Pacientes.
- Tooltips acessíveis em configurações de clínica, agenda, preços e agendamento
  online, priorizando campos cujo efeito não é evidente.
- Fechamento dos modais manuais de Agenda por `Escape`, descrição semântica de
  diálogo e nome acessível no botão de fechar.
- Memoização por requisição do usuário autenticado, contexto de permissões e
  configurações da plataforma, evitando consultas iguais durante a mesma
  renderização no servidor.
- Remoção de um `QueryClientProvider` sem consumidores e de um segundo `Toaster`
  global.
- Remoção da animação duplicada dos indicadores e do escalonamento de até 350 ms
  nos gráficos do Dashboard. Dados prontos agora aparecem sem espera artificial.

## Prioridade P0 — risco ou impacto imediato

### 1. Salvar e finalizar o prontuário em uma única operação

Hoje, salvar o rascunho e finalizar são formulários separados em
`prontuario/[id]/encounter-editor.tsx`. Se o profissional editar e clicar
diretamente em **Finalizar**, as últimas alterações podem não acompanhar a ação.

Recomendação:

- criar a ação atômica **Salvar e finalizar**;
- avisar quando houver alterações não salvas;
- exibir confirmação com resumo antes da assinatura/finalização;
- manter uma barra de ações fixa com estado `Salvando`, `Salvo` ou `Pendente`.

### 2. Tornar as configurações da Agenda verificáveis

`configuracoes/agenda-settings.tsx` mostra contadores e permite adicionar
disponibilidades e bloqueios, mas não apresenta um inventário para revisar,
editar ou excluir as regras existentes.

Recomendação: separar **Agendas**, **Disponibilidades** e **Bloqueios** no novo
padrão de abas, com lista, resumo da recorrência, vigência, responsável, status e
ações de editar/excluir.

### 3. Retirar “Pacientes do dia” do caminho crítico

O layout aguarda `getTodayAppointmentsForRail()` antes de exibir qualquer rota.
Essa carga inclui uma consulta principal e várias consultas auxiliares, por isso
uma página simples também pode parecer travada.

Recomendação: renderizar o shell imediatamente e carregar o painel atrás de
`Suspense` ou somente ao abri-lo. A primeira carga pode buscar apenas a contagem.

### 4. Evitar recargas completas após mutações e Realtime

Agenda, Funil e configuração de etapas combinam `router.refresh()`, eventos
Realtime e actions que já fazem `revalidatePath`. Uma única alteração pode
recarregar a rota mais de uma vez.

Recomendação: escolher uma fonte de atualização por fluxo. Após uma action já
revalidada, não executar outro refresh; no Realtime, atualizar apenas o registro
afetado ou agrupar eventos próximos com debounce.

### 5. Criar loading fiel para as rotas críticas

O loading global representa uma tela genérica de métricas e tabela. Quando a
tela real é Agenda, Configurações, Financeiro ou Prontuário, ocorre uma troca
brusca de layout que reforça a sensação de lentidão.

Recomendação: criar `loading.tsx` específico para Dashboard, Agenda,
Configurações, Financeiro e detalhes do Paciente, preservando a posição da
toolbar e dos principais blocos.

## Prioridade P1 — organização e uso da tela

### Largura orientada pelo módulo

O shell aplica `max-w-7xl` a todas as rotas e ainda pode reservar 21rem para o
painel lateral. Agenda, Dashboard, Kanban e tabelas deveriam usar um contêiner
amplo ou fluido; formulários e leitura clínica devem continuar em largura curta.

### Financeiro por tarefas

`financeiro/finance-panel.tsx` é uma página linear longa. Organizar em
**Visão geral**, **A receber**, **Pagamentos**, **A pagar** e **Repasses**. Manter
os indicadores compactos acima e abrir novos lançamentos em modal ou drawer.

### Toolbar fixa na Agenda

Data, visão, busca e filtros desaparecem durante a rolagem. Aplicar o padrão
sticky já usado no Kanban, mantendo também os filtros ativos visíveis em chips.

### Um único calendário no produto

Dashboard usa o seletor do sistema, enquanto Agenda e Relatórios ainda usam
inputs nativos. Reutilizar o calendário com períodos predefinidos, resumo do
intervalo e ação **Limpar**.

### Abas ligadas à URL e carregamento sob demanda

O estado atual das abas é local: refresh, Voltar e links diretos não preservam a
seleção. Em Configurações, todo o conteúdo de todas as abas é consultado e
enviado mesmo estando oculto.

Recomendação: sincronizar a aba principal com `?tab=` ou subrotas e buscar apenas
seus dados. Manter subabas locais somente quando o conteúdo já estiver carregado
e for leve.

### Melhor adaptação para celular

- No detalhe do Paciente, transformar a ficha lateral em resumo recolhível ou
  abas para que o histórico apareça primeiro.
- No modo lista do Funil, usar rolagem horizontal explícita ou cards responsivos;
  o `overflow-hidden` atual pode recortar colunas.
- Nas tabelas, priorizar nome, status e ação; mover dados secundários para uma
  expansão por linha.

### Modais, erros e estados vazios

- Migrar overlays manuais de Agenda e cadastro rápido para o modal baseado em
  Radix já existente, com foco preso, retorno de foco e `Escape`.
- Criar `FormField`/`FormError` comum com erro por campo, `aria-invalid`,
  `aria-describedby`, anúncio acessível e foco no primeiro campo inválido.
- Permitir ações primária e secundária no `EmptyState`, diferenciando “sem
  dados” de “nenhum resultado para os filtros”.
- O botão **Voltar** no Prontuário deve retornar ao Paciente ou à Agenda de
  origem, em vez de passar por uma rota que redireciona à lista geral.

## Prioridade P1 — desempenho estrutural

### Agenda

A rota executa muitas consultas, envia todos os pacientes e cerca de quatro
meses de agendamentos ao cliente, e concentra a experiência em um componente
grande.

Recomendação:

- colocar data e visão na URL;
- consultar somente o dia, semana ou mês visível, com pequeno buffer;
- buscar pacientes remotamente conforme a digitação;
- carregar formulários e modais somente quando abertos;
- aplicar patches locais nos eventos Realtime.

### Configurações

Carregar somente a aba ativa. A área de Cadastros sozinha agrega muitas fontes,
e formulários pesados não devem compor o payload de quem abriu outra seção.

### Pacientes

Mover paginação, busca, filtros e ordenação para o servidor. O navegador não deve
receber a base inteira apenas para mostrar uma página da tabela. Calcular o
último atendimento em uma view ou RPC SQL.

### Dashboard

Substituir a leitura de pacientes e agendamentos brutos por RPCs agregadas por
período para indicadores, taxas e séries. Manter registros individuais apenas
nas listas operacionais. O índice da visão comercial ajuda a consulta, mas não
substitui a agregação.

### Funil

Buscar pacientes somente quando o modal de novo card abrir, agregar o último
movimento no banco e paginar ou virtualizar painéis grandes. Remover atualização
de estado durante a renderização.

## Padrões de produto recomendados

### Abas

- Usar sempre o componente compartilhado.
- Ícone simples, rótulo curto e item ativo claramente contrastado.
- Evitar mais de seis itens no primeiro nível; agrupar ou usar navegação
  secundária quando necessário.
- Preservar a seleção na URL para seções de página e relatórios.
- Em telas pequenas, manter rolagem horizontal sem quebrar os rótulos.

### Ajuda contextual

- Consequências essenciais devem ficar visíveis como helper text.
- Tooltip deve explicar termos, precedência ou impacto secundário.
- O texto deve responder “o que muda se eu alterar isto?” em uma ou duas frases.
- Não usar tooltip para esconder validação, erro ou instrução obrigatória.

### Movimento

- Mostrar conteúdo pronto imediatamente.
- Usar uma única transição curta na mudança de contexto.
- Animar preferencialmente `opacity` e `transform`, evitando largura, padding ou
  outras propriedades que recalculam o layout inteiro.
- Não reanimar todos os gráficos a cada alteração de filtro.
- Manter o suporte já existente a `prefers-reduced-motion`.

## Sequência sugerida

1. Corrigir **Salvar e finalizar** e dar visibilidade às regras da Agenda.
2. Carregar o painel lateral sob demanda e eliminar refreshes duplicados.
3. Tornar as abas de Configurações orientadas por URL e sob demanda.
4. Reduzir o volume da Agenda e implementar busca remota de pacientes.
5. Levar paginação de Pacientes e agregações do Dashboard para o servidor.
6. Reorganizar Financeiro e otimizar a experiência mobile.
7. Instrumentar tempos de navegação, consultas e Web Vitals para comparar antes
   e depois de cada etapa.

## Limite desta auditoria

A inspeção foi feita no código. O navegador interno não inicializou nesta
sessão, portanto a validação visual ao vivo deve ser repetida em ambiente local
após o build, cobrindo desktop, tablet, celular, teclado e movimento reduzido.
