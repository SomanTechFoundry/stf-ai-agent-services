/**
 * Optional Sentry integration — activates when SENTRY_DSN is set.
 */

import { logger } from "@/lib/logger";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    // Dynamic import keeps dev/test fast when Sentry is not installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs") as typeof import("@sentry/nextjs");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    });
    initialized = true;
    logger.info("Sentry initialized");
  } catch {
    logger.warn("SENTRY_DSN set but @sentry/nextjs not installed — skipping");
  }
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs") as typeof import("@sentry/nextjs");
    Sentry.captureException(err, { extra: context });
  } catch {
    /* optional */
  }
}
