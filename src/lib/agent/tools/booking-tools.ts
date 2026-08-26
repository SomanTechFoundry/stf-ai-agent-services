/**
 * Booking tools — real appointment availability and creation.
 *
 * Phase 4: Full implementations backed by AppointmentService.
 * - checkAvailability: queries real business hours + existing appointments
 * - createAppointment: creates DB record with conflict detection and idempotency
 */

import { z } from "zod";
import { conversationService } from "@/lib/services/conversation.service";
import { serviceService } from "@/lib/services/service.service";
import { staffService } from "@/lib/services/staff.service";
import { appointmentService } from "@/lib/services/appointment.service";
import { notificationService } from "@/lib/services/notification.service";
import { businessService } from "@/lib/services/business.service";
import { resolveRelativeDate, utcToLocal } from "@/lib/utils/date-time";
import { logger } from "@/lib/logger";
import type { AgentTool, ToolContext } from "./types";
import { toolSuccess, toolError } from "./types";

// ============================================================
// Shared helper — resolve a date that may still be a relative
// phrase ("today", "next friday") if the AI didn't convert it.
// The system prompt instructs the AI to always pass ISO dates,
// but this is a safety net so booking never hard-fails on it.
// ============================================================

async function resolveDateOrError(
  businessId: string,
  rawDate: string
): Promise<{ date: string } | { error: string }> {
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return { date: rawDate };

  try {
    const business = await businessService.getById(businessId);
    const resolved = resolveRelativeDate(rawDate, business.timezone);

    if (!resolved) {
      return {
        error: `I couldn't understand the date "${rawDate}". Could you give me a specific day, like "tomorrow" or a date such as August 25?`,
      };
    }
    return { date: resolved };
  } catch (err) {
    logger.error("resolveDateOrError failed", err, { businessId, rawDate });
    return {
      error: `I couldn't understand the date "${rawDate}". Could you give me a specific day, like "tomorrow" or a date such as August 25?`,
    };
  }
}

// ============================================================
// checkAvailability
// ============================================================

const checkAvailabilitySchema = z.object({
  serviceName: z.string().min(1),
  date: z.string().min(1, "Date is required"),
  staffName: z.string().optional(),
});

