# Design System — hi-clinic

Fonte da verdade do padrão visual. Toda feature nova segue este documento; se
algo não estiver definido aqui, defina aqui **antes** de inventar no componente.

Tokens vivem em `apps/web/src/app/globals.css` (`:root` + `@theme inline`).
Componentes base vivem em `apps/web/src/components/ui/`.

## Regras de ouro (verificáveis por grep)

1. **Zero hex fora de `globals.css`** — nada de `#slate`, `bg-[#...]`, `text-[#...]` em `.tsx`.
   Paletas categóricas (cores de tag/etapa de funil/gráfico) vivem em `src/lib/colors.ts`.
   Ícones: só `@phosphor-icons/react` (nunca reintroduzir lucide ou outra lib).
2. **Zero `text-[Npx]`** — todo tamanho de fonte sai da escala tipográfica abaixo.
3. **Zero `<button>` cru em `app/`** — 100% via `<Button>`. Primitives internas de
   `components/ui/` podem usar `<button>` nativo.
4. **Zero duração `ms` hardcoded** — só `--motion-fast`/`--motion-normal`/`--motion-drawer`,
   ou as animações nomeadas (`animate-content-enter`, `animate-panel-enter`,
   `animate-fade-in`, `animate-dialog-in`).
5. **Ícones só na escala fechada** (14/16/20) — ver seção Ícones.
6. **Emoji nunca é ícone de UI.**

## Tipografia

Duas famílias, carregadas em `app/layout.tsx` via `next/font/google`:

- **Inter** (400/500/600/700, variável `--font-body`) — corpo, UI, controles,
  tabelas. É o `font-sans` padrão do produto; hierarquia dentro dela se faz
  com tamanho e peso.
- **Quicksand** (600/700, variável `--font-display`) — só nos dois maiores
  degraus da escala tipográfica (`text-heading-lg`, `text-display`: título de
  página, números de dashboard/hero — os "H1/H2"). Aplicada automaticamente
  nesses utilitários via regra em `globals.css`, não precisa de classe extra
  no componente. Disponível também como utilitário solto `font-heading` para
  uso pontual fora da escala. Todo o resto da UI (cards, dialogs, labels)
  continua em Inter.

Escala fechada (utilitários Tailwind gerados pelos tokens `--text-*`):

| Utilitário        | Tamanho/linha | Uso                                         |
| ----------------- | ------------- | ------------------------------------------- |
| `text-caption`    | 11/16         | metadados, selos, labels uppercase          |
| `text-label`      | 12/16         | labels de campo, headers de tabela, células densas |
| `text-body-sm`    | 13/20         | texto secundário, botões                    |
| `text-body`       | 14/20         | **default do app** (corpo, tabelas)         |
| `text-heading-sm` | 16/24         | título de card/seção                        |
| `text-heading`    | 18/28         | título de painel/dialog                     |
| `text-heading-lg` | 24/32         | título de página                            |
| `text-display`    | 30/36         | números de dashboard, hero da página pública |

Aliases Tailwind aceitos em código legado: `text-xs` (=label), `text-sm` (=body),
`text-base` (=heading-sm). Código novo usa os nomes semânticos.

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
- Neutros seguem a escala: fundo/superfícies claras `#F9FAFB`, texto padrão `#212B30`,
  texto secundário/ícone inativo `#90A4AE`, borda `#CFD8DC`, borda forte `#B0BEC5`.
- Bordas: `border` (padrão) e `border-strong` (hover/ênfase). Nunca hex direto.
- Não existe "secundária" saturada (verde ou outra) como cor de marca neste produto —
  `--secondary`/`--secondary-foreground` são neutros (texto/botão de baixa ênfase), não
  um segundo CTA. Se surgir a necessidade de um segundo acento saturado (ex.: um CTA
  paralelo ao primary), definir aqui primeiro, com o estado/ação que ele representa,
  antes de introduzir no componente.

## Radius

