# Design System — hi-clinic

Fonte da verdade do padrão visual. Toda feature nova segue este documento; se
algo não estiver definido aqui, defina aqui **antes** de inventar no componente.

Tokens vivem em `apps/web/src/app/globals.css` (`:root` + `@theme inline`).
Componentes base vivem em `apps/web/src/components/ui/`.

## Regras de ouro (verificáveis por grep)

1. **Zero hex fora de `globals.css`** — nada de `#slate`, `bg-[#...]`, `text-[#...]` em `.tsx`.
   Paletas categóricas (cores de tag e gráfico) vivem em `src/lib/colors.ts`.
   Ícones: só `@phosphor-icons/react` (nunca reintroduzir lucide ou outra lib).
2. **Zero `text-[Npx]` na interface operacional** — todo tamanho de fonte sai da
   escala tipográfica abaixo. Prévia reduzida de documentos impressos é a
   exceção documentada.
3. **Zero `<button>` cru em `app/`** — 100% via `<Button>`. Primitives internas de
   `components/ui/` podem usar `<button>` nativo.
4. **Zero duração `ms` hardcoded** — só `--motion-fast`/`--motion-normal`/`--motion-drawer`,
   ou as animações nomeadas (`animate-content-enter`, `animate-panel-enter`,
   `animate-fade-in`, `animate-dialog-in`).
5. **Ícones só na escala fechada** (14/16/20) — ver seção Ícones.
6. **Emoji nunca é ícone de UI.**

## Tipografia

Duas famílias, carregadas em `app/layout.tsx` via `next/font/google`:

- **Inter** (400/500/600/700, variável `--font-body`) — corpo, parágrafos,
  controles, tabelas e números. É a fonte padrão, com fallback para
  `system-ui`, Segoe UI, Roboto e Arial.
- **Montserrat** (500/600/700, variável `--font-display`) — títulos semânticos
  `h1` e `h2`, com fallback para Inter. O utilitário `font-heading` também
  está disponível para títulos fora dessas tags.

Escala fechada (utilitários Tailwind gerados pelos tokens `--text-*`):

Os nomes dos tokens também são registrados em `src/lib/utils.ts`, no tema
`text` do `tailwind-merge`. Ao adicionar um tamanho, atualizar os dois locais;
caso contrário, `cn` pode confundir o tamanho com uma cor e removê-lo.

| Utilitário        | Tamanho/linha | Uso                                                |
| ----------------- | ------------- | -------------------------------------------------- |
| `text-caption`    | 12/16         | metadados e selos                                  |
| `text-label`      | 14/20         | rótulos de campo, peso 500                         |
| `text-control`    | 14/20         | botões, campos, placeholders, seletores e busca    |
| `text-table`      | 14/20         | cabeçalhos e conteúdo principal das tabelas        |
| `text-body-sm`    | 14/20         | alias de compatibilidade para conteúdo             |
| `text-body`       | 14/20         | **default do app**, descrições, menus e listas     |
| `text-reading`    | 16/24         | leitura longa, editor clínico e entrada em celular |
| `text-heading-sm` | 16/24         | títulos `h2`, cards e seções                       |
| `text-heading`    | 18/24         | títulos `h1`                                       |
| `text-heading-lg` | 18/24         | alias para títulos maiores existentes              |
| `text-display`    | 24/32         | números e elementos de destaque                    |

Aliases Tailwind aceitos em código legado: `text-xs` (=caption), `text-sm`
(=body). Código novo usa os nomes semânticos. `text-base` não é o corpo do
app: usar `text-heading-sm` em títulos ou `text-reading` para leitura longa.

