/**
 * In-memory sliding-window rate limiter.
 *
 * Suitable for single-instance deployments and dev. For multi-instance
 * production (e.g. Vercel), replace with Redis/Upstash-backed limiter.
 */

import { RateLimitedError } from "@/lib/errors";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Reset store — for tests only. */
export function resetRateLimitStore(): void {
  buckets.clear();
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Check rate limit for a key. Throws RateLimitedError when exceeded.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): { remaining: number; resetAt: number } {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, bucket);
    return { remaining: limit - 1, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    throw new RateLimitedError();
  }

  return { remaining: limit - bucket.count, resetAt: bucket.resetAt };
}
