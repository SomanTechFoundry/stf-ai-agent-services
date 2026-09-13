/**
 * GET  /api/dashboard/faqs
 * POST /api/dashboard/faqs
 */

import { type NextRequest } from "next/server";
import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { knowledgeService } from "@/lib/services/knowledge.service";
import { parseBody, createKnowledgeItemSchema } from "@/lib/validation";
import { successResponse, createdResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";

export async function GET() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const items = await knowledgeService.list(session.businessId, false);
    return successResponse(items, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const body = await request.json().catch(() => ({}));
    const input = parseBody(createKnowledgeItemSchema, body);
    const item = await knowledgeService.create(session.businessId, input);
    logger.event("dashboard_faq_create", "Owner created a FAQ", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      itemId: item.id,
      outcome: "success",
    });
    return createdResponse(item);
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
