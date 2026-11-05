import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("@/lib/observability/logger");

    logger.info("application.started", {
      environment: process.env.NODE_ENV,
    });
  }
}

/**
 * Raio-X EN5: erro em página, rota ou server action vira alerta (Sentry e/ou
 * canal), sem a query string — busca por nome de paciente vai na URL.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("@/lib/observability/logger");
  const { reportError } = await import("@/lib/observability/alerts");
  const details = {
    path: request.path.split("?")[0],
    method: request.method,
    router: context.routerKind,
    route: context.routePath,
    type: context.routeType,
    digest: (error as { digest?: string }).digest ?? null,
  };
  logger.error("request.error", details, { report: false });
  await reportError("request.error", details, error);
};
