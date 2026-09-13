/**
 * GET /api/dashboard/hours
 * PUT /api/dashboard/hours — replace the weekly schedule
 */

import { type NextRequest } from "next/server";
import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { businessHoursService } from "@/lib/services/business-hours.service";
import { parseBody, setBusinessHoursSchema } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";

export async function GET() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const hours = await businessHoursService.getHours(session.businessId);
    return successResponse(hours, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

export async function PUT(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const body = await request.json().catch(() => ({}));
    const input = parseBody(setBusinessHoursSchema, body);
    const hours = await businessHoursService.setHours(session.businessId, input);
    logger.event("dashboard_hours_update", "Owner updated business hours", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      outcome: "success",
    });
    return successResponse(hours, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
