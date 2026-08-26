/**
 * Signed HTTP-only session cookies for the owner dashboard.
 * Uses API_SECRET_KEY as the signing secret (same as API key auth).
 */

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "stf_dashboard_session";
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days

export interface SessionData {
  userId: string;
  businessId: string;
  email: string;
  name: string;
  role: string;
}

interface SessionPayload extends SessionData {
  exp: number;
}

function getSecret(): string {
  const secret = process.env.API_SECRET_KEY;
  if (!secret) {
    throw new Error("API_SECRET_KEY is required for dashboard sessions");
  }
  return secret;
}

export function createSessionToken(data: SessionData): string {
  const payload: SessionPayload = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionData | null {
  const dot = token.indexOf(".");
  if (dot === -1) return null;

  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", getSecret()).update(encoded).digest("base64url");

  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) {
      return null;
    }
    return {
      userId: payload.userId,
      businessId: payload.businessId,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(data: SessionData): Promise<void> {
  const token = createSessionToken(data);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
