/**
 * Day-before (and owner-triggered) appointment reminders.
 */

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { notificationService } from "./notification.service";
import { utcToLocal } from "@/lib/utils/date-time";
import { bookingConfirmationUrl } from "@/lib/utils/app-url";

const ACTIVE = ["PENDING", "CONFIRMED", "RESCHEDULED"] as const;

export interface ReminderResult {
  appointmentId: string;
  sent: boolean;
  skipped?: string;
  preview: string;
}

export class ReminderService {
  async sendForAppointment(
    businessId: string,
    appointmentId: string,
    options?: { ignoreAlreadySent?: boolean }
  ): Promise<ReminderResult> {
    const appt = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      include: {
        service: { select: { name: true } },
        customer: { select: { name: true, phone: true, email: true, smsOptIn: true } },
        staff: { select: { name: true } },
        business: { select: { name: true, timezone: true, phone: true } },
      },
    });
    if (!appt) throw new NotFoundError("Appointment", appointmentId);

    if (!ACTIVE.includes(appt.status as (typeof ACTIVE)[number])) {
      throw new ValidationError("Reminders are only sent for upcoming appointments.");
    }
    if (appt.startTime.getTime() <= Date.now()) {
      throw new ValidationError("This appointment has already started.");
    }
    if (appt.reminderSentAt && !options?.ignoreAlreadySent) {
      return {
        appointmentId,
        sent: false,
        skipped: "already_sent",
        preview: "Reminder already sent.",
      };
    }

    const local = utcToLocal(appt.startTime, appt.business.timezone);
    const confirmUrl = bookingConfirmationUrl(appt.id);
    const preview = [
      `Reminder: ${appt.service.name} at ${appt.business.name}`,
      `${local.date} at ${local.time}`,
      appt.staff?.name ? `With ${appt.staff.name}` : "",
      `Details: ${confirmUrl}`,
    ]
      .filter(Boolean)
      .join("\n");

    const delivered = await notificationService.sendAppointmentReminder(
      appointmentId,
      businessId,
      { preview, confirmUrl }
    );

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { reminderSentAt: new Date() },
    });

    logger.event("appointment_reminder_sent", "Appointment reminder processed", {
      businessId,
      appointmentId,
      delivered,
      outcome: "success",
    });

    return { appointmentId, sent: true, preview };
  }

  /**
   * Appointments starting between `minHours` and `maxHours` from now.
   * Default 12–36 hours ≈ day-before window.
   */
  async sendDue(options?: {
    businessId?: string;
    minHours?: number;
    maxHours?: number;
  }): Promise<{ count: number; results: ReminderResult[] }> {
    const minHours = options?.minHours ?? 12;
    const maxHours = options?.maxHours ?? 36;
    const now = Date.now();
    const from = new Date(now + minHours * 3600_000);
    const to = new Date(now + maxHours * 3600_000);

    const due = await prisma.appointment.findMany({
      where: {
        ...(options?.businessId && { businessId: options.businessId }),
        status: { in: [...ACTIVE] },
        reminderSentAt: null,
        startTime: { gte: from, lte: to },
      },
      select: { id: true, businessId: true },
    });

    const results: ReminderResult[] = [];
    for (const row of due) {
      try {
        results.push(await this.sendForAppointment(row.businessId, row.id));
      } catch (err) {
        logger.error("Reminder batch item failed", err, {
          appointmentId: row.id,
          businessId: row.businessId,
        });
        results.push({
          appointmentId: row.id,
          sent: false,
          skipped: "error",
          preview: err instanceof Error ? err.message : "Failed",
        });
      }
    }

    return { count: results.filter((r) => r.sent).length, results };
  }
}

export const reminderService = new ReminderService();
