/**
 * GET /api/dashboard/escalations — count of conversations that need a human.
 */

import { requireDashboardSession } from "@/lib/auth/dashboard-auth";
import { prisma } from "@/lib/db/prisma";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

export async function GET() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardSession();
    const count = await prisma.conversation.count({
      where: { businessId: session.businessId, status: "ESCALATED" },
    });
    return successResponse({ count }, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
