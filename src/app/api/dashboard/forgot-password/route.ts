/**
 * POST /api/dashboard/forgot-password
 * Always returns a generic success message. In non-production, also returns resetUrl.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { passwordResetService } from "@/lib/services/password-reset.service";
import { parseBody } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const ip = getClientIp(request);
  try {
    checkRateLimit(`forgot:${ip}`, 5, 60_000);
    const body = await request.json().catch(() => ({}));
    const { email } = parseBody(schema, body);
    const result = await passwordResetService.requestReset(email);

    logger.event("dashboard_forgot_password", "Password reset requested", {
      requestId,
      outcome: "success",
    });

    return successResponse(
      {
        message: "If that email is on file, a reset link is available.",
        emailed: result.emailed,
        ...(result.resetUrl && { resetUrl: result.resetUrl }),
      },
      200,
      { requestId }
    );
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
