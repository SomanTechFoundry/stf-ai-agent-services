/**
 * AES-256-GCM helpers for integration tokens.
 * Key is derived from API_SECRET_KEY (never log plaintext).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function keyBytes(): Buffer {
  const secret = process.env.API_SECRET_KEY || "dev-calendar-secret";
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${enc.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  if (!payload.startsWith("v1.")) return payload;
  const [, ivB64, dataB64, tagB64] = payload.split(".");
  if (!ivB64 || !dataB64 || !tagB64) {
    throw new Error("Invalid encrypted payload");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
