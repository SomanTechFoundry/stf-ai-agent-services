/**
 * GET  /api/dashboard/team
 * POST /api/dashboard/team — invite a front-desk user
 */

import { type NextRequest } from "next/server";
import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { dashboardUserService } from "@/lib/services/dashboard-user.service";
import { parseBody, inviteTeamUserSchema } from "@/lib/validation";
import { successResponse, createdResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";

export async function GET() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const users = await dashboardUserService.list(session.businessId);
    return successResponse(users, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const body = await request.json().catch(() => ({}));
    const input = parseBody(inviteTeamUserSchema, body);
    const result = await dashboardUserService.invite(session.businessId, input);
    logger.event("dashboard_team_invite", "Owner invited a team member", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      invitedUserId: result.user.id,
      outcome: "success",
    });
    return createdResponse(result);
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
