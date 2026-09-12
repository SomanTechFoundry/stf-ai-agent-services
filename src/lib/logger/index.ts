/**
 * Structured logger for the platform.
 *
 * Production: newline-delimited JSON (Vercel / Datadog / Sentry).
 * Development: readable one-line entries with context.
 *
 * Never log secrets. Context keys matching SENSITIVE_KEYS are redacted.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  event?: string;
  outcome?: "success" | "failure" | "skipped";
  service?: string;
  businessId?: string;
  customerId?: string;
  conversationId?: string;
  appointmentId?: string;
  userId?: string;
  requestId?: string;
  tool?: string;
  durationMs?: number;
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SENSITIVE_KEY = /password|passwd|secret|token|authorization|api[_-]?key|cookie|session|credential/i;

function getConfiguredLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (envLevel && LOG_LEVELS[envLevel] !== undefined) return envLevel;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function formatError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
      code: (err as { code?: string }).code,
    };
  }
  return { name: "UnknownError", message: String(err) };
}

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object") return sanitizeContext(value as Record<string, unknown>);
  return value;
}

export function sanitizeContext(context?: LogContext): LogContext | undefined {
  if (!context) return undefined;
  const clean: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEY.test(key)) {
      clean[key] = "[REDACTED]";
    } else {
      clean[key] = redactValue(value);
    }
  }
  return clean;
}

function writeLog(entry: LogEntry) {
  const configuredLevel = getConfiguredLevel();
  if (LOG_LEVELS[entry.level] < LOG_LEVELS[configuredLevel]) return;

  if (process.env.NODE_ENV === "production") {
    const line = JSON.stringify(entry);
    if (entry.level === "error" || entry.level === "warn") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  } else {
    const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
    const errStr = entry.error
      ? `\n  Error: ${entry.error.name}: ${entry.error.message}${
          entry.error.stack ? "\n" + entry.error.stack : ""
        }`
      : "";
    const line = `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}${ctx}${errStr}`;

    if (entry.level === "error") console.error(line);
    else if (entry.level === "warn") console.warn(line);
    else console.log(line);
  }
}

function createEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  err?: unknown
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: "stf-ai-agent-services",
    context: sanitizeContext(context),
    error: err !== undefined ? formatError(err) : undefined,
  };
}

export const logger = {
  debug(message: string, context?: LogContext) {
    writeLog(createEntry("debug", message, context));
  },

  info(message: string, context?: LogContext) {
    writeLog(createEntry("info", message, context));
  },

  warn(message: string, context?: LogContext) {
    writeLog(createEntry("warn", message, context));
  },

  error(message: string, err?: unknown, context?: LogContext) {
    writeLog(createEntry("error", message, context, err));
  },

  /** Named operational event — prefer this for start/success/failure of a feature. */
  event(
    event: string,
    message: string,
    context?: Omit<LogContext, "event">,
    level: LogLevel = "info"
  ) {
    writeLog(createEntry(level, message, { event, ...context }));
  },

  withContext(baseContext: LogContext) {
    return {
      debug(message: string, context?: LogContext) {
        writeLog(createEntry("debug", message, { ...baseContext, ...context }));
      },
      info(message: string, context?: LogContext) {
        writeLog(createEntry("info", message, { ...baseContext, ...context }));
      },
      warn(message: string, context?: LogContext) {
        writeLog(createEntry("warn", message, { ...baseContext, ...context }));
      },
      error(message: string, err?: unknown, context?: LogContext) {
        writeLog(createEntry("error", message, { ...baseContext, ...context }, err));
      },
      event(
        event: string,
        message: string,
        context?: Omit<LogContext, "event">,
        level: LogLevel = "info"
      ) {
        writeLog(createEntry(level, message, { ...baseContext, event, ...context }));
      },
    };
  },
};
