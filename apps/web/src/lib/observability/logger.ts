type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, boolean | number | string | null | undefined>;

function writeLog(level: LogLevel, event: string, context: LogContext = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "hi-clinic-web",
    ...context,
  };

  if (level === "error") {
    console.error(JSON.stringify(entry));
    return;
  }

  if (level === "warn") {
    console.warn(JSON.stringify(entry));
    return;
  }

  console.info(JSON.stringify(entry));
}

export const logger = {
  info(event: string, context?: LogContext) {
    writeLog("info", event, context);
  },
  warn(event: string, context?: LogContext) {
    writeLog("warn", event, context);
  },
  /**
   * Erro também avisa o monitoramento (Raio-X EN5), sem dado pessoal. Quem
   * precisa garantir o envio antes de responder usa `report: false` aqui e
   * chama `await reportError(...)` (src/lib/observability/alerts.ts).
   */
  error(
    event: string,
    context?: LogContext,
    options: { report?: boolean } = {},
  ) {
    writeLog("error", event, context);
    if (options.report === false || typeof window !== "undefined") return;
    void import("./alerts")
      .then(({ reportError }) => reportError(event, context))
      .catch(() => undefined);
  },
};
