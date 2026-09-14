/**
 * Stripe Checkout for the $49/mo receptionist plan.
 * Without Stripe keys, returns a local preview (trial stays in place).
 */

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";
import { getAppOrigin } from "@/lib/utils/app-url";
import { logger } from "@/lib/logger";
import { AppError, ErrorCode } from "@/lib/errors";

export const MONTHLY_PRICE_CENTS = 4900;

export function stripeConfigured(): boolean {
  return Boolean(env().stripe.secretKey);
}

export async function createCheckoutSession(businessId: string, ownerEmail: string) {
  if (!stripeConfigured()) {
    logger.info("Billing checkout preview (Stripe not configured)", { businessId });
    return {
      url: null as string | null,
      preview: true,
      message: "Stripe is not configured. Locally the $49/mo plan is a preview only.",
    };
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, slug: true, stripeCustomerId: true },
  });
  if (!business) {
    throw new AppError(ErrorCode.NOT_FOUND, "Business not found.", 404);
  }

  const origin = getAppOrigin();
  const body = new URLSearchParams({
    mode: "subscription",
    success_url: `${origin}/dashboard/usage?billing=success`,
    cancel_url: `${origin}/dashboard/usage?billing=cancel`,
    client_reference_id: businessId,
    customer_email: ownerEmail,
    "metadata[businessId]": businessId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(MONTHLY_PRICE_CENTS),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": `AI receptionist — ${business.name}`,
  });
  if (business.stripeCustomerId) {
    body.set("customer", business.stripeCustomerId);
    body.delete("customer_email");
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env().stripe.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !json.url) {
    throw new AppError(
      ErrorCode.PAYMENT_ERROR,
      json.error?.message || "Unable to start checkout.",
      502
    );
  }

  return { url: json.url, preview: false, message: null as string | null };
}

export async function applyCheckoutCompleted(input: {
  businessId: string;
  customerId?: string | null;
  subscriptionId?: string | null;
}) {
  await prisma.business.update({
    where: { id: input.businessId },
    data: {
      status: "ACTIVE",
      stripeCustomerId: input.customerId ?? undefined,
      stripeSubscriptionId: input.subscriptionId ?? undefined,
    },
  });
  logger.event("billing_subscribed", "Business subscribed", {
    businessId: input.businessId,
    outcome: "success",
  });
}

export async function applySubscriptionCanceled(subscriptionId: string) {
  const business = await prisma.business.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true },
  });
  if (!business) return;
  await prisma.business.update({
    where: { id: business.id },
    data: { status: "TRIAL", stripeSubscriptionId: null },
  });
  logger.event("billing_canceled", "Subscription canceled", {
    businessId: business.id,
    outcome: "success",
  });
}
