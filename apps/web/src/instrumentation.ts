export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("@/lib/observability/logger");

    logger.info("application.started", {
      environment: process.env.NODE_ENV,
    });
  }
}
