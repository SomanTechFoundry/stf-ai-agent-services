/**
 * POST /api/cron/reminders
 * Sends due appointment reminders (default: starts in 12–36 hours).
 * Auth: x-api-key (API_SECRET_KEY) or Authorization: Bearer CRON_SECRET
 */

import { type NextRequest } from "next/server";
import { requireApiKey } from "@/lib/auth";
import { reminderService } from "@/lib/services/reminder.service";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { UnauthorizedError } from "@/lib/errors";
import { logger } from "@/lib/logger";

function authorizeCron(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  if (cronSecret && bearer === `Bearer ${cronSecret}`) return;
  requireApiKey(request);
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    try {
      authorizeCron(request);
    } catch {
      throw new UnauthorizedError("Invalid cron credentials.");
    }

    const minHours = Number(request.nextUrl.searchParams.get("minHours") ?? 12);
    const maxHours = Number(request.nextUrl.searchParams.get("maxHours") ?? 36);
    const businessId = request.nextUrl.searchParams.get("businessId") ?? undefined;

    const result = await reminderService.sendDue({
      businessId,
      minHours: Number.isFinite(minHours) ? minHours : 12,
      maxHours: Number.isFinite(maxHours) ? maxHours : 36,
    });

    logger.event("cron_reminders", "Reminder job finished", {
      requestId,
      sent: result.count,
      scanned: result.results.length,
      outcome: "success",
    });

    return successResponse(result, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
