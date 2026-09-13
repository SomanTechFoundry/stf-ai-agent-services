/**
 * Error reporting hook.
 *
 * @sentry/nextjs is not a required dependency — this module never imports it,
 * so Next.js/Turbopack will not warn about a missing package.
 *
 * When you add Sentry later, wire it here with a real import.
 */

import { logger } from "@/lib/logger";

export function initSentry(): void {
  if (process.env.SENTRY_DSN) {
    logger.debug("SENTRY_DSN is set but Sentry SDK is not wired — errors stay in logs only");
  }
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  logger.debug("Exception captured (logs only)", {
    event: "exception_captured",
    errorName: err instanceof Error ? err.name : "Unknown",
    ...context,
  });
}
