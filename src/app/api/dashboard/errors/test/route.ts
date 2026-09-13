/**
 * POST /api/dashboard/errors/test — owner can confirm Sentry is receiving events.
 */

import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { captureException } from "@/lib/monitoring/sentry";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { env } from "@/lib/config/env";

export async function POST() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const err = new Error("STF dashboard test error — safe to ignore");
    captureException(err, {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      source: "dashboard_test",
    });
    return successResponse(
      {
        sent: Boolean(env().sentry.dsn),
        preview: env().sentry.dsn
          ? "Test error sent to Sentry."
          : "SENTRY_DSN is not set. The error was logged locally only.",
      },
      200,
      { requestId }
    );
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
