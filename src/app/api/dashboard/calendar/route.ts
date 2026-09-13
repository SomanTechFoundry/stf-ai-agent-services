/**
 * GET /api/dashboard/calendar — connection status + local busy blocks
 * POST /api/dashboard/calendar — add a local blocked time
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { calendarSyncService } from "@/lib/services/calendar-sync.service";
import { localToUtc } from "@/lib/utils/date-time";
import { prisma } from "@/lib/db/prisma";
import { parseBody } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

const addBlockSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  title: z.string().max(80).optional(),
});

export async function GET() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const status = await calendarSyncService.getStatus(session.businessId);
    return successResponse(status, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const input = parseBody(addBlockSchema, await request.json().catch(() => ({})));
    const business = await prisma.business.findUnique({
      where: { id: session.businessId },
      select: { timezone: true },
    });
    const tz = business?.timezone ?? "UTC";
    const block = await calendarSyncService.addBusyBlock(session.businessId, {
      start: localToUtc(input.date, input.startTime, tz),
      end: localToUtc(input.date, input.endTime, tz),
      title: input.title ?? "Blocked",
    });
    return successResponse({ block }, 201, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
