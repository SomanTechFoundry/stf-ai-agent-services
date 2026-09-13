/**
 * GET /api/integrations/google/callback — finish Google Calendar OAuth.
 */

import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/roles";
import { verifyOAuthState } from "@/lib/integrations/google-calendar";
import { calendarSyncService } from "@/lib/services/calendar-sync.service";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !isOwnerRole(session.role)) {
    redirect("/dashboard/login");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError || !code || !state) {
    redirect("/dashboard/settings?calendar=denied");
  }

  const verified = verifyOAuthState(state);
  if (!verified || verified.businessId !== session.businessId) {
    redirect("/dashboard/settings?calendar=invalid");
  }

  try {
    await calendarSyncService.connectFromOAuth(session.businessId, code);
  } catch (err) {
    logger.error("Google Calendar OAuth callback failed", err);
    redirect("/dashboard/settings?calendar=failed");
  }

  redirect("/dashboard/settings?calendar=connected");
}
