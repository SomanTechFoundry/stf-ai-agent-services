/**
 * POST /api/dashboard/sms/test
 * Body: { to: "+1..." }
 * Sends a test SMS using this business's from-number (or logs a preview locally).
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { notificationService } from "@/lib/services/notification.service";
import { parseBody } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

const schema = z.object({
  to: z.string().min(7).max(20),
});

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const body = await request.json().catch(() => ({}));
    const { to } = parseBody(schema, body);
    const result = await notificationService.sendTestSms(session.businessId, to);
    return successResponse(result, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
