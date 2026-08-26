/**
 * POST /api/agent/chat
 *
 * Supports two response modes selected by the request body `stream` flag
 * or the Accept header:
 *
 * 1. Streaming (default for web chat — stream:true or Accept: text/event-stream)
 *    Returns newline-delimited JSON (NDJSON). Each line is one JSON object:
 *      {"type":"chunk","text":"Hi! "}
 *      {"type":"chunk","text":"How can I help?"}
 *      {"type":"done","conversationId":"...","toolsUsed":[...],"durationMs":1234}
 *      {"type":"error","code":"...","message":"..."}
 *
 * 2. JSON (for SMS/Twilio webhooks — stream:false or Accept: application/json)
 *    Returns the full response as a JSON object once complete.
 *
 * Request body:
 * {
 *   businessId: string;
 *   message: string;
 *   conversationId?: string;
 *   channel?: "WEBCHAT" | "SMS" | "VOICE" | "EMAIL" | "WHATSAPP";
 *   channelIdentifier?: string;
 *   stream?: boolean;
 * }
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { runAgent, runAgentStream } from "@/lib/agent";
import { parseBody } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";
import { toAppError } from "@/lib/errors";
import { env } from "@/lib/config/env";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import type { ConversationChannel } from "@prisma/client";

const chatRequestSchema = z.object({
  businessId:        z.string().min(1, "businessId is required"),
  message:           z.string().min(1, "message cannot be empty").max(4000, "message too long"),
  conversationId:    z.string().optional(),
  channel:           z.enum(["WEBCHAT", "SMS", "VOICE", "EMAIL", "WHATSAPP"]).default("WEBCHAT"),
  channelIdentifier: z.string().optional(),
  stream:            z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const ip = getClientIp(request);
    checkRateLimit(`agent:${ip}`, env().rateLimit.agentRequestsPerMinute);
  } catch (err) {
    return errorResponse(err, { requestId });
  }

  const body = await request.json().catch(() => ({}));
  const input = parseBody(chatRequestSchema, body);

  const acceptsSSE = request.headers.get("accept")?.includes("text/event-stream");
  const useStream  = input.stream ?? acceptsSSE ?? false;

  logger.info("Agent chat request", {
    requestId,
    businessId: input.businessId,
    channel: input.channel,
    stream: useStream,
  });

  const agentInput = {
    businessId:        input.businessId,
    conversationId:    input.conversationId,
    channel:           input.channel as ConversationChannel,
    channelIdentifier: input.channelIdentifier,
    customerMessage:   input.message,
  };

  // ── Streaming response (NDJSON) ─────────────────────────────────────────────

  if (useStream) {
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        const emit = (obj: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
          } catch {
            // controller already closed — swallow
          }
        };

        try {
          const result = await runAgentStream(agentInput, (text) => {
            emit({ type: "chunk", text });
          });

          emit({
            type:           "done",
            conversationId: result.conversationId,
            toolsUsed:      result.toolsUsed,
            durationMs:     result.durationMs,
          });
        } catch (err) {
          const appErr = toAppError(err);
          logger.error("Agent stream error", err, { requestId });
          emit({ type: "error", code: appErr.code, message: appErr.message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type":      "text/plain; charset=utf-8",
        "Cache-Control":     "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "X-Request-Id":      requestId,
      },
    });
  }

  // ── Non-streaming (JSON) ────────────────────────────────────────────────────

  try {
    const result = await runAgent(agentInput);
    return successResponse(result, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
