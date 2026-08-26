/**
 * GET /api/dashboard/conversations
 */

import { requireDashboardSession } from "@/lib/auth/dashboard-auth";
import { conversationService } from "@/lib/services/conversation.service";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

export async function GET() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardSession();
    const result = await conversationService.listForDashboard(session.businessId, {
      limit: 50,
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

    return successResponse({ conversations: items, total: result.total }, 200, {
      requestId,
    });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
