/**
 * Optional Sentry integration — activates when SENTRY_DSN is set
 * AND @sentry/nextjs is installed. No hard dependency required to build.
 */

import { logger } from "@/lib/logger";

let initialized = false;

type SentryLike = {
  init: (options: {
    dsn: string;
    environment: string;
    tracesSampleRate: number;
  }) => void;
  captureException: (err: unknown, hint?: { extra?: Record<string, unknown> }) => void;
};

function loadSentry(): SentryLike | null {
  try {
    // Optional peer — may be absent until `npm install @sentry/nextjs`
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@sentry/nextjs") as SentryLike;
  } catch {
    return null;
  }
}

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  const Sentry = loadSentry();
  if (!Sentry) {
    logger.warn("SENTRY_DSN set but @sentry/nextjs not installed — skipping");
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    });
    initialized = true;
    logger.info("Sentry initialized");
  } catch (err) {
    logger.warn("Sentry init failed", { error: String(err) });
  }
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = loadSentry();
  if (!Sentry) return;
  try {
    Sentry.captureException(err, { extra: context });
  } catch {
    /* optional */
  }
}
