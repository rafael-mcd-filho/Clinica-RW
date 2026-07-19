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
    foreground: "#212b30",
    /** Títulos e valores de destaque. */
    heading: "#212b30",
    /** Metadados, rodapés, legendas. */
    muted: "#90a4ae",
    /** Texto secundário e réguas fortes. */
    secondary: "#455a64",
    /** Bordas de tabela e divisores. */
    border: "#cfd8dc",
    /** Bordas de destaque. */
    borderStrong: "#b0bec5",
    /** Fundo de header de tabela / faixas. */
    surface: "#f9fafb",
    /** Acento institucional (default do white-label). */
    primary: "#0054c2",
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