export const checkAvailabilityTool: AgentTool = {
  definition: {
    name: "checkAvailability",
    description:
      "Check available appointment slots for a service on a specific date. " +
      "Call this when the customer has chosen a service and a date, and wants to know " +
      "what times are available. Returns a list of available time slots.",
    parameters: {
      type: "object",
      properties: {
        serviceName: {
          type: "string",
          description: "The name of the service to book",
        },
        date: {
          type: "string",
          description:
            "The requested date in YYYY-MM-DD format. Always resolve relative terms " +
            "like 'today', 'tomorrow', or 'next Friday' to an ISO date using the date " +
            "reference table in your system prompt before calling this tool.",
        },
        staffName: {
          type: "string",
          description: "Optional: preferred staff member name",
        },
      },
      required: ["serviceName", "date"],
    },
  },

  async execute(args: unknown, context: ToolContext) {
    const parsed = checkAvailabilitySchema.safeParse(args ?? {});
    if (!parsed.success) {
      return toolError(
        "To check availability I need the service name and a date (e.g. \"tomorrow\" or 2025-01-15)."
      );
    }

    const { serviceName, date: rawDate, staffName } = parsed.data;

    const dateResult = await resolveDateOrError(context.businessId, rawDate);
    if ("error" in dateResult) return toolError(dateResult.error);
    const date = dateResult.date;

    try {
      // Resolve service
      const service = await serviceService.findByName(context.businessId, serviceName);
      if (!service) {
        return toolError(
          `I couldn't find a service called "${serviceName}". Please confirm the service name.`
        );
      }

      // Resolve preferred staff (optional)
      let preferredStaffId: string | undefined;
      if (staffName) {
        const allStaff = await staffService.getByService(context.businessId, service.id);
        const matched = allStaff.find(
          (s) => s.name.toLowerCase() === staffName.toLowerCase()
        );
        if (!matched) {
          return toolError(
            `I couldn't find a staff member named "${staffName}" for that service. Would you like to see who's available?`
          );
        }
        preferredStaffId = matched.id;
      }

      // Real availability check
      const availability = await appointmentService.checkAvailability(
        context.businessId,
        service.id,
        date,
        preferredStaffId
      );

      // Save booking progress to conversation state
      await conversationService.updateAgentState(context.conversationId, {
        requestedService: serviceName,
        requestedServiceId: service.id,
        requestedDate: date,
        requestedStaffId: preferredStaffId,
        bookingStatus: "checking_availability",
      });

      logger.info("checkAvailability executed", {
        businessId: context.businessId,
        conversationId: context.conversationId,
        serviceName,
        date,
        slotsFound: availability.slots.length,
      });

      if (!availability.isOpen) {
        return toolSuccess({
          available: false,
          message: availability.message ?? "We are not available on that date.",
        });
      }

      if (availability.slots.length === 0) {
        return toolSuccess({
          available: false,
          service: availability.service.name,
          date,
          message: availability.message ?? "No available slots on that date. Please try another day.",
        });
      }

      // Deduplicate slots to just times (multiple staff could offer the same time)
      const uniqueTimes = [...new Set(availability.slots.map((s) => s.time))];

      return toolSuccess({
        available: true,
        service: availability.service.name,
        date,
        durationMinutes: availability.service.durationMinutes,
        price: availability.service.price,
        currency: availability.service.currency,
        timezone: availability.timezone,
        availableSlots: uniqueTimes,
      });
    } catch (err) {
      logger.error("checkAvailability tool error", err, { businessId: context.businessId });
      return toolError("Unable to check availability at this time. Please call us directly.");
    }
  },
};

// ============================================================
// createAppointment
// ============================================================

