/**
 * Dashboard session helpers for API routes.
 */

import { type NextRequest } from "next/server";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { getSession, verifySessionToken, type SessionData } from "./session";
import { isOwnerRole } from "./roles";

export { isOwnerRole } from "./roles";

export function assertOwnerRole(role: string): void {
  if (!isOwnerRole(role)) {
    throw new ForbiddenError("Only the business owner can do this.");
  }
}

/** Read session from cookie — works in Server Components and Route Handlers. */
export async function requireDashboardSession(): Promise<SessionData> {
  const session = await getSession();
  if (!session) {
    throw new UnauthorizedError("Not authenticated. Please log in.");
  }
  return session;
}

/** Owner-only dashboard actions (catalog, hours, FAQs, team, business settings). */
export async function requireDashboardOwner(): Promise<SessionData> {
  const session = await requireDashboardSession();
  assertOwnerRole(session.role);
  return session;
}

/** Optional: read session from Authorization header (Bearer token) for API testing. */
export function sessionFromRequest(request: NextRequest): SessionData | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return verifySessionToken(auth.slice(7));
  }
  return null;
}

export async function requireDashboardSessionFromRequest(
  request: NextRequest
): Promise<SessionData> {
  const fromHeader = sessionFromRequest(request);
  if (fromHeader) return fromHeader;
  return requireDashboardSession();
}
