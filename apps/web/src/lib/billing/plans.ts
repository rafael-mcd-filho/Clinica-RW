export const planPrices = {
  starter: 149,
  professional: 299,
  clinic: 599,
} as const;

export function getPlanPrice(planKey: string) {
  return planPrices[planKey as keyof typeof planPrices] ?? 0;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}
