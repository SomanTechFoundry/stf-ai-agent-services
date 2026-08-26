/**
 * Structured error types for the platform.
 *
 * Using typed errors allows consistent API error responses,
 * meaningful logging, and safe error handling across the stack.
 */

export enum ErrorCode {
  // Generic
  INTERNAL_ERROR = "INTERNAL_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  RATE_LIMITED = "RATE_LIMITED",

  // Tenant/Business
  BUSINESS_NOT_FOUND = "BUSINESS_NOT_FOUND",
  TENANT_ISOLATION_VIOLATION = "TENANT_ISOLATION_VIOLATION",

  // Customer
  CUSTOMER_NOT_FOUND = "CUSTOMER_NOT_FOUND",
  CUSTOMER_ALREADY_EXISTS = "CUSTOMER_ALREADY_EXISTS",

  // Appointment
  APPOINTMENT_NOT_FOUND = "APPOINTMENT_NOT_FOUND",
  APPOINTMENT_CONFLICT = "APPOINTMENT_CONFLICT",
  APPOINTMENT_OUTSIDE_HOURS = "APPOINTMENT_OUTSIDE_HOURS",
  APPOINTMENT_DUPLICATE = "APPOINTMENT_DUPLICATE",

  // Service
  SERVICE_NOT_FOUND = "SERVICE_NOT_FOUND",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",

  // Staff
  STAFF_NOT_FOUND = "STAFF_NOT_FOUND",
  STAFF_UNAVAILABLE = "STAFF_UNAVAILABLE",

  // AI
  AI_PROVIDER_ERROR = "AI_PROVIDER_ERROR",
  AI_TOOL_ERROR = "AI_TOOL_ERROR",
  AI_CONTEXT_TOO_LONG = "AI_CONTEXT_TOO_LONG",

  // External integrations
  CALENDAR_ERROR = "CALENDAR_ERROR",
  SMS_ERROR = "SMS_ERROR",
  EMAIL_ERROR = "EMAIL_ERROR",
  PAYMENT_ERROR = "PAYMENT_ERROR",

  // Configuration
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
  MISSING_ENVIRONMENT_VARIABLE = "MISSING_ENVIRONMENT_VARIABLE",
}

/**
 * Base application error — always includes a code, http status, and safe message.
 * The `detail` field is for internal logging only and must never be sent to customers.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly detail?: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus = 500,
    options?: { detail?: string; context?: Record<string, unknown>; cause?: Error }
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.detail = options?.detail;
    this.context = options?.context;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  toSafeJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

export class ValidationError extends AppError {
  public readonly fields?: Record<string, string>;

  constructor(
    message: string,
    fields?: Record<string, string>,
    detail?: string
  ) {
    super(ErrorCode.VALIDATION_ERROR, message, 400, { detail });
    this.name = "ValidationError";
    this.fields = fields;
  }

  toSafeJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        fields: this.fields,
      },
    };
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} not found: ${id}`
      : `${resource} not found`;
    super(ErrorCode.NOT_FOUND, message, 404);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(ErrorCode.UNAUTHORIZED, message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super(ErrorCode.FORBIDDEN, message, 403);
    this.name = "ForbiddenError";
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests. Please try again shortly.") {
    super(ErrorCode.RATE_LIMITED, message, 429);
    this.name = "RateLimitedError";
  }
}

export class TenantIsolationError extends AppError {
  constructor() {
    super(
      ErrorCode.TENANT_ISOLATION_VIOLATION,
      "Access denied",
      403,
      { detail: "Attempted cross-tenant data access" }
    );
    this.name = "TenantIsolationError";
  }
}

export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(
    service: string,
    code: ErrorCode,
    message: string,
    cause?: Error
  ) {
    super(code, message, 502, {
      detail: `External service error: ${service}`,
      cause,
    });
    this.name = "ExternalServiceError";
    this.service = service;
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(ErrorCode.CONFIGURATION_ERROR, message, 500, {
      detail: "Platform configuration error — check environment variables",
    });
    this.name = "ConfigurationError";
  }
}

/**
 * Type guard to check if an unknown value is an AppError.
 */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Convert any unknown thrown value into an AppError for safe handling.
 */
export function toAppError(err: unknown): AppError {
  if (isAppError(err)) return err;
  if (err instanceof Error) {
    return new AppError(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred", 500, {
      detail: err.message,
      cause: err,
    });
  }
  return new AppError(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred", 500, {
    detail: String(err),
  });
}
