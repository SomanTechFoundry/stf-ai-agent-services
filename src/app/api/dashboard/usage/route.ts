/**
 * GET /api/dashboard/usage
 */

import { requireDashboardSession } from "@/lib/auth/dashboard-auth";
import { getUsageSummary } from "@/lib/services/usage.service";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

export async function GET() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardSession();
    const data = await getUsageSummary(session.businessId);
    return successResponse(data, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
