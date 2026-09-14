/**
 * POST /api/dashboard/billing/checkout
 */

import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { createCheckoutSession } from "@/lib/services/billing.service";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

export async function POST() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const result = await createCheckoutSession(session.businessId, session.email);
    return successResponse(result, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
