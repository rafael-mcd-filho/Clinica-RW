/**
 * Configuração da integração com a Evolution API.
 *
 * Todos os valores vêm de variáveis de ambiente (apps/web/.env.local) — nunca
 * hardcode a API key aqui. Estas funções rodam apenas no servidor.
 */
export type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
  instance: string;
};

function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente ${name} ausente. Configure em apps/web/.env.local.`,
    );
  }
  return value;
}

/** Lê e valida a config da Evolution. Lança erro claro se algo faltar. */
export function getEvolutionConfig(): EvolutionConfig {
  return {
    baseUrl: readRequired("EVOLUTION_API_URL").replace(/\/+$/, ""),
    apiKey: readRequired("EVOLUTION_API_KEY"),
    instance: readRequired("EVOLUTION_INSTANCE"),
  };
}

/** True quando a integração está configurada (sem lançar). */
export function isEvolutionConfigured(): boolean {
  return Boolean(
    process.env.EVOLUTION_API_URL &&
    process.env.EVOLUTION_API_KEY &&
    process.env.EVOLUTION_INSTANCE,
  );
}

/** Segredo compartilhado esperado no header do webhook (opcional mas recomendado). */
export function getWebhookSecret(): string | null {
  return process.env.WHATSAPP_WEBHOOK_SECRET ?? null;
}
