# Auditoria de tipografia — 26/09/2026

O padrão do sistema é Inter 14/20px para conteúdo operacional, controles,
tabelas, filtros, navegação e descrições. A hierarquia vem do peso, da cor e
do espaçamento. Montserrat continua nos títulos h1/h2.

## Diagnóstico

Foi feito um inventário de 169 arquivos TSX: 167 de interface e dois templates
PDF. A análise percorreu declarações de tamanho, componentes de formulário,
títulos, tabelas, layouts, estilos globais e tamanhos inline dos gráficos.

No início da revisão, o projeto usava:

- corpo global, campos e gatilhos dos seletores em 16px;
- botões, pesquisa global e opções dos seletores em 14px;
- cabeçalhos de tabela e rótulos compartilhados em 12px;
- nome do paciente em 15px, tags em 10px e gráficos com eixos em 10/11px;
- 588 ocorrências de `text-sm`, 217 de `text-xs` e 23 de `text-base`,
  além dos tokens semânticos e tamanhos arbitrários.

Os exemplos relatados têm causas verificáveis no código: cabeçalho de tabela
em 12px contra corpo global de 16px, seletor fechado em 16px contra opções
em 14px, além de campos herdando o peso 500 do rótulo. A busca do prontuário
também forçava 16px e altura de 48px.

Outro desvio estava na cascata: os estilos globais de h1/h2 estavam fora das
camadas do Tailwind e venciam as classes aplicadas ao componente. Esses estilos
agora estão na camada base, permitindo uma hierarquia previsível.

Foi reproduzido um defeito no combinador de classes `cn`: o `tailwind-merge`
não conhecia os tamanhos semânticos e tratava `text-body-sm`, `text-caption`
e outros como cores. Por exemplo, combinar `text-body-sm` com
`text-primary-foreground` removia o tamanho, fazendo o botão herdar a fonte
do contexto. Todos os tokens de tamanho foram registrados no combinador,
com teste de regressão para tamanho + cor, sobrescritas e breakpoints.

## Referências e decisão

