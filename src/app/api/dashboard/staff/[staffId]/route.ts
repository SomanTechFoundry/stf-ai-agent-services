/**
 * PATCH  /api/dashboard/staff/:staffId
 * DELETE /api/dashboard/staff/:staffId — deactivate
 */

import { type NextRequest } from "next/server";
import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { staffService } from "@/lib/services/staff.service";
import { parseBody, updateStaffSchema } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";

type Params = { params: Promise<{ staffId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const { staffId } = await params;
    const body = await request.json().catch(() => ({}));
    const input = parseBody(updateStaffSchema, body);
    const staff = await staffService.update(session.businessId, staffId, input);
    logger.event("dashboard_staff_update", "Owner updated a staff member", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      staffId,
      outcome: "success",
    });
    return successResponse(staff, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const { staffId } = await params;
    const staff = await staffService.update(session.businessId, staffId, {
      isActive: false,
      acceptsBookings: false,
    });
    logger.event("dashboard_staff_deactivate", "Owner deactivated a staff member", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      staffId,
      outcome: "success",
    });
    return successResponse(staff, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
