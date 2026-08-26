/**
 * GET    /api/businesses/[businessId]/appointments/[appointmentId] — get one
 * PATCH  /api/businesses/[businessId]/appointments/[appointmentId] — update status
 * DELETE /api/businesses/[businessId]/appointments/[appointmentId] — cancel
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiKey } from "@/lib/auth";
import { appointmentService } from "@/lib/services/appointment.service";
import { parseBody } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ businessId: string; appointmentId: string }> };

// ── Get ───────────────────────────────────────────────────────────────────────

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const requestId = generateRequestId();
  try {
    requireApiKey(request);
    const { businessId, appointmentId } = await params;
    const appointment = await appointmentService.getById(businessId, appointmentId);
    return successResponse(appointment, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

// ── Update ────────────────────────────────────────────────────────────────────

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm"),
  }),
  z.object({
    action: z.literal("complete"),
  }),
  z.object({
    action: z.literal("reschedule"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
  }),
]);

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const requestId = generateRequestId();
  try {
    requireApiKey(request);
    const { businessId, appointmentId } = await params;
    const body  = await request.json();
    const input = parseBody(patchSchema, body);

    logger.info("Appointment update request", { requestId, businessId, appointmentId, action: input.action });

    let updated;
    if (input.action === "confirm") {
      updated = await appointmentService.confirm(businessId, appointmentId);
    } else if (input.action === "complete") {
      updated = await appointmentService.complete(businessId, appointmentId);
    } else {
      updated = await appointmentService.reschedule(
        businessId,
        appointmentId,
        input.date,
        input.time
      );
    }

    return successResponse(updated, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

// ── Cancel ────────────────────────────────────────────────────────────────────

const deleteSchema = z.object({
  reason: z.string().optional(),
});

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const requestId = generateRequestId();
  try {
    requireApiKey(request);
    const { businessId, appointmentId } = await params;
    let reason: string | undefined;

    try {
      const body = await request.json();
      const parsed = deleteSchema.safeParse(body);
      if (parsed.success) reason = parsed.data.reason;
    } catch {
      // DELETE with no body is valid
    }

    logger.info("Appointment cancel request", { requestId, businessId, appointmentId, reason });
    const cancelled = await appointmentService.cancel(businessId, appointmentId, reason);
    return successResponse(cancelled, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
