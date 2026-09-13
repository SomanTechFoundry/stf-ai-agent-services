/**
 * Public site origin for confirmation links, the embed script, and first-party checks.
 */

export function getAppOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export function bookingConfirmationUrl(appointmentId: string): string {
  return `${getAppOrigin()}/booking/${appointmentId}`;
}

export function originFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isFirstPartyOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return origin === getAppOrigin();
}
