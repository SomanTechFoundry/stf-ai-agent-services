/**
 * POST /api/dashboard/sms/simulate
 * Owner-only local helper: run inbound SMS handling without Twilio.
 * Body: { from: "+1...", body: "STOP" }
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { handleInboundSms } from "@/lib/services/inbound-sms.service";
import { prisma } from "@/lib/db/prisma";
import { parseBody } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

const schema = z.object({
  from: z.string().min(7).max(20),
  body: z.string().min(1).max(1600),
  afterHours: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const payload = await request.json().catch(() => ({}));
    const { from, body, afterHours } = parseBody(schema, payload);

    const business = await prisma.business.findUnique({
      where: { id: session.businessId },
      select: { smsFromNumber: true, phone: true },
    });
    const to = business?.smsFromNumber || business?.phone || "+15555550100";

    const result = await handleInboundSms({ from, to, body, forceClosed: afterHours });
    return successResponse(result, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