Referências de escala: [Carbon, tipografia produtiva](https://carbondesignsystem.com/elements/typography/type-sets/)
e [Fluent 2, escala web](https://fluent2.microsoft.design/typography).
Ambos usam 14px como corpo de interfaces operacionais, 12px para informação
auxiliar e 16px como próximo nível de hierarquia. A escala acima adapta esses
papéis às fontes Inter/Montserrat e à densidade deste produto.

Regras por função:

- Cabeçalho e valor principal da tabela usam **o mesmo tamanho, 14px**.
  O cabeçalho se diferencia por peso 600 e fundo; metadados usam 12px.
- Botões, pesquisa global, filtros, seletores e suas opções usam **14px**.
  Aumentar a altura do controle não aumenta automaticamente a fonte.
- Campos e placeholders usam peso 400; botões e rótulos usam 500; títulos
  e cabeçalhos de tabela usam 600. O campo não herda o peso do rótulo.
- Descrições de seção e mensagens de erro usam 14px. Horários auxiliares,
  badges, ajuda curta e identificação secundária usam 12px; nenhuma
  informação operacional usa 9–11px.
- Títulos de seção usam 16px, de modal/página 18px, indicadores de destaque
  24px. O peso cria a hierarquia dentro da mesma escala.
- A unidade é `rem`, com a raiz do navegador preservada. Em telas de até
  767px, campos editáveis usam 16px para a digitação; esse tratamento também
  alcança campos com máscara e a pesquisa global.
- Prévia de documento impresso e PDF usam escala própria de papel. Glifos
  de emoji também não são texto operacional. Essas exceções não definem
  tamanhos de botões, rótulos ou tabelas.

Valores numéricos alinhados (dinheiro, contagens, horários em tabela): adicionar
`tabular-nums` (já aplicado por padrão em `Table`/`DataTable`).

## Cor

- `--primary` **é configurável por white-label** (`platform_settings.primary_color`,
  injetado no `<body>` pelo layout). Default: azul `#0054C2`.
- Por isso, `--primary-hover`, `--primary-muted`, `--primary-muted-hover`,
  `--ring` e os estados ativos da sidebar são **derivados via `color-mix()`**
  dentro de `globals.css`. Não criar derivado estático de primary em lugar nenhum.
- Cor saturada só comunica **ação ou estado** (CTA, seleção, status). Nunca decorativa,
  nunca gradiente decorativo.
- Semânticas: `success` (`#41D771`), `warning` (`#FBC163`), `destructive` (`#F75959`) —
  cada uma com par `*-muted` (fundo) e `*-foreground` (texto sobre o muted, contraste AA),
  ambos **derivados via `color-mix()`** a partir da cor base (mesmo mecanismo do primary).
- Neutros seguem a escala fria: canvas `#F4F6FA` (cards brancos criam o plano),
  texto padrão `#101828`, texto secundário `#667085` (AA sobre branco), muted
  `#EEF1F6`, borda `#E4E9F0`, borda forte `#CBD5E4`.
- Sidebar: fundo claro e itens ativos derivados do `primary`. Os ícones de
  navegação usam a paleta `--nav-*` em `globals.css` para identificar as áreas.
- Bordas: `border` (padrão) e `border-strong` (hover/ênfase). Nunca hex direto.
- Não existe "secundária" saturada (verde ou outra) como cor de marca neste produto —
  `--secondary`/`--secondary-foreground` são neutros (texto/botão de baixa ênfase), não
  um segundo CTA. Se surgir a necessidade de um segundo acento saturado (ex.: um CTA
  paralelo ao primary), definir aqui primeiro, com o estado/ação que ele representa,
  antes de introduzir no componente.

## Radius

| Token          | Valor | Onde                                                      |
| -------------- | ----- | --------------------------------------------------------- |
| `rounded-md`   | 10px  | controles: botões, inputs, selects, badges, itens de menu |
| `rounded-lg`   | 16px  | superfícies: cards, painéis, modais, popovers             |
| `rounded-full` | —     | avatares, dots de status, switch                          |

Sem exceção. `rounded-xl`+ não faz parte do sistema.

## Elevação (sombras)

Sombra é funcional (comunica plano), nunca decorativa e **nunca colorida**.
A família atual é difusa/"flutuante" (offsets negativos de spread) — ao criar
elevação nova, derive destes tokens; nunca declare box-shadow avulso.

Foco de teclado: `globals.css` define um anel global `:focus-visible`
(2px `--ring` + offset) com especificidade zero via `:where()` — componentes
com foco próprio continuam valendo; nenhum elemento interativo fica sem anel.

| Token            | Uso                                   |
| ---------------- | ------------------------------------- |
| `--shadow-soft`  | repouso: cards, botões, tabelas       |
| `--shadow-hover` | hover de superfícies clicáveis        |
| `--shadow-md`    | popovers, dropdowns, menus            |
| `--shadow-lg`    | modais, drawers, card sendo arrastado |

## Ícones

Só `@phosphor-icons/react`. Regra de peso: `regular` (default) em controles e
texto; `duotone` em navegação, cabeçalhos de página e empty states; `fill` no
item de navegação ativo. Server components importam de
`@phosphor-icons/react/dist/ssr` (o entry padrão usa contexto client); o tipo
`Icon` é exportado apenas pelo entry principal (import type é seguro em ambos).

Escala fechada — via wrapper `<Icon>` (`components/ui/icon.tsx`) ou classes:

| Tamanho | Classe     | Contexto                                |
| ------- | ---------- | --------------------------------------- |
| 14px    | `size-3.5` | metadados, badges, células densas       |
| 16px    | `size-4`   | botões, inputs, itens de menu (default) |
| 20px    | `size-5`   | cabeçalho de painel, empty states       |
| 24px    | `size-6`   | ícone destacado                         |

Avatares e containers ilustrativos (ex.: círculo de empty state) não são ícones
e podem usar outros tamanhos. Exceção documentada: glifos internos de controle
(o check de 12px dentro do `Checkbox`/`Select` de 16px) fazem parte da geometria
do controle, não da escala de ícones.

## Motion

Tokens: `--motion-fast` 150ms · `--motion-normal` 240ms · `--motion-drawer` 280ms ·
`--ease-out` · `--ease-standard`.

Regra de uso:

1. **CSS transition** (`duration-[var(--motion-fast)]`) — hover, focus, cor, borda.
2. **Animações nomeadas** — entrada de conteúdo: `animate-content-enter` (popovers,
   menus), `animate-panel-enter` (seções de página), `animate-fade-in` (overlay),
   `animate-dialog-in` (modal).
3. **`@formkit/auto-animate`** — só reordenação/inserção em listas.

Sem stagger de cards (delays escalonados) — conteúdo de página entra de uma vez.
Única animação em loop permitida: shimmer do `Loader`.

## Componentes

### PageHeader (`components/ui/page-header.tsx`)

Nas páginas internas, mantém apenas breadcrumbs, voltar e ações. O título fica
disponível para leitores de tela; não há bloco visual de título, descrição e ícone.

### Button (`components/ui/button.tsx`)

| Variante            | Quando                                                |
| ------------------- | ----------------------------------------------------- |
| `primary`           | a ação principal da tela/painel (máx. 1 por contexto) |
| `secondary`         | ações normais (borda + fundo claro)                   |
| `ghost`             | ações de baixa ênfase, barras de ferramentas, ícones  |
| `destructive`       | confirmação de exclusão/ação irreversível             |
| `destructive-ghost` | gatilho de exclusão em listas/menus                   |
| `link`              | navegação inline com cara de link                     |

Fonte: `text-control font-medium` (14px, peso 500) em todos os tamanhos.
Tamanhos: `sm` (h-8) · `md` (h-9, default) · `lg` (h-10, página pública/CTAs) ·
`icon` (36px) · `icon-sm` (32px, ações de linha de tabela).

### Badge (`components/ui/badge.tsx`)

Variantes: `neutral` · `primary` · `success` · `warning` · `destructive`.
Nunca recriar pill com `<span className="rounded-full ...">` — se faltar variante,
adicione no componente.

### Table / DataTable

- Tabelas de dados usam `app-table`: cabeçalho em superfície muted com títulos
  centralizados, divisórias horizontais e verticais de `--border`, sem zebra.
- Cabeçalho e conteúdo principal usam `text-table` (14/20); peso 600 no
  cabeçalho, 400 nos dados e 500 na identificação principal. Só o conteúdo
  auxiliar dentro de uma célula usa `text-caption` (12/16).
- O conteúdo mantém o alinhamento necessário; no `DataTable`,
  `meta: { align: "right" }` alinha números e dinheiro à direita.
- Largura de coluna: só quando a ColumnDef define `size` explícito.
- Listas responsivas que representam colunas usam `app-list-table-lg`,
  `app-list-row` e `app-list-cell` a partir de `lg`. Em telas menores,
  continuam como cartões legíveis.
- Ações de linha ficam em coluna própria, com gatilhos compactos, rótulos
  acessíveis e cores semânticas para abrir, editar e excluir.
- O controle de ativação nas listas usa `StatusToggle`; estados ativos são
  verdes e a confirmação de desativação continua no fluxo de cada cadastro.

### Sidebar (subsistema deliberado)

Shell clara (`--sidebar-*`) sobre canvas claro. Estados ativos derivam do primary
via `color-mix` para acompanhar o white-label. Os ícones usam cores fixas da
paleta `--nav-*` para diferenciar as áreas e os subitens. Nenhum outro componente
usa esses tokens.

### Avatar (`components/ui/avatar.tsx`)

Foto com fallback para iniciais (`initialsFromName`), nunca recriado à mão.
Escala fechada — avatares não seguem a escala de ícones:

| Tamanho | Caixa | Contexto                                    |
| ------- | ----- | ------------------------------------------- |
| `sm`    | 36px  | listas densas, células de tabela, header    |
| `md`    | 40px  | item de conversa, cabeçalho de painel       |
| `lg`    | 64px  | identificação principal de contato/paciente |

Tons: `muted` (default, sobre card) · `solid` (só o usuário autenticado no header).
As iniciais são `aria-hidden` — o nome sempre aparece ao lado. `onPhotoError`
avisa o pai quando a foto quebra (ex.: esconder o "ampliar foto").

### Timeline (`components/ui/timeline.tsx`)

Histórico de eventos em nós ligados por um fio: histórico de atendimento
(`atendimento`) e log de acessos (`configuracoes/usuarios-acessos`). O nó recebe
ícone Phosphor quando o tipo do evento tem significado próprio; sem ícone, ponto
neutro. `detail` é o bloco destacado (ex.: motivo de uma transferência).
Ordem cronológica é responsabilidade de quem monta `items`.

### PDFs (`lib/pdf/`)

Todo documento usa `lib/pdf/pdf-theme.ts` (paleta espelhada dos tokens + escala de
tipo + espaçamentos). Nunca hex direto em `StyleSheet.create`.

## Página pública (`/agendar`)

Público: paciente final, sem login. Direção: **base neutra e calma + CTA sólido**
(primary só em ação/seleção). Tipografia um passo maior que o app interno
(`text-reading` para leitura longa, `lg` para CTAs). Contraste AA obrigatório em
todo texto e estado. Mesmo rigor de acessibilidade e performance de landing page.
