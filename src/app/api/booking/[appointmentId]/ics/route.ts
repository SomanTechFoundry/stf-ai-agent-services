/**
 * GET /api/booking/[appointmentId]/ics — downloadable calendar event.
 */

import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAppointmentIcs } from "@/lib/utils/ics";

type RouteContext = { params: Promise<{ appointmentId: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { appointmentId } = await params;
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      business: {
        select: {
          name: true,
          email: true,
          address: true,
          city: true,
          state: true,
          status: true,
        },
      },
      service: { select: { name: true, durationMinutes: true } },
    },
  });

  if (
    !appt ||
    appt.business.status === "SUSPENDED" ||
    appt.business.status === "CANCELLED"
  ) {
    return new Response("Not found", { status: 404 });
  }

  const location = [appt.business.address, appt.business.city, appt.business.state]
    .filter(Boolean)
    .join(", ");
  const ics = buildAppointmentIcs({
    appointmentId: appt.id,
    title: `${appt.service.name} at ${appt.business.name}`,
    description: `Your ${appt.service.name} appointment.`,
    location,
    start: appt.startTime,
    end: appt.endTime,
    organizerEmail: appt.business.email,
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="appointment.ics"`,
    },
  });
}
