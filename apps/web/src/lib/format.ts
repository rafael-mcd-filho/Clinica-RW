/**
 * Formatação em pt-BR num lugar só (Raio-X V5): moeda, percentual, número e
 * plural saem iguais em todas as telas — vírgula decimal, sem "-R$ 0,00",
 * sem "1 bloqueios".
 */

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

/** Arredonda e troca o -0 por 0 (o que gerava "-R$ 0,00" e "-0%"). */
function rounded(value: number, fractionDigits: number) {
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor || 0;
}

export function formatCurrency(value: number | string | null | undefined) {
  return currency.format(rounded(toNumber(value), 2));
}

/** Moeda sem sinal: para "A pagar" e "Saídas", em que o rótulo já diz o lado. */
export function formatCurrencyAbsolute(
  value: number | string | null | undefined,
) {
  return formatCurrency(Math.abs(toNumber(value)));
}

export function formatNumber(
  value: number | string | null | undefined,
  fractionDigits = 0,
) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(rounded(toNumber(value), fractionDigits));
}

/**
 * Percentual já em pontos (12.5 => "12,5%"). Com `signed`, variações levam
 * sinal ("+12,5%", "−3%"); zero fica sem sinal.
 */
export function formatPercent(
  value: number | string | null | undefined,
  options: { signed?: boolean; fractionDigits?: number } = {},
) {
  const fractionDigits = options.fractionDigits ?? 1;
  const number = rounded(toNumber(value), fractionDigits);
  const text = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
    signDisplay: options.signed ? "exceptZero" : "auto",
  }).format(number);
  return `${text}%`;
}

/** "1 bloqueio", "2 bloqueios", "1.240 pacientes". */
export function pluralize(count: number, singular: string, plural: string) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