O [Carbon usa 14px como base para interfaces produtivas](https://carbondesignsystem.com/elements/typography/type-sets/),
com estilos auxiliares e títulos organizados por função. O
[Fluent 2 usa corpo web 14/20px, legenda 12/16px e subtítulo 16/22px](https://fluent2.microsoft.design/typography).
Essas referências apoiam uma base de 14px para as telas operacionais desta
clínica; não exigem trocar a identidade Inter/Montserrat.

O padrão adotado é uma decisão de design para este produto. Não existe um
tamanho único obrigatório para todos os sistemas.

| Função                            | Tamanho / entrelinha | Peso       | Aplicação                                     |
| --------------------------------- | -------------------- | ---------- | --------------------------------------------- |
| Conteúdo principal                | 14/20                | 400        | listas, tabelas, descrições, diálogos         |
| Campos e placeholders             | 14/20                | 400        | pesquisa, texto, máscaras, seletores e opções |
| Botões e navegação                | 14/20                | 500        | ações, menus e abas                           |
| Rótulos de campo                  | 14/20                | 500        | formulários                                   |
| Cabeçalhos de tabela              | 14/20                | 600        | mesma escala dos dados da linha               |
| Identificação principal na tabela | 14/20                | 500        | nome do paciente                              |
| Informação auxiliar               | 12/16                | 400 ou 500 | idade, profissional, badges, eixos, legenda   |
| Títulos de seção                  | 16/24                | 600        | cards e seções                                |
| Títulos de modal/página           | 18/24                | 600        | título principal quando exibido               |
| Indicadores destacados            | 24/32                | 600        | totais e indicadores                          |
| Leitura longa e editor            | 16/24                | 400        | textos clínicos e editor rico                 |

Os valores são expressos em rem, sem reduzir o tamanho raiz do navegador.
Campos editáveis usam 16px em telas de até 767px, inclusive a pesquisa global
e os campos com máscara. Essa é uma exceção deliberada para digitação em
celular. A escala de papel da prévia de documentos e dos PDFs continua
independente da interface de edição.

## Cobertura por área

A revisão abaixo é de código e dos componentes que cada área utiliza.

| Área                                             | Cobertura e ajuste                                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Cabeçalho e menu lateral                         | pesquisa, ações, conta e navegação em 14px; informação auxiliar em 12px                                                    |
| Pacientes                                        | filtros, pesquisa, dados e cabeçalhos em 14px; tags e idade em 12px; busca com largura mínima e quebra da barra de filtros |
| Cadastro e detalhe do paciente                   | campos compartilhados em 14px; títulos por papel; tags em 12px                                                             |
| Agenda                                           | filtros e ações em 14px; dias da semana, horários auxiliares e legendas em 12px; título em 16px                            |
| Atendimento e contato                            | mensagens e controles em 14px; horários, telefone auxiliar e badges em 12px                                                |
| Prontuário                                       | busca e filtros em 14px/40px de altura; editor de leitura longa em 16px; dados em 14px                                     |
| Financeiro                                       | entradas, seletores e tabelas em 14px; títulos em 16px; totais em 24px; eixos em 12px                                      |
| Relatórios                                       | tabelas em 14px; cabeçalhos na mesma escala; eixos em 12px e tooltips em 14px                                              |
| Tela inicial                                     | cards e filtros pela escala comum; indicadores de 18/24px conforme espaço; gráficos pelos tokens                           |
| Configurações / cadastros                        | rótulos e campos em 14px; controles de horário e links de acesso sem redução para 12px                                     |
| Configurações / agendas e portal                 | filtros, horários e formulários na escala comum                                                                            |
| Configurações / usuários e acessos               | tabelas e menus em 14px; formulários e modais compartilhados                                                               |
| Configurações / tags e automações                | formulários, listas e badges pela escala comum                                                                             |
| Configurações / modelos clínicos                 | controles em 14px; prévia do documento preserva a escala de papel                                                          |
| Configurações / WhatsApp e plataforma            | campos em 14px; código destacado em 24px; títulos em 16px                                                                  |
| Empresas, usuários e auditoria                   | cabeçalhos e linhas em 14px; informação auxiliar em 12px                                                                   |
| Perfil                                           | títulos em 16px e controles em 14px                                                                                        |
| Autenticação e recuperação                       | campos e botões compartilhados; títulos em 18px                                                                            |
| Agendamento público e acompanhamento             | controles pela escala comum; horários acionáveis em 14px; dados auxiliares em 12px; entradas em celular em 16px            |
| Erros e estados vazios                           | texto em 14px; títulos por nível; fallback global mantém legibilidade mesmo sem CSS                                        |
| Modais, campos, menus e componentes reutilizados | tokens compartilhados evitam tamanhos diferentes para a mesma função                                                       |

## Manutenção e verificação

- A fonte da verdade está em `docs/design-system.md` e nos tokens de
  `apps/web/src/app/globals.css`.
- Novos tokens de fonte precisam ser registrados no tema `text` do
  `tailwind-merge` em `src/lib/utils.ts`, para não serem confundidos com cores.
- `text-sm` continua equivalente a 14px e `text-xs` a 12px em código
  existente. Novos componentes usam os nomes semânticos.
- Não usar tamanho arbitrário em pixels na interface operacional.
  A prévia reduzida de documento impresso é a exceção identificada.
- Não diminuir o texto do placeholder em relação ao valor do campo.
- Não ampliar a fonte de um botão apenas porque ele tem maior altura.
- Não usar 24px para nomes em listas ou rótulos de formulário.
- Código percorrido integralmente pelo inventário e usos de controles/títulos
  analisados também pela árvore sintática TypeScript.

A verificação visual em navegador não foi executada: a sessão não expôs
navegadores conectados, e abrir o navegador integrado retornou indisponível.
Compilação, tipos, lint e formatação são verificações de código, não substituem
a inspeção visual das rotas com dados reais em desktop, celular e zoom.

Verificações executadas após as alterações:

- Build de produção e validação TypeScript concluídos.
- 124 testes passaram, incluindo sete casos de regressão do combinador de classes.
- Lint sem erros; quatro avisos já existentes sobre variáveis não usadas em
  `configuracoes/agenda-settings.tsx`.
- Arquivos alterados formatados; diferenças sem erros de whitespace.
- O inventário final de tamanhos arbitrários na UI só encontrou a prévia de
  documento impresso, explicitamente documentada como exceção.
