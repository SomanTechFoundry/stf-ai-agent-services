/**
 * POST /api/integrations/google/disconnect
 */

import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { calendarSyncService } from "@/lib/services/calendar-sync.service";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

export async function POST() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    await calendarSyncService.disconnect(session.businessId);
    return successResponse({ disconnected: true }, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
