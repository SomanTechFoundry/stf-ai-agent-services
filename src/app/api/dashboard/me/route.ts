/**
 * GET /api/dashboard/me — current session + business info
 */

import { prisma } from "@/lib/db/prisma";
import { requireDashboardSession } from "@/lib/auth/dashboard-auth";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

export async function GET() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardSession();

    const business = await prisma.business.findUnique({
      where: { id: session.businessId },
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        city: true,
        state: true,
        timezone: true,
      },
    });

    return successResponse({ session, business }, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
