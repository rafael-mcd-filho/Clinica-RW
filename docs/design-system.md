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

Fonte: **IBM Plex Sans** (400/500/600), carregada em `app/layout.tsx` via
`next/font/google` (`--font-plex`). Uma única família em todo o produto —
hierarquia se faz com tamanho e peso, não com fontes extras.

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
  injetado no `<body>` pelo layout). Default: azul clínico `#1E4FA3`.
- Por isso, `--primary-hover`, `--primary-muted`, `--primary-muted-hover`,
  `--ring` e os estados ativos da sidebar são **derivados via `color-mix()`**
  dentro de `globals.css`. Não criar derivado estático de primary em lugar nenhum.
- Cor saturada só comunica **ação ou estado** (CTA, seleção, status). Nunca decorativa,
  nunca gradiente decorativo.
- Semânticas: `success` (verde), `warning` (âmbar), `destructive` (vermelho) — cada uma
  com par `*-muted` (fundo) e `*-foreground` (texto sobre o muted, contraste AA).
- Bordas: `border` (padrão) e `border-strong` (hover/ênfase). Nunca hex direto.

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
