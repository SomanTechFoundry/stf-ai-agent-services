/**
 * POST /api/dashboard/reset-password
 * Body: { token, password }
 */

import { type NextRequest } from "next/server";
import { passwordResetService } from "@/lib/services/password-reset.service";
import { parseBody, resetPasswordSchema } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const ip = getClientIp(request);
  try {
    checkRateLimit(`reset:${ip}`, 8, 60_000);
    const body = await request.json().catch(() => ({}));
    const { token, password } = parseBody(resetPasswordSchema, body);
    await passwordResetService.resetWithToken(token, password);
    return successResponse({ reset: true }, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
