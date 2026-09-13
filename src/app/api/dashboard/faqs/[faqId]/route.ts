/**
 * PATCH  /api/dashboard/faqs/:faqId
 * DELETE /api/dashboard/faqs/:faqId — deactivate
 */

import { type NextRequest } from "next/server";
import { requireDashboardOwner } from "@/lib/auth/dashboard-auth";
import { knowledgeService } from "@/lib/services/knowledge.service";
import { parseBody, updateKnowledgeItemSchema } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";

type Params = { params: Promise<{ faqId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const { faqId } = await params;
    const body = await request.json().catch(() => ({}));
    const input = parseBody(updateKnowledgeItemSchema, body);
    const item = await knowledgeService.update(session.businessId, faqId, input);
    logger.event("dashboard_faq_update", "Owner updated a FAQ", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      itemId: faqId,
      outcome: "success",
    });
    return successResponse(item, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardOwner();
    const { faqId } = await params;
    const item = await knowledgeService.deactivate(session.businessId, faqId);
    logger.event("dashboard_faq_deactivate", "Owner deactivated a FAQ", {
      requestId,
      businessId: session.businessId,
      userId: session.userId,
      itemId: faqId,
      outcome: "success",
    });
    return successResponse(item, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
