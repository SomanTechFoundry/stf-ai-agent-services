/**
 * POST /api/webhooks/twilio/sms
 *
 * Receives inbound SMS from Twilio, handles STOP/START/HELP,
 * then runs the AI agent and replies via TwiML.
 */

import { type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { generateRequestId } from "@/lib/utils/id";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { env } from "@/lib/config/env";
import { handleInboundSms } from "@/lib/services/inbound-sms.service";

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
      logger.event(
        "twilio_sms_rejected",
        "Inbound SMS rejected — invalid signature",
        { requestId, outcome: "failure" },
        "warn"
      );
      return new Response("Forbidden", { status: 403 });
    }

    if (!from || !body) {
      return twiml("Sorry, I didn't receive your message. Please try again.");
    }

    checkRateLimit(`sms:${from}`, env().rateLimit.agentRequestsPerMinute);

    const result = await handleInboundSms({ from, to, body });

    logger.event("twilio_sms_replied", "Inbound SMS handled", {
      requestId,
      from,
      command: result.command,
      afterHours: result.afterHours,
      outcome: "success",
    });

    return twiml(result.reply);
  } catch (err) {
    logger.error("Twilio webhook error", err, {
      requestId,
      event: "twilio_sms_failed",
      outcome: "failure",
    });
    return twiml("Sorry, something went wrong. Please try again or call us directly.");
  }
}
