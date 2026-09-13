/**
 * Inbound SMS: STOP/START/HELP, after-hours notice, then the AI agent.
 */

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { runAgent } from "@/lib/agent";
import { classifySmsCommand } from "@/lib/sms/commands";
import { businessHoursService } from "./business-hours.service";

export async function resolveBusinessForSms(toNumber: string) {
  const bySms = await prisma.business.findFirst({
    where: { smsFromNumber: toNumber, status: { in: ["ACTIVE", "TRIAL"] } },
    select: {
      id: true,
      name: true,
      phone: true,
      timezone: true,
      smsFromName: true,
    },
  });
  if (bySms) return bySms;

  const byPhone = await prisma.business.findFirst({
    where: { phone: toNumber, status: { in: ["ACTIVE", "TRIAL"] } },
    select: {
      id: true,
      name: true,
      phone: true,
      timezone: true,
      smsFromName: true,
    },
  });
  if (byPhone) return byPhone;

  const slug = process.env.TWILIO_BUSINESS_SLUG ?? "sunset-salon";
  return prisma.business.findFirst({
    where: { slug, status: { in: ["ACTIVE", "TRIAL"] } },
    select: {
      id: true,
      name: true,
      phone: true,
      timezone: true,
      smsFromName: true,
    },
  });
}

async function upsertSmsCustomer(businessId: string, phone: string, smsOptIn: boolean) {
  const existing = await prisma.customer.findFirst({
    where: { businessId, phone },
  });
  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: { smsOptIn, smsOptInAt: smsOptIn ? new Date() : existing.smsOptInAt },
    });
  }
  return prisma.customer.create({
    data: { businessId, phone, smsOptIn, smsOptInAt: smsOptIn ? new Date() : null },
  });
}

export async function handleInboundSms(input: {
  from: string;
  to: string;
  body: string;
  forceClosed?: boolean;
}): Promise<{ reply: string; command?: string; afterHours?: boolean }> {
  const business = await resolveBusinessForSms(input.to);
  if (!business) {
    return { reply: "This number is not configured. Please contact the business directly." };
  }

  const command = classifySmsCommand(input.body);
  const brand = business.smsFromName || business.name;

  if (command === "stop") {
    await upsertSmsCustomer(business.id, input.from, false);
    logger.event("sms_opt_out", "Customer opted out of SMS", {
      businessId: business.id,
      outcome: "success",
    });
    return {
      command,
      reply: `${brand}: You're unsubscribed and won't get more texts. Reply START to opt in again.`,
    };
  }

  if (command === "start") {
    await upsertSmsCustomer(business.id, input.from, true);
    logger.event("sms_opt_in", "Customer opted in to SMS", {
      businessId: business.id,
      outcome: "success",
    });
    return {
      command,
      reply: `${brand}: You're subscribed again. Reply STOP to unsubscribe. Msg & data rates may apply.`,
    };
  }

  if (command === "help") {
    return {
      command,
      reply: `${brand}: For booking and questions, just text us.${
        business.phone ? ` Call ${business.phone}.` : ""
      } Reply STOP to unsubscribe.`,
    };
  }

  const open = input.forceClosed
    ? { isOpen: false, hours: null }
    : await businessHoursService.isOpenAt(business.id, business.timezone);
  const afterHoursNote = open.isOpen
    ? ""
    : `We're closed right now${
        open.hours && !open.hours.isOpen
          ? "."
          : open.hours
            ? ` (open ${open.hours.openTime}–${open.hours.closeTime}).`
            : "."
      } I can still help you book.\n\n`;

  const result = await runAgent({
    businessId: business.id,
    channel: "SMS",
    channelIdentifier: input.from,
    customerMessage: input.body,
  });

  return {
    reply: `${afterHoursNote}${result.response || "Thanks for your message!"}`.slice(0, 1500),
    afterHours: !open.isOpen,
  };
}
