/**
 * POST /api/dashboard/logout
 */

import { clearSessionCookie } from "@/lib/auth/session";
import { successResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

export async function POST() {
  await clearSessionCookie();
  return successResponse({ loggedOut: true }, 200, {
    requestId: generateRequestId(),
  });
}
