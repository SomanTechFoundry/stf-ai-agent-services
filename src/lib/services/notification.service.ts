/**
 * NotificationService — SMS and email confirmations.
 *
 * Sends appointment confirmations to customers via:
 *   - Twilio SMS  (if TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER set)
 *   - Resend email (if RESEND_API_KEY, RESEND_FROM_EMAIL set)
 *
 * Design rules:
 * - ALL methods are fire-and-forget safe: they catch their own errors and
 *   log them rather than throwing. A notification failure NEVER breaks the
 *   booking flow.
 * - Notifications are skipped silently when env vars are missing (dev mode).
 * - SMS is only sent when customer.smsOptIn === true.
 * - Email is only sent when customer.email is not null.
 */

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { utcToLocal } from "@/lib/utils/date-time";
import { bookingConfirmationUrl } from "@/lib/utils/app-url";
import { buildAppointmentIcs } from "@/lib/utils/ics";

// ============================================================
// Lazy SDK initialisation — avoids import errors when keys are missing
// ============================================================

function getTwilioClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Twilio = require("twilio") as typeof import("twilio");
  return new Twilio.Twilio(sid, token);
}

function getResendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Resend } = require("resend") as typeof import("resend");
  return new Resend(key);
}

// ============================================================
// Public API
// ============================================================

export class NotificationService {
  /**
   * Send appointment confirmation to the customer via SMS and/or email.
   * Safe to call fire-and-forget — never throws.
   */
  async sendAppointmentConfirmation(
    appointmentId: string,
    businessId: string
  ): Promise<void> {
    try {
      const appt = await prisma.appointment.findFirst({
        where: { id: appointmentId, businessId },
        include: {
          service:  { select: { name: true, durationMinutes: true } },
          customer: { select: { name: true, phone: true, email: true, smsOptIn: true } },
          staff:    { select: { name: true } },
          business: {
            select: {
              name: true,
              phone: true,
              address: true,
              city: true,
              state: true,
              timezone: true,
              cancellationPolicyHours: true,
              email: true,
              logoUrl: true,
              smsFromNumber: true,
              smsFromName: true,
            },
          },
        },
      });

      if (!appt) {
        logger.warn("sendAppointmentConfirmation: appointment not found", { appointmentId });
        return;
      }

      const local = utcToLocal(appt.startTime, appt.business.timezone);
      const displayDate = formatDisplayDate(appt.startTime, appt.business.timezone);
      const displayTime = formatDisplayTime(local.time);

      const ctx = {
        appointmentId,
        businessId,
        customerId: appt.customerId,
      };

      // Fire SMS and email in parallel — neither waits on the other
      await Promise.allSettled([
        this.sendSMS(appt, displayDate, displayTime, ctx),
        this.sendEmail(appt, displayDate, displayTime, ctx),
      ]);
    } catch (err) {
      logger.error("sendAppointmentConfirmation: unexpected error", err, { appointmentId });
    }
  }

  // ============================================================
  // Private — SMS
  // ============================================================

  private async sendSMS(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appt: any,
    displayDate: string,
    displayTime: string,
    ctx: Record<string, string>
  ): Promise<void> {
    if (!appt.customer.smsOptIn || !appt.customer.phone) {
      logger.info("SMS skipped — no phone or smsOptIn is false", {
        ...ctx,
        hasPhone: !!appt.customer.phone,
        smsOptIn: !!appt.customer.smsOptIn,
      });
      return;
    }

    const fromNumber = resolveSmsFromNumber(appt.business);
    const client = getTwilioClient();
    if (!client || !fromNumber) {
      logger.info("SMS skipped — Twilio not configured", ctx);
      return;
    }

    const body = brandSms(
      appt.business,
      buildSMSBody({
        businessName: appt.business.name,
        serviceName:  appt.service.name,
        displayDate,
        displayTime,
        businessPhone: appt.business.phone ?? "",
      })
    );

    try {
      const msg = await client.messages.create({
        body,
        from: fromNumber,
        to:   appt.customer.phone,
      });
      logger.info("SMS confirmation sent", { ...ctx, sid: msg.sid });

      await prisma.appointment.update({
        where: { id: appt.id },
        data:  { confirmationSentAt: new Date() },
      });
    } catch (err) {
      logger.error("SMS send failed", err, ctx);
    }
  }

