jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    integration: { findUnique: jest.fn(), upsert: jest.fn() },
    appointment: { findFirst: jest.fn(), update: jest.fn() },
  },
}));

import { isBlockedByCalendar } from "@/lib/services/calendar-sync.service";
import { signOAuthState, verifyOAuthState } from "@/lib/integrations/google-calendar";

describe("isBlockedByCalendar", () => {
  const slotStart = new Date("2026-09-15T15:00:00.000Z");
  const slotEnd = new Date("2026-09-15T16:00:00.000Z");

  it("detects an overlapping busy block", () => {
    expect(
      isBlockedByCalendar(slotStart, slotEnd, [
        { start: new Date("2026-09-15T15:30:00.000Z"), end: new Date("2026-09-15T16:30:00.000Z") },
      ])
    ).toBe(true);
  });

  it("allows a slot that only touches the busy end", () => {
    expect(
      isBlockedByCalendar(slotStart, slotEnd, [
        { start: new Date("2026-09-15T14:00:00.000Z"), end: new Date("2026-09-15T15:00:00.000Z") },
      ])
    ).toBe(false);
  });

  it("allows an empty busy list", () => {
    expect(isBlockedByCalendar(slotStart, slotEnd, [])).toBe(false);
  });
});

describe("Google OAuth state", () => {
  const prev = process.env.API_SECRET_KEY;

  beforeAll(() => {
    process.env.API_SECRET_KEY = "test-calendar-secret";
  });

  afterAll(() => {
    process.env.API_SECRET_KEY = prev;
  });

  it("signs and verifies a business id", () => {
    const state = signOAuthState("biz-001");
    expect(verifyOAuthState(state)).toEqual({ businessId: "biz-001" });
  });

  it("rejects a tampered state", () => {
    const state = signOAuthState("biz-001");
    expect(verifyOAuthState(`${state}x`)).toBeNull();
  });
});
