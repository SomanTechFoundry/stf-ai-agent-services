/**
 * GET /api/dashboard/conversations?status=ESCALATED
 */

import { type NextRequest } from "next/server";
import { type ConversationStatus } from "@prisma/client";
import { requireDashboardSession } from "@/lib/auth/dashboard-auth";
import { conversationService } from "@/lib/services/conversation.service";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardSession();
    const rawStatus = request.nextUrl.searchParams.get("status");
    const status =
      rawStatus === "ACTIVE" || rawStatus === "RESOLVED" || rawStatus === "ESCALATED"
        ? (rawStatus as ConversationStatus)
        : undefined;
    const result = await conversationService.listForDashboard(session.businessId, {
      limit: 50,
      status,
    });

    const items = result.conversations.map((c) => ({
      id: c.id,
      channel: c.channel,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      customer: c.customer,
      messageCount: c._count.messages,
      lastMessage: c.messages[0]
        ? {
            role: c.messages[0].role,
            content: c.messages[0].content.slice(0, 120),
            createdAt: c.messages[0].createdAt.toISOString(),
          }
        : null,
    }));

    logger.event("dashboard_conversations_list", "Owner listed conversations", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      count: items.length,
      outcome: "success",
    });

    return successResponse({ conversations: items, total: result.total }, 200, {
      requestId,
    });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