  // ============================================================
  // Private — Email
  // ============================================================

  private async sendEmail(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appt: any,
    displayDate: string,
    displayTime: string,
    ctx: Record<string, string>
  ): Promise<void> {
    if (!appt.customer.email) return;

    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const resend    = getResendClient();

    const html = buildEmailHTML({
      customerName:  appt.customer.name ?? "there",
      businessName:  appt.business.name,
      serviceName:   appt.service.name,
      staffName:     appt.staff?.name ?? null,
      displayDate,
      displayTime,
      durationMinutes: appt.service.durationMinutes,
      price:         Number(appt.price),
      currency:      appt.currency,
      businessAddress: [appt.business.address, appt.business.city, appt.business.state]
        .filter(Boolean).join(", "),
      businessPhone: appt.business.phone ?? "",
      cancellationHours: appt.business.cancellationPolicyHours,
      logoUrl: appt.business.logoUrl ?? null,
      confirmUrl: bookingConfirmationUrl(appt.id),
    });

    const location = [appt.business.address, appt.business.city, appt.business.state]
      .filter(Boolean)
      .join(", ");
    const ics = buildAppointmentIcs({
      appointmentId: appt.id,
      title: `${appt.service.name} at ${appt.business.name}`,
      description: `Your ${appt.service.name} appointment.`,
      location,
      start: appt.startTime,
      end: appt.endTime ?? new Date(appt.startTime.getTime() + (appt.service.durationMinutes ?? 60) * 60_000),
      organizerEmail: appt.business.email,
    });

    if (!resend || !fromEmail) {
      logger.info("Email preview (Resend not configured)", {
        ...ctx,
        fromName: appt.business.smsFromName || appt.business.name,
        subject: `Appointment confirmed — ${appt.service.name} at ${appt.business.name}`,
        icsPreview: ics.slice(0, 240),
        htmlLength: html.length,
      });
      return;
    }

    try {
      const fromHeader = formatFromHeader(fromEmail, appt.business.smsFromName || appt.business.name);
      const result = await resend.emails.send({
        from:    fromHeader,
        to:      [appt.customer.email],
        subject: `Appointment confirmed — ${appt.service.name} at ${appt.business.name}`,
        html,
        attachments: [
          { filename: "appointment.ics", content: Buffer.from(ics).toString("base64") },
        ],
      });
      logger.info("Email confirmation sent", { ...ctx, emailId: result.data?.id });
    } catch (err) {
      logger.error("Email send failed", err, ctx);
    }
  }

  /**
   * Day-before reminder. Returns true if SMS or email was handed to a provider.
   */
  async sendAppointmentReminder(
    appointmentId: string,
    businessId: string,
    extra: { preview: string; confirmUrl: string }
  ): Promise<boolean> {
    try {
      const appt = await this.loadAppointmentContext(appointmentId, businessId);
      if (!appt) {
        logger.info("Reminder skipped — appointment not found", { appointmentId });
        return false;
      }

      const ctx = { appointmentId, businessId, customerId: appt.customerId };
      const smsBody = `${extra.preview}${
        appt.business.phone ? `\nQuestions? Call ${appt.business.phone}` : ""
      }`;

      await Promise.allSettled([
        this.sendRawSMS(appt, smsBody, ctx),
        this.sendRawEmail(
          appt,
          `Reminder — ${appt.service.name} at ${appt.business.name}`,
          `<p>${escapeHtml(extra.preview).replace(/\n/g, "<br/>")}</p><p><a href="${escapeHtml(extra.confirmUrl)}">View your booking</a></p>`,
          ctx
        ),
      ]);

      if (!process.env.TWILIO_ACCOUNT_SID && !process.env.RESEND_API_KEY) {
        logger.info("Reminder preview (SMS/email not configured)", {
          ...ctx,
          preview: extra.preview,
        });
      }
      return true;
    } catch (err) {
      logger.error("sendAppointmentReminder failed", err, { appointmentId });
      return false;
    }
  }

