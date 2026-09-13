/**
 * Public chat / embed access.
 *
 * Hosted /chat/[slug] on this app is first-party and always allowed.
 * Other websites must send the business widget token.
 * If allowedChatOrigins is set, the caller origin must also be listed.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { getAppOrigin, isFirstPartyOrigin, originFromUrl } from "@/lib/utils/app-url";

const CHAT_SESSION_TTL_SEC = 24 * 60 * 60;

export interface ChatSessionData {
  businessId: string;
}

interface ChatSessionPayload extends ChatSessionData {
  exp: number;
}

function getSecret(): string {
  const secret = process.env.API_SECRET_KEY;
  if (!secret) {
    throw new Error("API_SECRET_KEY is required for chat sessions");
  }
  return secret;
}

export function generateWidgetToken(): string {
  return randomBytes(24).toString("hex");
}

export function createChatSessionToken(data: ChatSessionData): string {
  const payload: ChatSessionPayload = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + CHAT_SESSION_TTL_SEC,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyChatSessionToken(token: string): ChatSessionData | null {
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
    ) as ChatSessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) {
      return null;
    }
    if (!payload.businessId) return null;
    return { businessId: payload.businessId };
  } catch {
    return null;
  }
}

export function requestOrigin(request: { headers: Headers }): string | null {
  return (
    originFromUrl(request.headers.get("origin")) ??
    originFromUrl(request.headers.get("referer"))
  );
}

export function assertWidgetAllowed(input: {
  origin: string | null;
  widgetToken?: string | null;
  storedToken?: string | null;
  allowedOrigins: string[];
}): void {
  if (isFirstPartyOrigin(input.origin)) return;

  const presented = input.widgetToken?.trim() ?? "";
  const stored = input.storedToken?.trim() ?? "";
  if (!stored || !presented || presented !== stored) {
    throw new ForbiddenError("This chat widget is not authorized for this website.");
  }

  if (input.allowedOrigins.length > 0) {
    const origin = input.origin;
    if (!origin || !input.allowedOrigins.includes(origin)) {
      throw new ForbiddenError("This website is not on the allowed list for this chat widget.");
    }
  }
}

export function requireChatSession(
  token: string | undefined,
  businessId: string
): ChatSessionData {
  if (!token) {
    throw new UnauthorizedError("Chat session required.");
  }
  const session = verifyChatSessionToken(token);
  if (!session || session.businessId !== businessId) {
    throw new ForbiddenError("Invalid or expired chat session.");
  }
  return session;
}

export function widgetSnippet(slug: string, token: string): string {
  const origin = getAppOrigin();
  return `<script src="${origin}/widget.js" data-business="${slug}" data-token="${token}"></script>`;
}
