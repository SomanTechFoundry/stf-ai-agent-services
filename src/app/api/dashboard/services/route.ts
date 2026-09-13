/**
 * GET  /api/dashboard/services — all services (including inactive)
 * POST /api/dashboard/services — create a service
 */

import { type NextRequest } from "next/server";
import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { serviceService } from "@/lib/services/service.service";
import { parseBody, createServiceSchema } from "@/lib/validation";
import { successResponse, createdResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";
import type { Service } from "@prisma/client";

function serialize(service: Service) {
  return { ...service, price: Number(service.price) };
}

export async function GET() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const services = await serviceService.list(session.businessId, false);
    logger.event("dashboard_services_list", "Owner listed services", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
    });
    return successResponse(services.map(serialize), 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const body = await request.json().catch(() => ({}));
    const input = parseBody(createServiceSchema, body);
    const service = await serviceService.create(session.businessId, input);
    logger.event("dashboard_service_create", "Owner created a service", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      serviceId: service.id,
      outcome: "success",
    });
    return createdResponse(serialize(service));
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