  /**
   * Notify customer that an appointment was cancelled.
   */
  async sendAppointmentCancellation(
    appointmentId: string,
    businessId: string
  ): Promise<void> {
    try {
      const appt = await this.loadAppointmentContext(appointmentId, businessId);
      if (!appt) return;

      const displayDate = formatDisplayDate(appt.startTime, appt.business.timezone);
      const local = utcToLocal(appt.startTime, appt.business.timezone);
      const displayTime = formatDisplayTime(local.time);
      const ctx = { appointmentId, businessId, customerId: appt.customerId };

      const smsBody = [
        `Your appointment at ${appt.business.name} has been cancelled.`,
        `${appt.service.name} on ${displayDate} at ${displayTime}`,
        appt.business.phone ? `Questions? Call ${appt.business.phone}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await Promise.allSettled([
        this.sendRawSMS(appt, smsBody, ctx),
        this.sendRawEmail(
          appt,
          `Appointment cancelled — ${appt.business.name}`,
          `<p>Hi ${escapeHtml(appt.customer.name ?? "there")}, your ${escapeHtml(appt.service.name)} appointment on ${displayDate} at ${displayTime} has been cancelled.</p>`,
          ctx
        ),
      ]);
    } catch (err) {
      logger.error("sendAppointmentCancellation failed", err, { appointmentId });
    }
  }

  /**
   * Notify customer that an appointment was rescheduled.
   */
  async sendAppointmentReschedule(
    appointmentId: string,
    businessId: string
  ): Promise<void> {
    try {
      const appt = await this.loadAppointmentContext(appointmentId, businessId);
      if (!appt) return;

      const displayDate = formatDisplayDate(appt.startTime, appt.business.timezone);
      const local = utcToLocal(appt.startTime, appt.business.timezone);
      const displayTime = formatDisplayTime(local.time);
      const ctx = { appointmentId, businessId, customerId: appt.customerId };

      const smsBody = [
        `Your appointment at ${appt.business.name} has been rescheduled.`,
        `New time: ${displayDate} at ${displayTime}`,
        `${appt.service.name}`,
        appt.business.phone ? `Questions? Call ${appt.business.phone}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await Promise.allSettled([
        this.sendRawSMS(appt, smsBody, ctx),
        this.sendRawEmail(
          appt,
          `Appointment rescheduled — ${appt.business.name}`,
          `<p>Hi ${escapeHtml(appt.customer.name ?? "there")}, your ${escapeHtml(appt.service.name)} appointment has been moved to <strong>${displayDate} at ${displayTime}</strong>.</p>`,
          ctx
        ),
      ]);
    } catch (err) {
      logger.error("sendAppointmentReschedule failed", err, { appointmentId });
    }
  }

  /**
   * Alert staff when a conversation is escalated to a human.
   */
  async sendEscalationAlert(input: {
    businessId: string;
    conversationId: string;
    reason: string;
    urgency: string;
    summary?: string | null;
    customerPhone?: string | null;
  }): Promise<void> {
    try {
      const config = await prisma.aIConfiguration.findUnique({
        where: { businessId: input.businessId },
        include: {
          business: {
            select: {
              name: true,
              phone: true,
              email: true,
              smsFromNumber: true,
              smsFromName: true,
            },
          },
        },
      });
      const business = config?.business ?? (await prisma.business.findUnique({
        where: { id: input.businessId },
        select: { name: true, phone: true, email: true, smsFromNumber: true, smsFromName: true },
      }));
      if (!business) return;

      const owner = await prisma.user.findFirst({
        where: { businessId: input.businessId, role: "BUSINESS_OWNER", isActive: true },
        select: { email: true },
      });

      const businessName = business.name;
      const toPhone = config?.humanHandoffPhone || business.phone;
      const toEmail = config?.humanHandoffEmail || business.email || owner?.email;
      const dashboardUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/dashboard/conversations`;

      const body = [
        `[${input.urgency.toUpperCase()}] A customer needs you at ${businessName}`,
        `Reason: ${input.reason}`,
        input.summary ? `Summary: ${input.summary}` : "",
        input.customerPhone ? `Customer: ${input.customerPhone}` : "",
        `Open dashboard: ${dashboardUrl}`,
      ]
        .filter(Boolean)
        .join("\n");

      logger.info("Escalation alert prepared", {
        businessId: input.businessId,
        conversationId: input.conversationId,
        toPhone: toPhone ? "[set]" : null,
        toEmail: toEmail ? "[set]" : null,
        preview: body,
      });

      const fromNumber = resolveSmsFromNumber(business);
      const client = getTwilioClient();
      if (client && fromNumber && toPhone) {
        await client.messages.create({
          body: brandSms(business, body),
          from: fromNumber,
          to: toPhone,
        });
      }

      const resend = getResendClient();
      const fromEmail = process.env.RESEND_FROM_EMAIL;
      if (resend && fromEmail && toEmail) {
        await resend.emails.send({
          from: formatFromHeader(fromEmail, business.smsFromName || businessName),
          to: [toEmail],
          subject: `[Needs you] ${businessName} — ${input.reason}`,
          html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
        });
      }
    } catch (err) {
      logger.error("sendEscalationAlert failed", err, {
        businessId: input.businessId,
        conversationId: input.conversationId,
      });
    }
  }

  async sendTestSms(businessId: string, to: string): Promise<{ sent: boolean; preview: string }> {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, smsFromNumber: true, smsFromName: true, phone: true },
    });
    if (!business) {
      return { sent: false, preview: "Business not found." };
    }
    const preview = brandSms(
      business,
      `Test message from ${business.name}. If you received this, outbound SMS is working. Reply STOP to unsubscribe.`
    );
    const fromNumber = resolveSmsFromNumber(business);
    const client = getTwilioClient();
    if (!client || !fromNumber) {
      logger.info("Test SMS preview (Twilio not configured)", { businessId, preview });
      return { sent: false, preview };
    }
    await client.messages.create({ body: preview, from: fromNumber, to });
    return { sent: true, preview };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadAppointmentContext(appointmentId: string, businessId: string): Promise<any | null> {
    const appt = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      include: {
        service: { select: { name: true } },
        customer: { select: { name: true, phone: true, email: true, smsOptIn: true } },
        business: {
          select: {
            name: true,
            phone: true,
            timezone: true,
            smsFromNumber: true,
            smsFromName: true,
            logoUrl: true,
            email: true,
            address: true,
            city: true,
            state: true,
          },
        },
      },
    });
    if (!appt) {
      logger.warn("Notification: appointment not found", { appointmentId });
      return null;
    }
    return appt;
  }

  private async sendRawSMS(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appt: any,
    body: string,
    ctx: Record<string, string>
  ): Promise<void> {
    if (!appt.customer.smsOptIn || !appt.customer.phone) return;
    const fromNumber = resolveSmsFromNumber(appt.business);
    const client = getTwilioClient();
    if (!client || !fromNumber) return;
    try {
      await client.messages.create({
        body: brandSms(appt.business, body),
        from: fromNumber,
        to: appt.customer.phone,
      });
      logger.info("SMS notification sent", ctx);
    } catch (err) {
      logger.error("SMS notification failed", err, ctx);
    }
  }

  private async sendRawEmail(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appt: any,
    subject: string,
    htmlBody: string,
    ctx: Record<string, string>
  ): Promise<void> {
    if (!appt.customer.email) return;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const resend = getResendClient();
    if (!resend || !fromEmail) return;
    try {
      await resend.emails.send({
        from: formatFromHeader(fromEmail, appt.business.smsFromName || appt.business.name),
        to: [appt.customer.email],
        subject,
        html: `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px">${htmlBody}</body></html>`,
      });
      logger.info("Email notification sent", ctx);
    } catch (err) {
      logger.error("Email notification failed", err, ctx);
    }
  }
}

