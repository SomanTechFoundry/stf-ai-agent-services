/**
 * Standardized API response helpers.
 *
 * All API routes should use these helpers to ensure consistent
 * response shapes, proper status codes, and safe error handling.
 */

import { NextResponse } from "next/server";
import { AppError, isAppError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export function successResponse<T>(
  data: T,
  status = 200,
  meta?: Record<string, unknown>
): NextResponse<ApiSuccessResponse<T>> {
  const body: ApiSuccessResponse<T> = { data };
  if (meta) body.meta = meta;
  return NextResponse.json(body, { status });
}

export function createdResponse<T>(data: T): NextResponse<ApiSuccessResponse<T>> {
  return successResponse(data, 201);
}

/**
 * Handle any thrown error and return a safe API response.
 * Internal error details are logged but never sent to the client.
 */
export function errorResponse(
  err: unknown,
  context?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
  const appError = isAppError(err) ? err : toAppError(err);

  if (appError.httpStatus >= 500) {
    logger.error("Unhandled API error", appError, {
      ...context,
      errorCode: appError.code,
      detail: appError.detail,
    });
    void import("@/lib/monitoring/sentry").then(({ captureException }) =>
      captureException(appError, context)
    );
  } else {
    logger.warn("Client error", {
      ...context,
      errorCode: appError.code,
      message: appError.message,
    });
  }

  return NextResponse.json(appError.toSafeJSON() as ApiErrorResponse, {
    status: appError.httpStatus,
  });
}

/**
 * Wrap an API route handler with standardized error handling.
 * Use this to avoid try/catch boilerplate in every route.
 */
export function withErrorHandling<T>(
  handler: () => Promise<NextResponse<T>>
): Promise<NextResponse<T | ApiErrorResponse>> {
  return handler().catch((err) => errorResponse(err));
}
