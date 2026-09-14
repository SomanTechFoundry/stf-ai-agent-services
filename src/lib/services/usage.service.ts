/**
 * Aggregate chats, bookings, and estimated AI cost for the owner dashboard.
 */

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function windowStats(businessId: string, from: Date) {
  const [conversations, appointments, usage] = await Promise.all([
    prisma.conversation.count({
      where: { businessId, createdAt: { gte: from } },
    }),
    prisma.appointment.count({
      where: {
        businessId,
        createdAt: { gte: from },
        status: { notIn: ["CANCELLED"] },
      },
    }),
    prisma.usageRecord.aggregate({
      where: { businessId, recordedAt: { gte: from }, usageType: "ai_request" },
      _count: { id: true },
      _sum: { estimatedCostCents: true, inputTokens: true, outputTokens: true },
    }),
  ]);

  return {
    conversations,
    appointments,
    aiRequests: usage._count.id,
    estimatedCostUsd: Number(((usage._sum.estimatedCostCents ?? 0) / 100).toFixed(4)),
    inputTokens: usage._sum.inputTokens ?? 0,
    outputTokens: usage._sum.outputTokens ?? 0,
  };
}

export async function getUsageSummary(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      status: true,
      trialEndsAt: true,
      stripeSubscriptionId: true,
      slug: true,
      customDomain: true,
    },
  });

  const [today, month] = await Promise.all([
    windowStats(businessId, startOfDay()),
    windowStats(businessId, startOfMonth()),
  ]);

  return {
    today,
    month,
    plan: {
      status: business?.status ?? "TRIAL",
      trialEndsAt: business?.trialEndsAt?.toISOString() ?? null,
      subscribed: Boolean(business?.stripeSubscriptionId),
      stripeConfigured: Boolean(env().stripe.secretKey),
      monthlyPriceUsd: 49,
    },
    urls: {
      chatPath: `/chat/${business?.slug ?? ""}`,
      customDomain: business?.customDomain ?? null,
    },
  };
}
