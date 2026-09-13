/**
 * BusinessHoursService — manage and query weekly business schedules.
 * All queries are scoped to businessId.
 */

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import type { SetBusinessHoursInput, BusinessHoursEntry } from "@/lib/validation";
import type { BusinessHours, DayOfWeek } from "@prisma/client";
import { getDayOfWeek, utcToLocal } from "@/lib/utils/date-time";

export { DayOfWeek };

export class BusinessHoursService {
  /**
   * Replace the full weekly schedule for a business.
   * Runs in a transaction to prevent partial updates.
   */
  async setHours(
    businessId: string,
    input: SetBusinessHoursInput
  ): Promise<BusinessHours[]> {
    const result = await prisma.$transaction(async (tx) => {
      await tx.businessHours.deleteMany({ where: { businessId } });

      return tx.businessHours.createMany({
        data: input.hours.map((h) => ({
          businessId,
          dayOfWeek: h.dayOfWeek,
          isOpen: h.isOpen,
          openTime: h.openTime,
          closeTime: h.closeTime,
        })),
      });
    });

    logger.info("Business hours updated", {
      businessId,
      daysSet: result.count,
    });

    return this.getHours(businessId);
  }

  async getHours(businessId: string): Promise<BusinessHours[]> {
    return prisma.businessHours.findMany({
      where: { businessId },
      orderBy: { dayOfWeek: "asc" },
    });
  }

  /** True if the business is open at this instant in its timezone. */
  async isOpenAt(businessId: string, timezone: string, at = new Date()): Promise<{
    isOpen: boolean;
    hours: BusinessHours | null;
  }> {
    const local = utcToLocal(at, timezone);
    const day = getDayOfWeek(local.date, timezone);
    const hours = await this.getHoursForDay(businessId, day);
    if (!hours || !hours.isOpen) return { isOpen: false, hours };
    const open = local.time >= hours.openTime && local.time < hours.closeTime;
    return { isOpen: open, hours };
  }

  async getHoursForDay(
    businessId: string,
    dayOfWeek: DayOfWeek
  ): Promise<BusinessHours | null> {
    return prisma.businessHours.findUnique({
      where: { businessId_dayOfWeek: { businessId, dayOfWeek } },
    });
  }

  /**
   * Return the human-readable schedule as a string.
   * Used to inject business hours into the AI agent's system prompt.
   */
  async getFormattedSchedule(businessId: string): Promise<string> {
    const hours = await this.getHours(businessId);

    if (hours.length === 0) return "Hours not configured";

    const order: DayOfWeek[] = [
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ];

    const sorted = order
      .map((day) => hours.find((h) => h.dayOfWeek === day))
      .filter(Boolean) as BusinessHours[];

    return sorted
      .map((h) => {
        const day = h.dayOfWeek.charAt(0) + h.dayOfWeek.slice(1).toLowerCase();
        if (!h.isOpen) return `${day}: Closed`;
        return `${day}: ${formatTime(h.openTime)} – ${formatTime(h.closeTime)}`;
      })
      .join("\n");
  }
}

function formatTime(time24: string): string {
  const [hourStr, minute] = time24.split(":");
  const hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${ampm}`;
}

export const businessHoursService = new BusinessHoursService();
