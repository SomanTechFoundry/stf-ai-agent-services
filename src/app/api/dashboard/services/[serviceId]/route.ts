/**
 * PATCH  /api/dashboard/services/:serviceId
 * DELETE /api/dashboard/services/:serviceId — soft deactivate
 */

import { type NextRequest } from "next/server";
import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { serviceService } from "@/lib/services/service.service";
import { parseBody, updateServiceSchema } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";
import type { Service } from "@prisma/client";

type Params = { params: Promise<{ serviceId: string }> };

function serialize(service: Service) {
  return { ...service, price: Number(service.price) };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const { serviceId } = await params;
    const body = await request.json().catch(() => ({}));
    const input = parseBody(updateServiceSchema, body);
    const service = await serviceService.update(session.businessId, serviceId, input);
    logger.event("dashboard_service_update", "Owner updated a service", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      serviceId,
      outcome: "success",
    });
    return successResponse(serialize(service), 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const { serviceId } = await params;
    const service = await serviceService.deactivate(session.businessId, serviceId);
    logger.event("dashboard_service_deactivate", "Owner deactivated a service", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      serviceId,
      outcome: "success",
    });
    return successResponse(serialize(service), 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
