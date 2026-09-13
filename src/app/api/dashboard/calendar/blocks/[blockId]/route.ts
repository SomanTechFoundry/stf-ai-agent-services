/**
 * DELETE /api/dashboard/calendar/blocks/[blockId]
 */

import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { calendarSyncService } from "@/lib/services/calendar-sync.service";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

type RouteContext = { params: Promise<{ blockId: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const { blockId } = await params;
    await calendarSyncService.removeBusyBlock(session.businessId, blockId);
    return successResponse({ deleted: true }, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
