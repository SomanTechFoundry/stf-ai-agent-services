import { RateLimitedError } from "@/lib/errors";
import { checkRateLimit, resetRateLimitStore } from "@/lib/security/rate-limit";

describe("rate limiter", () => {
  beforeEach(() => resetRateLimitStore());

  it("allows requests under the limit", () => {
    expect(() => checkRateLimit("test-key", 3)).not.toThrow();
    expect(() => checkRateLimit("test-key", 3)).not.toThrow();
    expect(() => checkRateLimit("test-key", 3)).not.toThrow();
  });

  it("throws RateLimitedError when exceeded", () => {
    checkRateLimit("burst-key", 2);
    checkRateLimit("burst-key", 2);
    expect(() => checkRateLimit("burst-key", 2)).toThrow(RateLimitedError);
  });

  it("tracks keys independently", () => {
    checkRateLimit("a", 1);
    checkRateLimit("b", 1);
    expect(() => checkRateLimit("a", 1)).toThrow(RateLimitedError);
    expect(() => checkRateLimit("b", 1)).toThrow(RateLimitedError);
  });
});
