import { scrubContext, scrubText, type SafeContext } from "./scrub";

/**
 * Raio-X EN5: erro de produção avisa alguém. Sem SDK: com SENTRY_DSN o
 * evento vai para o Sentry (API de envelope); com ALERT_WEBHOOK_URL vai uma
 * mensagem curta para um canal (Slack, Google Chat ou Discord). Sem nenhum
 * dos dois, fica só no log, como antes.
 *
 * Tudo passa pelo scrub: nada de nome, contato, documento ou texto clínico.
 * O mesmo evento avisa no máximo uma vez a cada 5 minutos por instância.
 */

const throttleMs = 5 * 60_000;
const lastSent = new Map<string, number>();

type ParsedDsn = { endpoint: string; publicKey: string; dsn: string };

export function parseSentryDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!url.username || !projectId) return null;
    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
      dsn,
    };
  } catch {
    return null;
  }
}

function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return error === undefined
      ? null
      : { type: "Error", message: scrubText(String(error)) };
  }
  const frames = (error.stack ?? "")
    .split("\n")
    .slice(1, 9)
    .map((line) => scrubText(line.trim(), 200));
  return {
    type: error.name || "Error",
    message: scrubText(error.message),
    frames,
  };
}

export function buildSentryEnvelope(
  dsn: ParsedDsn,
  event: string,
  context: SafeContext,
  error: unknown,
  now = new Date(),
) {
  const eventId = randomId();
  const details = errorDetails(error);
  const payload = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "javascript",
    level: "error",
    logger: "hi-clinic",
    environment:
      process.env.SENTRY_ENVIRONMENT ??
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    message: { formatted: details ? `${event}: ${details.message}` : event },
    tags: { event },
    extra: {
      ...context,
      ...(details?.frames ? { stack: details.frames.join("\n") } : {}),
    },
    ...(details
      ? {
          exception: {
            values: [{ type: details.type, value: details.message }],
          },
        }
      : {}),
  };
  return [
    JSON.stringify({
      event_id: eventId,
      sent_at: now.toISOString(),
      dsn: dsn.dsn,
    }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(payload),
  ].join("\n");
}

async function post(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    await fetch(url, { ...init, signal: controller.signal });
  } catch {
    // Alerta nunca derruba a requisição de quem estava sendo atendido.
  } finally {
    clearTimeout(timeout);
  }
}

export async function reportError(
  event: string,
  context?: Record<string, unknown>,
  error?: unknown,
) {
  const sentry = parseSentryDsn(process.env.SENTRY_DSN);
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!sentry && !webhook) return;

  const now = Date.now();
  const previous = lastSent.get(event);
  if (previous && now - previous < throttleMs) return;
  lastSent.set(event, now);

  const safe = scrubContext(context);
  const tasks: Promise<void>[] = [];

  if (sentry) {
    tasks.push(
      post(sentry.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-sentry-envelope",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${sentry.publicKey}, sentry_client=hi-clinic/1.0`,
        },
        body: buildSentryEnvelope(sentry, event, safe, error),
      }),
    );
  }

  if (webhook) {
    const details = errorDetails(error);
    const lines = [
      `⚠️ Hi Clinic (${process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "?"}): ${event}`,
      details ? `${details.type}: ${details.message}` : null,
      ...Object.entries(safe)
        .slice(0, 8)
        .map(([key, value]) => `• ${key}: ${String(value)}`),
    ].filter(Boolean);
    const text = lines.join("\n");
    tasks.push(
      post(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // "text" para Slack e Google Chat, "content" para Discord.
        body: JSON.stringify({ text, content: text }),
      }),
    );
  }

  await Promise.all(tasks);
}

/** Só para testes. */
export function resetAlertThrottle() {
  lastSent.clear();
}
