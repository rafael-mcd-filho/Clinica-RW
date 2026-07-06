/**
 * Paleta categórica do hi-clinic — única origem permitida de cor "de dado"
 * (etapas de funil, tags, séries de gráfico). Cores de UI ficam em globals.css.
 *
 * Tons calibrados para AA sobre branco quando usados como texto e para leitura
 * confortável como fundo de selo/dot.
 */
export const categoricalColors = {
  slate: "#64748b",
  blue: "#3b82f6",
  blueSoft: "#93c5fd",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  green: "#16a34a",
  amber: "#d97706",
  red: "#dc2626",
  teal: "#0d9488",
  pink: "#db2777",
} as const;

export type CategoricalColor = keyof typeof categoricalColors;

/** Cor padrão de uma nova etapa de funil. */
export const defaultStageColor = categoricalColors.blue;

/** Cor padrão de uma agenda de profissional sem cor configurada. */
export const defaultScheduleColor = categoricalColors.blue;

/** Série ordenada para gráficos (barras/linhas categóricas). */
export const chartSeries: string[] = [
  categoricalColors.blue,
  categoricalColors.teal,
  categoricalColors.violet,
  categoricalColors.amber,
  categoricalColors.green,
  categoricalColors.pink,
  categoricalColors.slate,
];
