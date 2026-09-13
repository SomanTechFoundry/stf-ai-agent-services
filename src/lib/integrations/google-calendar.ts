/**
 * Google OAuth + Calendar REST helpers.
 * Uses fetch so googleapis is not required.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/config/env";
import { getAppOrigin } from "@/lib/utils/app-url";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function googleOAuthConfigured(): boolean {
  const g = env().google;
  return Boolean(g.clientId && g.clientSecret);
}

export function googleRedirectUri(): string {
  return env().google.redirectUri || `${getAppOrigin()}/api/integrations/google/callback`;
}

function oauthSecret(): string {
  return process.env.API_SECRET_KEY || "dev-calendar-secret";
}

export function signOAuthState(businessId: string): string {
  const exp = Math.floor(Date.now() / 1000) + 10 * 60;
  const encoded = Buffer.from(JSON.stringify({ businessId, exp })).toString("base64url");
  const sig = createHmac("sha256", oauthSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(state: string): { businessId: string } | null {
  const dot = state.indexOf(".");
  if (dot === -1) return null;
  const encoded = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac("sha256", oauthSecret()).update(encoded).digest("base64url");
  try {
    if (sig.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      businessId?: string;
      exp?: number;
    };
    if (!payload.businessId || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { businessId: payload.businessId };
  } catch {
    return null;
  }
}

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env().google.clientId ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}> {
  const body = new URLSearchParams({
    code,
    client_id: env().google.clientId ?? "",
    client_secret: env().google.clientSecret ?? "",
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error || "Google token exchange failed");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in ?? 3600,
  };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env().google.clientId ?? "",
    client_secret: env().google.clientSecret ?? "",
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error || "Google token refresh failed");
  }
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 3600 };
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}

export async function googleFreeBusy(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<Array<{ start: Date; end: Date }>> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Google freeBusy failed (${res.status})`);
  }
  const json = (await res.json()) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
  };
  const busy = json.calendars?.[calendarId]?.busy ?? json.calendars?.primary?.busy ?? [];
  return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

export async function googleUpsertEvent(
  accessToken: string,
  calendarId: string,
  eventId: string | null,
  event: {
    summary: string;
    description?: string;
    start: Date;
    end: Date;
  }
): Promise<string> {
  const payload = {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.start.toISOString() },
    end: { dateTime: event.end.toISOString() },
  };
  const url = eventId
    ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
    : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const res = await fetch(url, {
    method: eventId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message || `Google event ${eventId ? "update" : "create"} failed`);
  }
  return json.id;
}

export async function googleDeleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google event delete failed (${res.status})`);
  }
}
