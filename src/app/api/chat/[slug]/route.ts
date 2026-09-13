/**
 * GET /api/chat/[slug]
 *
 * Bootstraps the public chat / embed widget.
 * First-party origin (this app) is always allowed.
 * Other websites must send x-stf-widget-token.
 */

import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { NotFoundError } from "@/lib/errors";
import { generateRequestId } from "@/lib/utils/id";
import {
  assertWidgetAllowed,
  createChatSessionToken,
  generateWidgetToken,
  requestOrigin,
} from "@/lib/security/chat-access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = generateRequestId();
  try {
    const { slug } = await params;

    const business = await prisma.business.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        status: true,
        phone: true,
        city: true,
        state: true,
        slug: true,
        chatWidgetToken: true,
        allowedChatOrigins: true,
        aiConfiguration: {
          select: {
            agentName: true,
            welcomeMessage: true,
          },
        },
      },
    });

    if (!business || business.status === "SUSPENDED" || business.status === "CANCELLED") {
      throw new NotFoundError("Business", slug);
    }

    let storedToken = business.chatWidgetToken;
    if (!storedToken) {
      storedToken = generateWidgetToken();
      await prisma.business.update({
        where: { id: business.id },
        data: { chatWidgetToken: storedToken },
      });
    }

    assertWidgetAllowed({
      origin: requestOrigin(request),
      widgetToken: request.headers.get("x-stf-widget-token") ?? request.nextUrl.searchParams.get("token"),
      storedToken,
      allowedOrigins: business.allowedChatOrigins,
    });

    return successResponse(
      {
        businessId: business.id,
        slug: business.slug,
        name: business.name,
        phone: business.phone,
        location: business.city && business.state ? `${business.city}, ${business.state}` : null,
        agentName: business.aiConfiguration?.agentName ?? "AI Assistant",
        welcomeMessage:
          business.aiConfiguration?.welcomeMessage ??
          `Hi! I'm the AI assistant for ${business.name}. How can I help you today?`,
        chatSession: createChatSessionToken({ businessId: business.id }),
      },
      200,
      { requestId }
    );
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