| Token        | Valor | Onde                                             |
| ------------ | ----- | ------------------------------------------------ |
| `rounded-md` | 8px   | controles: botões, inputs, selects, badges, itens de menu |
| `rounded-lg` | 12px  | superfícies: cards, painéis, modais, popovers    |
| `rounded-full` | —   | avatares, dots de status, switch                 |

Sem exceção. `rounded-xl`+ não faz parte do sistema.

## Elevação (sombras)

Sombra é funcional (comunica plano), nunca decorativa e **nunca colorida**.

| Token            | Uso                                      |
| ---------------- | ---------------------------------------- |
| `--shadow-soft`  | repouso: cards, botões, tabelas          |
| `--shadow-hover` | hover de superfícies clicáveis           |
| `--shadow-md`    | popovers, dropdowns, menus               |
| `--shadow-lg`    | modais, drawers, card sendo arrastado    |

## Ícones

Só `@phosphor-icons/react`. Regra de peso: `regular` (default) em controles e
texto; `duotone` em navegação, cabeçalhos de página e empty states; `fill` no
item de navegação ativo. Server components importam de
`@phosphor-icons/react/dist/ssr` (o entry padrão usa contexto client); o tipo
`Icon` é exportado apenas pelo entry principal (import type é seguro em ambos).

Escala fechada — via wrapper `<Icon>` (`components/ui/icon.tsx`) ou classes:

| Tamanho | Classe     | Contexto                                    |
| ------- | ---------- | ------------------------------------------- |
| 14px    | `size-3.5` | metadados, badges, células densas           |
| 16px    | `size-4`   | botões, inputs, itens de menu (default)     |
| 20px    | `size-5`   | cabeçalho de página/painel, empty states    |

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
4. **`framer-motion`** — só drag do funil e coreografias que CSS não resolve.

Sem stagger de cards (delays escalonados) — conteúdo de página entra de uma vez.
Única animação em loop permitida: shimmer do `Loader`.

## Componentes

### Button (`components/ui/button.tsx`)

| Variante            | Quando                                              |
| ------------------- | --------------------------------------------------- |
| `primary`           | a ação principal da tela/painel (máx. 1 por contexto) |
| `secondary`         | ações normais (borda + fundo claro)                 |
| `ghost`             | ações de baixa ênfase, barras de ferramentas, ícones |
| `destructive`       | confirmação de exclusão/ação irreversível           |
| `destructive-ghost` | gatilho de exclusão em listas/menus                 |
| `link`              | navegação inline com cara de link                   |

Tamanhos: `sm` (h-8) · `md` (h-9, default) · `lg` (h-10, página pública/CTAs) ·
`icon` (36px) · `icon-sm` (32px, ações de linha de tabela).

### Badge (`components/ui/badge.tsx`)

Variantes: `neutral` · `primary` · `success` · `warning` · `destructive`.
Nunca recriar pill com `<span className="rounded-full ...">` — se faltar variante,
adicione no componente.

### Table / DataTable

- Header: `text-label font-medium tracking-wide uppercase text-muted-foreground`.
- Alinhamento por coluna no `DataTable`: `meta: { align: "right" }` na ColumnDef
  (números/dinheiro à direita).
- Largura de coluna: só quando a ColumnDef define `size` explícito.
- Sem zebra; hover discreto `hover:bg-background`.

### Sidebar (subsistema deliberado)

Shell escura (`--sidebar-*`) sobre canvas claro — padrão Vercel/Linear, **não** é
dark mode nem sinal para criar um. Estados ativos derivam do primary via
`color-mix` para acompanhar o white-label. Nenhum outro componente usa esses tokens.

### PDFs (`lib/pdf/`)

Todo documento usa `lib/pdf/pdf-theme.ts` (paleta espelhada dos tokens + escala de
tipo + espaçamentos). Nunca hex direto em `StyleSheet.create`.

## Página pública (`/agendar`)

Público: paciente final, sem login. Direção: **base neutra e calma + CTA sólido**
(primary só em ação/seleção). Tipografia um passo maior que o app interno
(`text-body` mínimo para corpo, `lg` para CTAs). Contraste AA obrigatório em
todo texto e estado. Mesmo rigor de acessibilidade e performance de landing page.