export const notificationService = new NotificationService();

// ============================================================
// Message builders
// ============================================================

interface SMSContext {
  businessName: string;
  serviceName: string;
  displayDate: string;
  displayTime: string;
  businessPhone: string;
}

function buildSMSBody(c: SMSContext): string {
  const lines = [
    `Booking confirmed! ${c.serviceName} at ${c.businessName}`,
    `Date: ${c.displayDate} at ${c.displayTime}`,
  ];
  if (c.businessPhone) lines.push(`Questions? Call ${c.businessPhone}`);
  return lines.join("\n");
}

interface EmailContext {
  customerName: string;
  businessName: string;
  serviceName: string;
  staffName: string | null;
  displayDate: string;
  displayTime: string;
  durationMinutes: number;
  price: number;
  currency: string;
  businessAddress: string;
  businessPhone: string;
  cancellationHours: number;
  logoUrl?: string | null;
  confirmUrl?: string;
}

function buildEmailHTML(c: EmailContext): string {
  const staffLine = c.staffName ? `<tr><td style="color:#6b7280;padding:4px 0">Stylist</td><td style="padding:4px 0;font-weight:600">${c.staffName}</td></tr>` : "";
  const price = c.currency === "USD" ? `$${c.price.toFixed(2)}` : `${c.price.toFixed(2)} ${c.currency}`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
    <!-- Header -->
    <div style="background:#0f172a;padding:24px 28px">
      ${c.logoUrl ? `<img src="${escapeHtml(c.logoUrl)}" alt="" width="120" style="max-height:40px;margin-bottom:12px;display:block" />` : ""}
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">Appointment Confirmed</h1>
      <p style="color:#cbd5e1;margin:4px 0 0;font-size:14px">${escapeHtml(c.businessName)}</p>
    </div>

    <!-- Body -->
    <div style="padding:28px">
      <p style="margin:0 0 20px;color:#374151;font-size:15px">
        Hi ${escapeHtml(c.customerName)}, your appointment is confirmed! Here are the details:
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
        <tr><td style="color:#6b7280;padding:4px 0">Service</td><td style="padding:4px 0;font-weight:600">${escapeHtml(c.serviceName)}</td></tr>
        ${staffLine}
        <tr><td style="color:#6b7280;padding:4px 0">Date</td><td style="padding:4px 0;font-weight:600">${c.displayDate}</td></tr>
        <tr><td style="color:#6b7280;padding:4px 0">Time</td><td style="padding:4px 0;font-weight:600">${c.displayTime}</td></tr>
        <tr><td style="color:#6b7280;padding:4px 0">Duration</td><td style="padding:4px 0;font-weight:600">${c.durationMinutes} minutes</td></tr>
        <tr><td style="color:#6b7280;padding:4px 0">Price</td><td style="padding:4px 0;font-weight:600">${price}</td></tr>
      </table>

      ${c.businessAddress ? `<p style="font-size:13px;color:#6b7280;margin:0 0 8px"><strong>Location:</strong> ${escapeHtml(c.businessAddress)}</p>` : ""}
      ${c.businessPhone   ? `<p style="font-size:13px;color:#6b7280;margin:0 0 20px"><strong>Phone:</strong> ${escapeHtml(c.businessPhone)}</p>` : ""}

      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:13px;color:#92400e;margin-bottom:20px">
        <strong>Cancellation policy:</strong> Please give us at least ${c.cancellationHours} hours notice if you need to cancel or reschedule.
      </div>

      ${c.confirmUrl ? `<p style="margin:0 0 16px"><a href="${escapeHtml(c.confirmUrl)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600">View booking</a></p>
      <p style="font-size:13px;color:#6b7280;margin:0 0 20px">This email includes an <strong>appointment.ics</strong> file — open it to add the visit to your calendar.</p>` : ""}

      <p style="font-size:13px;color:#9ca3af;margin:0">
        We look forward to seeing you! — The ${escapeHtml(c.businessName)} team
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ============================================================
// Date/time formatting helpers
// ============================================================

function formatDisplayDate(utcDate: Date, timezone: string): string {
  return utcDate.toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "long",
    month:   "long",
    day:     "numeric",
    year:    "numeric",
  });
}

function formatDisplayTime(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = mStr ?? "00";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function resolveSmsFromNumber(business?: { smsFromNumber?: string | null } | null): string | undefined {
  return business?.smsFromNumber || process.env.TWILIO_PHONE_NUMBER || undefined;
}

function brandSms(business: { name: string; smsFromName?: string | null }, body: string): string {
  const label = (business.smsFromName || business.name).trim();
  if (!label) return body;
  if (body.startsWith(`${label}:`) || body.startsWith(`[${label}]`)) return body;
  return `[${label}]\n${body}`;
}

function formatFromHeader(fromEmail: string, name?: string | null): string {
  const label = (name ?? "").replace(/[<>"]/g, "").trim();
  return label ? `${label} <${fromEmail}>` : fromEmail;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#039;");
}
