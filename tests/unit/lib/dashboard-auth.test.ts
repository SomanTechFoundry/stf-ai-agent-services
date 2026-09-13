import {
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";
import {
  createSessionToken,
  verifySessionToken,
} from "@/lib/auth/session";
import { assertOwnerRole, isOwnerRole } from "@/lib/auth/dashboard-auth";
import { ForbiddenError } from "@/lib/errors";
import { generateResetToken, hashResetToken, buildResetUrl } from "@/lib/services/password-reset.service";

describe("dashboard password auth", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("Sunset2026!");
    expect(hash).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);
    expect(await verifyPassword("Sunset2026!", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("dashboard session tokens", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, API_SECRET_KEY: "dashboard-test-secret" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates and verifies a signed session token", () => {
    const token = createSessionToken({
      userId: "user-1",
      businessId: "biz-1",
      email: "owner@example.com",
      name: "Owner",
      role: "BUSINESS_OWNER",
    });

    const session = verifySessionToken(token);
    expect(session).toEqual({
      userId: "user-1",
      businessId: "biz-1",
      email: "owner@example.com",
      name: "Owner",
      role: "BUSINESS_OWNER",
    });
  });

  it("rejects tampered tokens", () => {
    const token = createSessionToken({
      userId: "user-1",
      businessId: "biz-1",
      email: "owner@example.com",
      name: "Owner",
      role: "BUSINESS_OWNER",
    });
    const tampered = token.slice(0, -4) + "xxxx";
    expect(verifySessionToken(tampered)).toBeNull();
  });
});

describe("owner role", () => {
  it("treats owner and super admin as owners", () => {
    expect(isOwnerRole("BUSINESS_OWNER")).toBe(true);
    expect(isOwnerRole("SUPER_ADMIN")).toBe(true);
    expect(isOwnerRole("STAFF")).toBe(false);
  });

  it("blocks staff from owner actions", () => {
    expect(() => assertOwnerRole("STAFF")).toThrow(ForbiddenError);
    expect(() => assertOwnerRole("BUSINESS_OWNER")).not.toThrow();
  });
});

describe("password reset tokens", () => {
  it("hashes tokens consistently and builds a local URL", () => {
    const { token, tokenHash } = generateResetToken();
    expect(hashResetToken(token)).toBe(tokenHash);
    expect(buildResetUrl(token)).toContain("/dashboard/reset-password?token=");
  });
});
