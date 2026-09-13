/**
 * AppointmentService — real booking engine.
 *
 * Responsibilities:
 * - Check availability: find open time slots respecting business hours,
 *   existing appointments, lead-time, and max-days-ahead constraints.
 * - Create appointments: idempotent, conflict-safe via a DB-level unique
 *   idempotency key and a serialised query window.
 * - CRUD: get, list (with filters), cancel, complete, reschedule.
 *
 * All operations are strictly scoped to businessId (tenant isolation).
 */

import { prisma } from "@/lib/db/prisma";
import { businessHoursService } from "./business-hours.service";
import { calendarSyncService, isBlockedByCalendar } from "./calendar-sync.service";
import {
  localToUtc,
  utcToLocal,
  getDayOfWeek,
  generateTimeSlots,
  intervalsOverlap,
  isDateInPast,
  isDateTooFarAhead,
  isSlotTooSoon,
} from "@/lib/utils/date-time";
import { NotFoundError, ValidationError, AppError, ErrorCode } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Appointment, AppointmentStatus } from "@prisma/client";

// ============================================================
// Public types
// ============================================================

export interface AvailabilitySlot {
  time: string;          // "HH:MM" in business timezone
  staffId: string;
  staffName: string;
}

export interface AvailabilityResult {
  date: string;          // "YYYY-MM-DD"
  timezone: string;
  service: { id: string; name: string; durationMinutes: number; price: number; currency: string };
  slots: AvailabilitySlot[];
  isOpen: boolean;
  message?: string;      // e.g. "We're closed on Sundays"
}

export interface CreateAppointmentInput {
  customerId: string;
  serviceId: string;
  staffId?: string;      // if omitted → auto-assigned to first available staff
  date: string;          // "YYYY-MM-DD" in business timezone
  time: string;          // "HH:MM" in business timezone
  notes?: string;
  conversationId?: string;
  idempotencyKey?: string;
}

export interface AppointmentListFilters {
  status?: AppointmentStatus;
  staffId?: string;
  customerId?: string;
  dateFrom?: string;   // "YYYY-MM-DD"
  dateTo?: string;
  limit?: number;
  offset?: number;
}

// How often to offer slots (minutes between slot start times)
const SLOT_INTERVAL_MINUTES = 30;

// ============================================================
// Service
// ============================================================

export class AppointmentService {

  // ----------------------------------------------------------
  // checkAvailability
  // ----------------------------------------------------------

