/**
 * GET /api/integrations/google/start — begin Google Calendar OAuth.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/roles";
import { googleAuthUrl, googleOAuthConfigured, signOAuthState } from "@/lib/integrations/google-calendar";

export async function GET() {
  const session = await getSession();
  if (!session || !isOwnerRole(session.role)) {
    redirect("/dashboard/login");
  }
  if (!googleOAuthConfigured()) {
    redirect("/dashboard/settings?calendar=oauth_missing");
  }
  redirect(googleAuthUrl(signOAuthState(session.businessId)));
}
