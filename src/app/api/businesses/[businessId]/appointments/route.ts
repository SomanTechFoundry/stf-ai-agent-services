/**
 * GET  /api/businesses/[businessId]/appointments  — list appointments with filters
 * POST /api/businesses/[businessId]/appointments  — create an appointment
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiKey } from "@/lib/auth";
import { appointmentService } from "@/lib/services/appointment.service";
import { parseBody } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";

// ── List ──────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const requestId = generateRequestId();
  try {
    requireApiKey(request);
    const { businessId } = await params;
    const sp = request.nextUrl.searchParams;

    const filters = {
      status:     (sp.get("status") as Parameters<typeof appointmentService.list>[1]["status"]) ?? undefined,
      staffId:    sp.get("staffId")    ?? undefined,
      customerId: sp.get("customerId") ?? undefined,
      dateFrom:   sp.get("dateFrom")   ?? undefined,
      dateTo:     sp.get("dateTo")     ?? undefined,
      limit:      sp.get("limit")  ? parseInt(sp.get("limit")!)  : 50,
      offset:     sp.get("offset") ? parseInt(sp.get("offset")!) : 0,
    };

    logger.info("Appointments list request", { requestId, businessId, filters });
    const result = await appointmentService.list(businessId, filters);
    return successResponse(result, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

// ── Create ────────────────────────────────────────────────────────────────────

const createAppointmentSchema = z.object({
  customerId:      z.string().min(1),
  serviceId:       z.string().min(1),
  staffId:         z.string().optional(),
  date:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  time:            z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
  notes:           z.string().optional(),
  conversationId:  z.string().optional(),
  idempotencyKey:  z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const requestId = generateRequestId();
  try {
    requireApiKey(request);
    const { businessId } = await params;
    const body  = await request.json();
    const input = parseBody(createAppointmentSchema, body);

    logger.info("Appointment create request", {
      requestId,
      businessId,
      serviceId: input.serviceId,
      date: input.date,
    });

    const appointment = await appointmentService.createAppointment(businessId, input);
    return successResponse(appointment, 201, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
