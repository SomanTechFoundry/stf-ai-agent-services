/**
 * GET /api/dashboard/conversations/[conversationId] — full message thread
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireDashboardSession } from "@/lib/auth/dashboard-auth";
import { conversationService } from "@/lib/services/conversation.service";
import { prisma } from "@/lib/db/prisma";
import { parseBody } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { NotFoundError } from "@/lib/errors";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardSession();
    const { conversationId } = await params;

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, businessId: session.businessId },
      include: {
        customer: { select: { name: true, phone: true, email: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!conversation) {
      throw new NotFoundError("Conversation", conversationId);
    }

    return successResponse(
      {
        id: conversation.id,
        channel: conversation.channel,
        status: conversation.status,
        createdAt: conversation.createdAt.toISOString(),
        customer: conversation.customer,
        messages: conversation.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
      },
      200,
      { requestId }
    );
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

const patchSchema = z.object({
  action: z.enum(["resolve"]),
});

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardSession();
    const { conversationId } = await params;
    const body = await request.json().catch(() => ({}));
    parseBody(patchSchema, body);

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, businessId: session.businessId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundError("Conversation", conversationId);

    await conversationService.resolve(conversationId);
    return successResponse({ resolved: true }, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
