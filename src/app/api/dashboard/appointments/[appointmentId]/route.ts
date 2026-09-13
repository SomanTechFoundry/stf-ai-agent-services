/**
 * PATCH /api/dashboard/appointments/[appointmentId]
 * Body: { action: "confirm" | "cancel" | "complete", reason?: string }
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireDashboardSession } from "@/lib/auth/dashboard-auth";
import { appointmentService } from "@/lib/services/appointment.service";
import { notificationService } from "@/lib/services/notification.service";
import { reminderService } from "@/lib/services/reminder.service";
import { parseBody } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("no_show") }),
  z.object({ action: z.literal("remind") }),
  z.object({
    action: z.literal("cancel"),
    reason: z.string().optional(),
    force: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("reschedule"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
  }),
]);

type RouteContext = { params: Promise<{ appointmentId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardSession();
    const { appointmentId } = await params;
    const body = await request.json().catch(() => ({}));
    const input = parseBody(patchSchema, body);

    logger.event("dashboard_appointment_action", "Owner appointment action requested", {
      requestId,
      businessId: session.businessId,
      appointmentId,
      action: input.action,
      userId: session.userId,
    });

    let updated;
    if (input.action === "confirm") {
      updated = await appointmentService.confirm(session.businessId, appointmentId);
    } else if (input.action === "complete") {
      updated = await appointmentService.complete(session.businessId, appointmentId);
    } else if (input.action === "no_show") {
      updated = await appointmentService.markNoShow(session.businessId, appointmentId);
    } else if (input.action === "remind") {
      const reminder = await reminderService.sendForAppointment(
        session.businessId,
        appointmentId,
        { ignoreAlreadySent: true }
      );
      return successResponse({ reminder }, 200, { requestId });
    } else if (input.action === "cancel") {
      updated = await appointmentService.cancel(
        session.businessId,
        appointmentId,
        input.reason,
        { force: Boolean(input.force) }
      );
      void notificationService.sendAppointmentCancellation(appointmentId, session.businessId);
    } else {
      updated = await appointmentService.reschedule(
        session.businessId,
        appointmentId,
        input.date,
        input.time
      );
      void notificationService.sendAppointmentReschedule(appointmentId, session.businessId);
    }

    logger.event("dashboard_appointment_action", "Owner appointment action completed", {
      requestId,
      businessId: session.businessId,
      appointmentId,
      action: input.action,
      userId: session.userId,
      outcome: "success",
    });

    return successResponse(updated, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId, event: "dashboard_appointment_action" });
  }
}
