/**
 * Error reporting. Uses @sentry/nextjs when SENTRY_DSN is set.
 */

import { logger } from "@/lib/logger";

let initialized = false;

export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || initialized) {
    if (!dsn) {
      logger.debug("Sentry off — SENTRY_DSN is not set");
    }
    return;
  }
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
    initialized = true;
    logger.info("Sentry initialized");
  } catch (err) {
    logger.warn("Sentry SDK failed to initialize", {
      event: "sentry_init_failed",
      errorName: err instanceof Error ? err.name : "Unknown",
    });
  }
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  logger.error("Exception captured", err, {
    event: "exception_captured",
    ...context,
  });
  if (!process.env.SENTRY_DSN) return;
  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureException(err, { extra: context });
    })
    .catch(() => {
      /* package missing — logs already recorded */
    });
}