const createAppointmentSchema = z.object({
  serviceName: z.string().min(1),
  date: z.string().min(1, "Date is required"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM in 24-hour format"),
  customerId: z.string().min(1),
  staffName: z.string().optional(),
  notes: z.string().optional(),
});

export const createAppointmentTool: AgentTool = {
  definition: {
    name: "createAppointment",
    description:
      "Book an appointment after the customer has confirmed the service, date, time, and their contact information. " +
      "Only call this after: (1) customer identity is confirmed via findOrCreateCustomer, " +
      "(2) availability has been checked via checkAvailability, " +
      "(3) the customer has explicitly confirmed all booking details.",
    parameters: {
      type: "object",
      properties: {
        serviceName: {
          type: "string",
          description: "The service to book",
        },
        date: {
          type: "string",
          description:
            "Date in YYYY-MM-DD format (in business local time). Always resolve relative " +
            "terms like 'today' or 'tomorrow' to an ISO date first, using the date reference " +
            "table in your system prompt.",
        },
        time: {
          type: "string",
          description: "Time in HH:MM 24-hour format (e.g. '14:00') in business local time",
        },
        customerId: {
          type: "string",
          description: "The customer ID returned by findOrCreateCustomer",
        },
        staffName: {
          type: "string",
          description: "Optional: preferred staff member name",
        },
        notes: {
          type: "string",
          description: "Optional: any special requests or notes for the appointment",
        },
      },
      required: ["serviceName", "date", "time", "customerId"],
    },
  },

  async execute(args: unknown, context: ToolContext) {
    const parsed = createAppointmentSchema.safeParse(args ?? {});
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      return toolError(
        `To book the appointment I still need: ${fields}. Please collect this information from the customer.`
      );
    }

    const { serviceName, date: rawDate, time, customerId, staffName, notes } = parsed.data;

    const dateResult = await resolveDateOrError(context.businessId, rawDate);
    if ("error" in dateResult) return toolError(dateResult.error);
    const date = dateResult.date;

    try {
      // Resolve service
      const service = await serviceService.findByName(context.businessId, serviceName);
      if (!service) {
        return toolError(`Service "${serviceName}" not found. Please confirm the service name.`);
      }

      // Resolve preferred staff (optional)
      let staffId: string | undefined;
      if (staffName) {
        const allStaff = await staffService.getByService(context.businessId, service.id);
        const matched = allStaff.find(
          (s) => s.name.toLowerCase() === staffName.toLowerCase()
        );
        if (matched) staffId = matched.id;
      }

      // Generate idempotency key so retries don't create duplicates
      const idempotencyKey = `conv:${context.conversationId}:${service.id}:${date}:${time}`;

      // Create the real appointment
      const appointment = await appointmentService.createAppointment(
        context.businessId,
        {
          customerId,
          serviceId: service.id,
          staffId,
          date,
          time,
          notes,
          conversationId: context.conversationId,
          idempotencyKey,
        }
      );

      // Update conversation state
      await conversationService.updateAgentState(context.conversationId, {
        bookingStatus: "booked",
        requestedService: serviceName,
        requestedServiceId: service.id,
        requestedDate: date,
        requestedTime: time,
        customerId,
        appointmentId: appointment.id,
      });

      logger.info("createAppointment executed", {
        businessId: context.businessId,
        conversationId: context.conversationId,
        appointmentId: appointment.id,
        serviceName,
        date,
        time,
        customerId,
      });

      // Fire-and-forget: send SMS + email confirmation.
      // Never awaited so a notification failure never blocks the booking response.
      void notificationService.sendAppointmentConfirmation(
        appointment.id,
        context.businessId
      );

      return toolSuccess({
        appointmentId: appointment.id,
        service: service.name,
        date,
        time,
        durationMinutes: service.durationMinutes,
        price: Number(service.price),
        currency: service.currency,
        notes: notes ?? null,
        status: appointment.status,
        message: "Appointment booked successfully!",
      });
    } catch (err) {
      // Surface slot-conflict errors to the AI so it can ask for another time
      if (err instanceof Error && err.message.includes("no longer available")) {
        return toolError(err.message);
      }
      logger.error("createAppointment tool error", err, { businessId: context.businessId });
      return toolError(
        "I was unable to complete the booking at this time. Please call us directly to book your appointment."
      );
    }
  },
};

// ============================================================
// listCustomerAppointments
// ============================================================

const listAppointmentsSchema = z.object({
  customerId: z.string().min(1),
  includePast: z.boolean().optional(),
});

export const listCustomerAppointmentsTool: AgentTool = {
  definition: {
    name: "listCustomerAppointments",
    description:
      "List a customer's upcoming (or all) appointments. " +
      "Call this when a customer asks about their bookings, wants to cancel, or reschedule. " +
      "Requires the customerId from findOrCreateCustomer.",
    parameters: {
      type: "object",
      properties: {
        customerId: {
          type: "string",
          description: "Customer ID from findOrCreateCustomer",
        },
        includePast: {
          type: "boolean",
          description: "Include past/completed appointments (default: false)",
        },
      },
      required: ["customerId"],
    },
  },

  async execute(args: unknown, context: ToolContext) {
    const parsed = listAppointmentsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return toolError("I need the customer ID to look up their appointments.");
    }

    const { customerId, includePast } = parsed.data;

    try {
      const business = await businessService.getById(context.businessId);
      const today = new Date().toISOString().slice(0, 10);

      const result = await appointmentService.list(context.businessId, {
        customerId,
        dateFrom: includePast ? undefined : today,
        limit: 20,
      });

      const appointments = result.appointments
        .filter((a) => includePast || !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(a.status))
        .map((a) => {
          const local = utcToLocal(a.startTime, business.timezone);
          return {
            appointmentId: a.id,
            status: a.status,
            service: a.service.name,
            staff: a.staff?.name ?? null,
            date: local.date,
            time: local.time,
          };
        });

      return toolSuccess({
        appointments,
        count: appointments.length,
        message:
          appointments.length === 0
            ? "No upcoming appointments found for this customer."
            : undefined,
      });
    } catch (err) {
      logger.error("listCustomerAppointments tool error", err, {
        businessId: context.businessId,
      });
      return toolError("Unable to look up appointments right now.");
    }
  },
};

