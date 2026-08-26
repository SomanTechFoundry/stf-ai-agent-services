/**
 * GET /api/dashboard/appointments?dateFrom=&dateTo=&status=
 */

import { type NextRequest } from "next/server";
import { type AppointmentStatus } from "@prisma/client";
import { requireDashboardSession } from "@/lib/auth/dashboard-auth";
import { appointmentService } from "@/lib/services/appointment.service";
import { utcToLocal } from "@/lib/utils/date-time";
import { prisma } from "@/lib/db/prisma";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardSession();
    const sp = request.nextUrl.searchParams;

    const business = await prisma.business.findUnique({
      where: { id: session.businessId },
      select: { timezone: true },
    });
    const tz = business?.timezone ?? "UTC";

    const today = utcToLocal(new Date(), tz).date;
    const dateFrom = sp.get("dateFrom") ?? today;
    const dateTo = sp.get("dateTo") ?? today;
    const status = sp.get("status") as AppointmentStatus | null;

    const result = await appointmentService.list(session.businessId, {
      dateFrom,
      dateTo,
      status: status ?? undefined,
      limit: 100,
    });

    const appointments = result.appointments.map((a) => {
      const local = utcToLocal(a.startTime, tz);
      return {
        id: a.id,
        status: a.status,
        startTime: a.startTime.toISOString(),
        endTime: a.endTime.toISOString(),
        localDate: local.date,
        localTime: local.time,
        price: Number(a.price),
        currency: a.currency,
        notes: a.notes,
        customer: a.customer,
        service: a.service,
        staff: a.staff,
      };
    });

    return successResponse(
      { appointments, total: result.total, dateFrom, dateTo, timezone: tz },
      200,
      { requestId }
    );
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