  async checkAvailability(
    businessId: string,
    serviceId: string,
    date: string,         // "YYYY-MM-DD"
    preferredStaffId?: string
  ): Promise<AvailabilityResult> {
    // Load business (timezone + constraints)
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        timezone: true,
        bookingLeadTimeMinutes: true,
        bookingMaxDaysAhead: true,
      },
    });
    if (!business) throw new NotFoundError("Business", businessId);

    const { timezone, bookingLeadTimeMinutes, bookingMaxDaysAhead } = business;

    // Load service
    const service = await prisma.service.findFirst({
      where: { id: serviceId, businessId, isActive: true },
    });
    if (!service) throw new NotFoundError("Service", serviceId);

    const serviceInfo = {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
      price: Number(service.price),
      currency: service.currency,
    };

    // Date boundary checks
    if (isDateInPast(date, timezone)) {
      return { date, timezone, service: serviceInfo, slots: [], isOpen: false, message: "That date is in the past." };
    }
    if (isDateTooFarAhead(date, timezone, bookingMaxDaysAhead)) {
      return {
        date, timezone, service: serviceInfo, slots: [], isOpen: false,
        message: `We only accept bookings up to ${bookingMaxDaysAhead} days in advance.`,
      };
    }

    // Business hours for the requested day
    const dayOfWeek = getDayOfWeek(date, timezone);
    const hours = await businessHoursService.getHoursForDay(businessId, dayOfWeek);
    if (!hours || !hours.isOpen) {
      return { date, timezone, service: serviceInfo, slots: [], isOpen: false, message: `We are closed on ${dayOfWeek.charAt(0) + dayOfWeek.slice(1).toLowerCase()}s.` };
    }

    // Candidate time slots
    const candidateTimes = generateTimeSlots(
      hours.openTime,
      hours.closeTime,
      SLOT_INTERVAL_MINUTES,
      service.durationMinutes,
      service.bufferMinutes
    );

    // Determine which staff can perform this service
    const staffServices = await prisma.staffService.findMany({
      where: {
        serviceId: service.id,
        staff: { businessId, isActive: true, acceptsBookings: true },
        ...(preferredStaffId ? { staffId: preferredStaffId } : {}),
      },
      include: { staff: { select: { id: true, name: true } } },
    });

    if (staffServices.length === 0) {
      return {
        date, timezone, service: serviceInfo, slots: [], isOpen: true,
        message: preferredStaffId
          ? "The requested staff member is not available for that service."
          : "No staff are currently available for that service.",
      };
    }

    // Load all existing appointments for these staff members on that day
    const dayStartUtc = localToUtc(date, "00:00", timezone);
    const dayEndUtc   = localToUtc(date, "23:59", timezone);

    const staffIds = staffServices.map((ss) => ss.staffId);
    const existingAppointments = await prisma.appointment.findMany({
      where: {
        businessId,
        staffId: { in: staffIds },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        startTime: { lt: dayEndUtc },
        endTime:   { gt: dayStartUtc },
      },
      select: { staffId: true, startTime: true, endTime: true },
    });

    const calendarBusy = await calendarSyncService.listBusy(businessId, dayStartUtc, dayEndUtc);

    // Build per-staff appointment lists for O(n) conflict detection
    const bookedByStaff = new Map<string, Array<{ start: Date; end: Date }>>();
    for (const appt of existingAppointments) {
      if (!appt.staffId) continue;
      const list = bookedByStaff.get(appt.staffId) ?? [];
      list.push({ start: appt.startTime, end: appt.endTime });
      bookedByStaff.set(appt.staffId, list);
    }

    // For each candidate slot, find at least one available staff member
    const availableSlots: AvailabilitySlot[] = [];

    for (const slotTime of candidateTimes) {
      // Skip slots already past the lead-time window
      if (isSlotTooSoon(date, slotTime, timezone, bookingLeadTimeMinutes)) continue;

      const slotStart = localToUtc(date, slotTime, timezone);
      const slotEnd   = new Date(slotStart.getTime() + service.durationMinutes * 60 * 1000);

      if (isBlockedByCalendar(slotStart, slotEnd, calendarBusy)) continue;

      for (const ss of staffServices) {
        const booked = bookedByStaff.get(ss.staffId) ?? [];
        const hasConflict = booked.some((b) => intervalsOverlap(slotStart, slotEnd, b.start, b.end));

        if (!hasConflict) {
          availableSlots.push({
            time: slotTime,
            staffId: ss.staffId,
            staffName: ss.staff.name,
          });
          break; // one available staff per slot is enough to offer it
        }
      }
    }

    logger.info("Availability checked", {
      businessId, serviceId, date,
      candidateCount: candidateTimes.length,
      availableCount: availableSlots.length,
    });

    return {
      date,
      timezone,
      service: serviceInfo,
      slots: availableSlots,
      isOpen: true,
      message: availableSlots.length === 0 ? "No available slots on that date. Please try another day." : undefined,
    };
  }

  // ----------------------------------------------------------
  // createAppointment
  // ----------------------------------------------------------

  async createAppointment(
    businessId: string,
    input: CreateAppointmentInput
  ): Promise<Appointment> {
    // Idempotency: if the same key is used twice, return the existing appointment
    if (input.idempotencyKey) {
      const existing = await prisma.appointment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        logger.info("Idempotent appointment returned", { businessId, appointmentId: existing.id });
        return existing;
      }
    }

    // Load and validate all entities (tenant-scoped)
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true, bookingLeadTimeMinutes: true },
    });
    if (!business) throw new NotFoundError("Business", businessId);

    const service = await prisma.service.findFirst({
      where: { id: input.serviceId, businessId, isActive: true },
    });
    if (!service) throw new NotFoundError("Service", input.serviceId);

    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, businessId },
    });
    if (!customer) throw new NotFoundError("Customer", input.customerId);

    // Resolve staff: use requested staff, or auto-assign
    let resolvedStaffId: string | undefined = input.staffId;

    if (resolvedStaffId) {
      const staff = await prisma.staff.findFirst({
        where: { id: resolvedStaffId, businessId, isActive: true, acceptsBookings: true },
        include: { services: { where: { serviceId: input.serviceId } } },
      });
      if (!staff) throw new NotFoundError("Staff", resolvedStaffId);
      if (staff.services.length === 0) {
        throw new ValidationError(
          `${staff.name} does not perform that service`,
          { staffId: `${staff.name} does not perform that service` }
        );
      }
    } else {
      // Auto-assign: first available staff for this service
      const ss = await prisma.staffService.findFirst({
        where: {
          serviceId: input.serviceId,
          staff: { businessId, isActive: true, acceptsBookings: true },
        },
        include: { staff: true },
      });
      resolvedStaffId = ss?.staffId;
    }

    // Calculate slot times in UTC
    const { timezone } = business;
    const startTime = localToUtc(input.date, input.time, timezone);
    const endTime   = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);

    // Lead-time check
    if (isSlotTooSoon(input.date, input.time, timezone, business.bookingLeadTimeMinutes)) {
      throw new ValidationError(
        `Appointments require at least ${business.bookingLeadTimeMinutes} minutes notice.`,
        {
          time: `Appointments require at least ${business.bookingLeadTimeMinutes} minutes notice.`,
        }
      );
    }

    await calendarSyncService.assertFree(businessId, startTime, endTime);

    // Conflict check (serialised using Prisma transaction)
    const appointment = await prisma.$transaction(async (tx) => {
      if (resolvedStaffId) {
        const conflict = await tx.appointment.findFirst({
          where: {
            staffId: resolvedStaffId,
            status: { notIn: ["CANCELLED", "NO_SHOW"] },
            startTime: { lt: endTime },
            endTime:   { gt: startTime },
          },
        });
        if (conflict) {
          throw new AppError(
            ErrorCode.APPOINTMENT_CONFLICT,
            "That time slot is no longer available. Please choose another time.",
            409
          );
        }
      }

      return tx.appointment.create({
        data: {
          businessId,
          customerId: input.customerId,
          serviceId:  input.serviceId,
          staffId:    resolvedStaffId ?? null,
          conversationId: input.conversationId ?? null,
          status:    "PENDING",
          startTime,
          endTime,
          timezone,
          price:     service.price,
          currency:  service.currency,
          notes:     input.notes ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
    });

    logger.info("Appointment created", {
      businessId,
      appointmentId: appointment.id,
      serviceId: input.serviceId,
      staffId: resolvedStaffId,
      startTime: startTime.toISOString(),
    });

    void calendarSyncService.syncAppointment(businessId, appointment.id, "upsert");
    return appointment;
  }

  // ----------------------------------------------------------
  // Read operations
  // ----------------------------------------------------------

  async getById(businessId: string, appointmentId: string): Promise<Appointment & {
    service: { name: string; durationMinutes: number };
    customer: { name: string | null; phone: string | null; email: string | null };
    staff: { name: string } | null;
  }> {
    const appt = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      include: {
        service: { select: { name: true, durationMinutes: true } },
        customer: { select: { name: true, phone: true, email: true } },
        staff: { select: { name: true } },
      },
    });
    if (!appt) throw new NotFoundError("Appointment", appointmentId);
    return appt;
  }

  async list(businessId: string, filters: AppointmentListFilters = {}) {
    const { status, staffId, customerId, dateFrom, dateTo, limit = 50, offset = 0 } = filters;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });

    const timezone = business?.timezone ?? "UTC";

    const where = {
      businessId,
      ...(status    ? { status }    : {}),
      ...(staffId   ? { staffId }   : {}),
      ...(customerId ? { customerId } : {}),
      ...(dateFrom || dateTo ? {
        startTime: {
          ...(dateFrom ? { gte: localToUtc(dateFrom, "00:00", timezone) } : {}),
          ...(dateTo   ? { lte: localToUtc(dateTo,   "23:59", timezone) } : {}),
        },
      } : {}),
    };

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        include: {
          service:  { select: { name: true, durationMinutes: true } },
          customer: { select: { name: true, phone: true } },
          staff:    { select: { name: true } },
        },
        orderBy: { startTime: "asc" },
        take: limit,
        skip: offset,
      }),
      prisma.appointment.count({ where }),
    ]);

    return { appointments, total, limit, offset };
  }

  // ----------------------------------------------------------
  // Status transitions
  // ----------------------------------------------------------

  async cancel(
    businessId: string,
    appointmentId: string,
    reason?: string,
    options?: { force?: boolean }
  ): Promise<Appointment> {
    const appt = await this.getById(businessId, appointmentId);
    if (appt.status === "CANCELLED") return appt;
    if (appt.status === "COMPLETED" || appt.status === "NO_SHOW") {
      throw new ValidationError(`Cannot cancel a ${appt.status.toLowerCase()} appointment.`, {
        status: `Cannot cancel a ${appt.status.toLowerCase()} appointment.`,
      });
    }

    if (!options?.force) {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { cancellationPolicyHours: true },
      });
      const required = business?.cancellationPolicyHours ?? 24;
      const hoursLeft = (appt.startTime.getTime() - Date.now()) / 3_600_000;
      if (hoursLeft < required) {
        throw new ValidationError(
          `Cancellations need at least ${required} hours notice. This visit is in ${Math.max(0, Math.round(hoursLeft))} hour(s). Please call the salon.`,
          {
            policy: "too_late",
            hoursRequired: String(required),
            hoursRemaining: String(Math.max(0, Math.round(hoursLeft))),
          }
        );
      }
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "CANCELLED",
        cancellationReason: reason ?? null,
        cancelledAt: new Date(),
      },
    });

    logger.info("Appointment cancelled", { businessId, appointmentId, reason, forced: Boolean(options?.force) });
    void calendarSyncService.syncAppointment(businessId, appointmentId, "delete");
    return updated;
  }

  async markNoShow(businessId: string, appointmentId: string): Promise<Appointment> {
    const appt = await this.getById(businessId, appointmentId);
    if (appt.status === "NO_SHOW") return appt;
    if (["CANCELLED", "COMPLETED"].includes(appt.status)) {
      throw new ValidationError(`Cannot mark a ${appt.status.toLowerCase()} appointment as no-show.`, {
        status: `Cannot mark a ${appt.status.toLowerCase()} appointment as no-show.`,
      });
    }
    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "NO_SHOW" },
    });
    logger.info("Appointment marked no-show", { businessId, appointmentId });
    return updated;
  }

  async confirm(businessId: string, appointmentId: string): Promise<Appointment> {
    await this.getById(businessId, appointmentId);
    return prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "CONFIRMED" },
    });
  }

  async complete(businessId: string, appointmentId: string): Promise<Appointment> {
    await this.getById(businessId, appointmentId);
    return prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "COMPLETED" },
    });
  }

  async reschedule(
    businessId: string,
    appointmentId: string,
    newDate: string,
    newTime: string
  ): Promise<Appointment> {
    const appt = await this.getById(businessId, appointmentId);
    if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appt.status)) {
      throw new ValidationError(
        `Cannot reschedule a ${appt.status.toLowerCase()} appointment.`,
        { status: `Cannot reschedule a ${appt.status.toLowerCase()} appointment.` }
      );
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true, bookingLeadTimeMinutes: true },
    });
    if (!business) throw new NotFoundError("Business", businessId);

    const newStartTime = localToUtc(newDate, newTime, business.timezone);
    const newEndTime   = new Date(newStartTime.getTime() + appt.service.durationMinutes * 60 * 1000);

    const utcLocal = utcToLocal(newStartTime, business.timezone);

    if (isSlotTooSoon(utcLocal.date, utcLocal.time, business.timezone, business.bookingLeadTimeMinutes)) {
      throw new ValidationError("Not enough lead time for rescheduled appointment.", {
        time: "Not enough lead time for rescheduled appointment.",
      });
    }

    await calendarSyncService.assertFree(businessId, newStartTime, newEndTime, {
      start: appt.startTime,
      end: appt.endTime,
    });

    const updated = await prisma.$transaction(async (tx) => {
      if (appt.staffId) {
        const conflict = await tx.appointment.findFirst({
          where: {
            id: { not: appointmentId },
            staffId: appt.staffId,
            status: { notIn: ["CANCELLED", "NO_SHOW"] },
            startTime: { lt: newEndTime },
            endTime:   { gt: newStartTime },
          },
        });
        if (conflict) {
          throw new AppError(
            ErrorCode.APPOINTMENT_CONFLICT,
            "That time slot is not available. Please choose another time.",
            409
          );
        }
      }

      return tx.appointment.update({
        where: { id: appointmentId },
        data: { startTime: newStartTime, endTime: newEndTime, status: "RESCHEDULED" },
      });
    });

    void calendarSyncService.syncAppointment(businessId, appointmentId, "upsert");
    return updated;
  }

  // Helper: get a local display string for an appointment's start time
  async getLocalStartTime(
    appointmentId: string,
    businessId: string
  ): Promise<{ date: string; time: string }> {
    const appt = await this.getById(businessId, appointmentId);
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    return utcToLocal(appt.startTime, business?.timezone ?? "UTC");
  }
}

export const appointmentService = new AppointmentService();