// ============================================================
// cancelAppointment
// ============================================================

const cancelAppointmentSchema = z.object({
  appointmentId: z.string().min(1),
  reason: z.string().optional(),
});

export const cancelAppointmentTool: AgentTool = {
  definition: {
    name: "cancelAppointment",
    description:
      "Cancel an existing appointment. " +
      "Call listCustomerAppointments first to find the appointmentId. " +
      "Confirm with the customer before cancelling.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: {
          type: "string",
          description: "The appointment ID to cancel",
        },
        reason: {
          type: "string",
          description: "Optional reason for cancellation",
        },
      },
      required: ["appointmentId"],
    },
  },

  async execute(args: unknown, context: ToolContext) {
    const parsed = cancelAppointmentSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return toolError("I need the appointment ID to cancel.");
    }

    const { appointmentId, reason } = parsed.data;

    try {
      const updated = await appointmentService.cancel(
        context.businessId,
        appointmentId,
        reason
      );

      await conversationService.updateAgentState(context.conversationId, {
        bookingStatus: "cancelled",
        appointmentId,
      });

      void notificationService.sendAppointmentCancellation(appointmentId, context.businessId);

      const business = await businessService.getById(context.businessId);
      const local = utcToLocal(updated.startTime, business.timezone);

      return toolSuccess({
        appointmentId: updated.id,
        status: updated.status,
        date: local.date,
        time: local.time,
        message: "Appointment cancelled successfully.",
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("Cannot cancel")) {
        return toolError(err.message);
      }
      logger.error("cancelAppointment tool error", err, {
        businessId: context.businessId,
      });
      return toolError("Unable to cancel the appointment. Please call us directly.");
    }
  },
};

// ============================================================
// rescheduleAppointment
// ============================================================

const rescheduleAppointmentSchema = z.object({
  appointmentId: z.string().min(1),
  date: z.string().min(1),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

export const rescheduleAppointmentTool: AgentTool = {
  definition: {
    name: "rescheduleAppointment",
    description:
      "Reschedule an existing appointment to a new date and time. " +
      "Call checkAvailability for the new date first, then confirm with the customer.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: {
          type: "string",
          description: "The appointment ID to reschedule",
        },
        date: {
          type: "string",
          description: "New date in YYYY-MM-DD format (business local time)",
        },
        time: {
          type: "string",
          description: "New time in HH:MM 24-hour format",
        },
      },
      required: ["appointmentId", "date", "time"],
    },
  },

  async execute(args: unknown, context: ToolContext) {
    const parsed = rescheduleAppointmentSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return toolError("I need the appointment ID, new date, and new time to reschedule.");
    }

    const { appointmentId, date: rawDate, time } = parsed.data;

    const dateResult = await resolveDateOrError(context.businessId, rawDate);
    if ("error" in dateResult) return toolError(dateResult.error);
    const date = dateResult.date;

    try {
      const updated = await appointmentService.reschedule(
        context.businessId,
        appointmentId,
        date,
        time
      );

      void notificationService.sendAppointmentReschedule(appointmentId, context.businessId);

      const business = await businessService.getById(context.businessId);
      const local = utcToLocal(updated.startTime, business.timezone);

      return toolSuccess({
        appointmentId: updated.id,
        status: updated.status,
        date: local.date,
        time: local.time,
        message: "Appointment rescheduled successfully.",
      });
    } catch (err) {
      if (err instanceof Error && (err.message.includes("not available") || err.message.includes("Cannot reschedule"))) {
        return toolError(err.message);
      }
      logger.error("rescheduleAppointment tool error", err, {
        businessId: context.businessId,
      });
      return toolError("Unable to reschedule. Please try another time or call us directly.");
    }
  },
};
