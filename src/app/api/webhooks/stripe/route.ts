/**
 * POST /api/webhooks/stripe
 */

import { type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/config/env";
import { applyCheckoutCompleted, applySubscriptionCanceled } from "@/lib/services/billing.service";
import { logger } from "@/lib/logger";

function verifyStripeSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    })
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 60 * 5) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const secret = env().stripe.webhookSecret;
  if (secret && !verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret)) {
    return new Response("Invalid signature", { status: 400 });
  }
  if (!secret && !env().isDevelopment) {
    return new Response("Webhook secret missing", { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const obj = event.data?.object ?? {};
      const businessId =
        (obj.client_reference_id as string | undefined) ||
        ((obj.metadata as { businessId?: string } | undefined)?.businessId);
      if (businessId) {
        await applyCheckoutCompleted({
          businessId,
          customerId: (obj.customer as string | null) ?? null,
          subscriptionId: (obj.subscription as string | null) ?? null,
        });
      }
    }
    if (event.type === "customer.subscription.deleted") {
      const id = event.data?.object?.id as string | undefined;
      if (id) await applySubscriptionCanceled(id);
    }
    return new Response("ok", { status: 200 });
  } catch (err) {
    logger.error("Stripe webhook failed", err);
    return new Response("error", { status: 500 });
  }
}
