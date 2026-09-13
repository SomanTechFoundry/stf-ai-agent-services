/**
 * GET /api/dashboard/appointments/export?dateFrom=&dateTo=
 * Downloads appointments as CSV for backup / accountant use.
 */

import { type NextRequest } from "next/server";
import { requireDashboardSession } from "@/lib/auth/dashboard-auth";
import { prisma } from "@/lib/db/prisma";
import { utcToLocal, localToUtc } from "@/lib/utils/date-time";
import { errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardSession();
    const sp = request.nextUrl.searchParams;
    const business = await prisma.business.findUnique({
      where: { id: session.businessId },
      select: { timezone: true, slug: true },
    });
    const tz = business?.timezone ?? "UTC";
    const today = utcToLocal(new Date(), tz).date;
    const dateFrom = sp.get("dateFrom") ?? today;
    const dateTo = sp.get("dateTo") ?? today;

    const appointments = await prisma.appointment.findMany({
      where: {
        businessId: session.businessId,
        startTime: {
          gte: localToUtc(dateFrom, "00:00", tz),
          lte: localToUtc(dateTo, "23:59", tz),
        },
      },
      include: {
        service: { select: { name: true, durationMinutes: true } },
        customer: { select: { name: true, phone: true, email: true } },
        staff: { select: { name: true } },
      },
      orderBy: { startTime: "asc" },
      take: 2000,
    });

    const header = [
      "id",
      "date",
      "time",
      "status",
      "service",
      "duration_minutes",
      "staff",
      "customer",
      "phone",
      "email",
      "price",
      "currency",
      "notes",
    ];
    const rows = appointments.map((a) => {
      const local = utcToLocal(a.startTime, tz);
      return [
        a.id,
        local.date,
        local.time,
        a.status,
        a.service.name,
        String(a.service.durationMinutes),
        a.staff?.name ?? "",
        a.customer.name ?? "",
        a.customer.phone ?? "",
        a.customer.email ?? "",
        Number(a.price).toFixed(2),
        a.currency,
        a.notes ?? "",
      ].map((v) => csvCell(v));
    });

    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    logger.event("dashboard_appointments_export", "Appointments exported as CSV", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      dateFrom,
      dateTo,
      count: appointments.length,
      outcome: "success",
    });

    const filename = `${business?.slug ?? "appointments"}-${dateFrom}-to-${dateTo}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
