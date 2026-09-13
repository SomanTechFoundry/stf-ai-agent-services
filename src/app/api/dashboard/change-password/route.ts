/**
 * POST /api/dashboard/change-password
 * Body: { currentPassword, newPassword }
 */

import { type NextRequest } from "next/server";
import { requireDashboardSession } from "@/lib/auth/dashboard-auth";
import { passwordResetService } from "@/lib/services/password-reset.service";
import { parseBody, changePasswordSchema } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardSession();
    const body = await request.json().catch(() => ({}));
    const { currentPassword, newPassword } = parseBody(changePasswordSchema, body);
    await passwordResetService.changePassword(session.userId, currentPassword, newPassword);
    return successResponse({ updated: true }, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
