/**
 * Tema central dos PDFs — espelha os tokens de globals.css.
 *
 * PDFs não resolvem CSS vars: os valores aqui são estáticos e devem ser
 * atualizados junto com globals.css quando a paleta mudar. A fonte é a
 * Helvetica embutida do formato PDF — zero fetch em runtime, render
 * determinístico em servidor. Nenhum documento em lib/pdf/ pode declarar
 * cor fora deste arquivo.
 */
export const pdfTheme = {
  colors: {
    /** Texto corrente. */
    foreground: "#1e293b",
    /** Títulos e valores de destaque. */
    heading: "#0f172a",
    /** Metadados, rodapés, legendas. */
    muted: "#64748b",
    /** Texto secundário e réguas fortes. */
    secondary: "#475569",
    /** Bordas de tabela e divisores. */
    border: "#e2e8f0",
    /** Bordas de destaque. */
    borderStrong: "#cbd5e1",
    /** Fundo de header de tabela / faixas. */
    surface: "#f1f5f9",
    /** Acento institucional (default do white-label). */
    primary: "#1e4fa3",
  },
  font: {
    family: "Helvetica",
  },
  text: {
    caption: 7,
    label: 8,
    body: 9,
    heading: 12,
    title: 17,
  },
  spacing: {
    page: 36,
    section: 16,
  },
} as const;
