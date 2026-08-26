/**
 * POST /api/webhooks/twilio/sms
 *
 * Receives inbound SMS from Twilio, runs the AI agent, and replies via TwiML.
 * Configure in Twilio Console → Phone Number → Messaging webhook URL:
 *   https://your-domain.com/api/webhooks/twilio/sms
 */

import { type NextRequest } from "next/server";
import { runAgent } from "@/lib/agent";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { generateRequestId } from "@/lib/utils/id";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { env } from "@/lib/config/env";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twiml(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message.slice(0, 1500))}</Message></Response>`;
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}

async function validateTwilioSignature(
  request: NextRequest,
  params: Record<string, string>
): Promise<boolean> {
  const authToken = env().twilio.authToken;
  const signature = request.headers.get("x-twilio-signature");
  if (!authToken || !signature) return env().isDevelopment;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const twilio = require("twilio") as typeof import("twilio");
    const url = request.nextUrl.origin + request.nextUrl.pathname;
    return twilio.validateRequest(authToken, signature, url, params);
  } catch (err) {
    logger.error("Twilio signature validation failed", err);
    return false;
  }
}

async function resolveBusiness(toNumber: string) {
  const byPhone = await prisma.business.findFirst({
    where: { phone: toNumber, status: { in: ["ACTIVE", "TRIAL"] } },
    select: { id: true },
  });
  if (byPhone) return byPhone;

  const slug = process.env.TWILIO_BUSINESS_SLUG ?? "sunset-salon";
  return prisma.business.findFirst({
    where: { slug, status: { in: ["ACTIVE", "TRIAL"] } },
    select: { id: true },
  });
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const form = await request.formData();
    const params: Record<string, string> = {};
    form.forEach((value, key) => {
      params[key] = String(value);
    });

    const from = params.From ?? "";
    const to = params.To ?? "";
    const body = (params.Body ?? "").trim();

    if (!(await validateTwilioSignature(request, params))) {
      logger.warn("Twilio webhook: invalid signature", { requestId });
      return new Response("Forbidden", { status: 403 });
    }

    if (!from || !body) {
      return twiml("Sorry, I didn't receive your message. Please try again.");
    }

    checkRateLimit(`sms:${from}`, env().rateLimit.agentRequestsPerMinute);

    const business = await resolveBusiness(to);
    if (!business) {
      logger.error("Twilio webhook: no business for number", { requestId, to });
      return twiml("This number is not configured. Please contact the business directly.");
    }

    logger.info("Twilio inbound SMS", {
      requestId,
      businessId: business.id,
      from,
      bodyLength: body.length,
    });

    const result = await runAgent({
      businessId: business.id,
      channel: "SMS",
      channelIdentifier: from,
      customerMessage: body,
    });

    return twiml(result.response || "Thanks for your message!");
  } catch (err) {
    logger.error("Twilio webhook error", err, { requestId });
    return twiml("Sorry, something went wrong. Please try again or call us directly.");
  }
}
