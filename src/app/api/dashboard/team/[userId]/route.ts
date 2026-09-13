/**
 * PATCH /api/dashboard/team/:userId — activate / deactivate
 */

import { type NextRequest } from "next/server";
import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { dashboardUserService } from "@/lib/services/dashboard-user.service";
import { parseBody, updateTeamUserSchema } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

type Params = { params: Promise<{ userId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const { userId } = await params;
    const body = await request.json().catch(() => ({}));
    const input = parseBody(updateTeamUserSchema, body);
    const user = await dashboardUserService.setActive(
      session.businessId,
      session.userId,
      userId,
      input.isActive
    );
    return successResponse(user, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
