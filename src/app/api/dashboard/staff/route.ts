/**
 * GET  /api/dashboard/staff — stylists + catalog services for assignment
 * POST /api/dashboard/staff
 */

import { type NextRequest } from "next/server";
import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { staffService } from "@/lib/services/staff.service";
import { serviceService } from "@/lib/services/service.service";
import { parseBody, createStaffSchema } from "@/lib/validation";
import { successResponse, createdResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";

export async function GET() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const [staff, services] = await Promise.all([
      staffService.list(session.businessId, false),
      serviceService.list(session.businessId, false),
    ]);
    logger.event("dashboard_staff_list", "Owner listed staff", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
    });
    return successResponse(
      {
        staff,
        services: services.map((s) => ({
          id: s.id,
          name: s.name,
          isActive: s.isActive,
        })),
      },
      200,
      { requestId }
    );
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const body = await request.json().catch(() => ({}));
    const input = parseBody(createStaffSchema, body);
    const staff = await staffService.create(session.businessId, input);
    logger.event("dashboard_staff_create", "Owner created a staff member", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      staffId: staff.id,
      outcome: "success",
    });
    return createdResponse(staff);
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
