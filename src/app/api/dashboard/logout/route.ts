/**
 * POST /api/dashboard/logout
 */

import { clearSessionCookie, getSession } from "@/lib/auth/session";
import { successResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { logger } from "@/lib/logger";

export async function POST() {
  const requestId = generateRequestId();
  const session = await getSession();
  await clearSessionCookie();
  logger.event("dashboard_logout", "Dashboard session cleared", {
    requestId,
    userId: session?.userId,
    businessId: session?.businessId,
    outcome: "success",
  });
  return successResponse({ loggedOut: true }, 200, { requestId });
}
