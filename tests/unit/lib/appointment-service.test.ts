/**
 * Unit tests for AppointmentService.
 * All DB calls are mocked. Tests validate availability rules,
 * conflict detection, idempotency, and status transition guards.
 */

// jest.mock factories run before imports — never reference outer variables inside them
jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    business:     { findUnique: jest.fn() },
    service:      { findFirst: jest.fn() },
    customer:     { findFirst: jest.fn() },
    staff:        { findFirst: jest.fn() },
    staffService: { findMany: jest.fn(), findFirst: jest.fn() },
    appointment:  {
      findMany: jest.fn(), findFirst: jest.fn(),
      findUnique: jest.fn(), create: jest.fn(),
      update: jest.fn(), count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/services/business-hours.service", () => ({
  businessHoursService: { getHoursForDay: jest.fn() },
}));

jest.mock("@/lib/services/calendar-sync.service", () => ({
  calendarSyncService: {
    listBusy: jest.fn().mockResolvedValue([]),
    assertFree: jest.fn().mockResolvedValue(undefined),
    syncAppointment: jest.fn(),
  },
  isBlockedByCalendar: (
    start: Date,
    end: Date,
    busy: Array<{ start: Date; end: Date }>
  ) => busy.some((b) => start < b.end && end > b.start),
}));

import { AppointmentService } from "@/lib/services/appointment.service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { businessHoursService } from "@/lib/services/business-hours.service";
import { calendarSyncService } from "@/lib/services/calendar-sync.service";

// Typed accessors for the mock
const mp = prisma as unknown as {
  business:     { findUnique: jest.Mock };
  service:      { findFirst: jest.Mock };
  customer:     { findFirst: jest.Mock };
  staff:        { findFirst: jest.Mock };
  staffService: { findMany: jest.Mock; findFirst: jest.Mock };
  appointment:  {
    findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock;
    create: jest.Mock; update: jest.Mock; count: jest.Mock;
  };
  $transaction: jest.Mock;
};
const mockHours = businessHoursService.getHoursForDay as jest.Mock;
const mockCalendar = calendarSyncService as unknown as {
  listBusy: jest.Mock;
  assertFree: jest.Mock;
  syncAppointment: jest.Mock;
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BUSINESS   = { timezone: "UTC", bookingLeadTimeMinutes: 60, bookingMaxDaysAhead: 60 };
const SERVICE    = { id: "svc-001", businessId: "biz-001", name: "Women's Haircut", durationMinutes: 60, bufferMinutes: 0, price: 65, currency: "USD", isActive: true };
const CUSTOMER   = { id: "cust-001", businessId: "biz-001" };
const STAFF_SVCS = [{ staffId: "staff-001", staff: { id: "staff-001", name: "Maria", isActive: true, acceptsBookings: true } }];
const OPEN_HOURS = { isOpen: true, openTime: "09:00", closeTime: "17:00" };

function futureDate(days: number) { return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10); }
function pastDate(days: number)   { return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10); }

// ── checkAvailability ─────────────────────────────────────────────────────────

describe("AppointmentService.checkAvailability", () => {
  let svc: AppointmentService;

  beforeEach(() => {
    svc = new AppointmentService();
    jest.clearAllMocks();
    mp.business.findUnique.mockResolvedValue(BUSINESS);
    mp.service.findFirst.mockResolvedValue(SERVICE);
    mp.staffService.findMany.mockResolvedValue(STAFF_SVCS);
    mp.appointment.findMany.mockResolvedValue([]);
    mockHours.mockResolvedValue(OPEN_HOURS);
    mockCalendar.listBusy.mockResolvedValue([]);
  });

  it("returns isOpen=false for a past date", async () => {
    const r = await svc.checkAvailability("biz-001", "svc-001", pastDate(1));
    expect(r.isOpen).toBe(false);
    expect(r.message).toMatch(/past/i);
  });

  it("returns isOpen=false when beyond maxDaysAhead", async () => {
    mp.business.findUnique.mockResolvedValue({ ...BUSINESS, bookingMaxDaysAhead: 30 });
    const r = await svc.checkAvailability("biz-001", "svc-001", futureDate(31));
    expect(r.isOpen).toBe(false);
    expect(r.message).toMatch(/30 days/i);
  });

  it("returns isOpen=false when business is closed that day", async () => {
    mockHours.mockResolvedValue({ isOpen: false, openTime: "09:00", closeTime: "17:00" });
    const r = await svc.checkAvailability("biz-001", "svc-001", futureDate(3));
    expect(r.isOpen).toBe(false);
  });

  it("returns slots when no existing appointments", async () => {
    const r = await svc.checkAvailability("biz-001", "svc-001", futureDate(7));
    expect(r.isOpen).toBe(true);
    expect(r.slots.length).toBeGreaterThan(0);
  });

  it("excludes slots blocked on the salon calendar", async () => {
    const date = futureDate(7);
    mockCalendar.listBusy.mockResolvedValue([
      {
        start: new Date(`${date}T10:00:00.000Z`),
        end: new Date(`${date}T11:00:00.000Z`),
      },
    ]);
    const r = await svc.checkAvailability("biz-001", "svc-001", date);
    const times = r.slots.map((s) => s.time);
    expect(times).not.toContain("10:00");
    expect(times).toContain("09:00");
  });

  it("excludes conflicting slots", async () => {
    const blockStart = new Date(`${futureDate(7)}T09:00:00.000Z`);
    const blockEnd   = new Date(`${futureDate(7)}T10:00:00.000Z`);
    mp.appointment.findMany.mockResolvedValue([{ staffId: "staff-001", startTime: blockStart, endTime: blockEnd }]);

    const r = await svc.checkAvailability("biz-001", "svc-001", futureDate(7));
    const times = r.slots.map((s) => s.time);
    expect(times).not.toContain("09:00");
    expect(times).not.toContain("09:30"); // 09:30 + 60m = 10:30 overlaps block end 10:00
  });

  it("throws NotFoundError when business not found", async () => {
    mp.business.findUnique.mockResolvedValue(null);
    await expect(svc.checkAvailability("bad-biz", "svc-001", futureDate(5))).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when service not found", async () => {
    mp.service.findFirst.mockResolvedValue(null);
    await expect(svc.checkAvailability("biz-001", "bad-svc", futureDate(5))).rejects.toThrow(NotFoundError);
  });
});

// ── createAppointment ─────────────────────────────────────────────────────────

describe("AppointmentService.createAppointment", () => {
  let svc: AppointmentService;

  const INPUT = { customerId: "cust-001", serviceId: "svc-001", date: futureDate(3), time: "10:00", conversationId: "conv-001" };
  const CREATED_APPT = { id: "appt-001", businessId: "biz-001", status: "PENDING", startTime: new Date(), endTime: new Date(), idempotencyKey: null };

  beforeEach(() => {
    svc = new AppointmentService();
    jest.clearAllMocks();
    mp.business.findUnique.mockResolvedValue(BUSINESS);
    mp.service.findFirst.mockResolvedValue(SERVICE);
    mp.customer.findFirst.mockResolvedValue(CUSTOMER);
    mp.staffService.findFirst.mockResolvedValue({ staffId: "staff-001" });
    mp.appointment.findUnique.mockResolvedValue(null);
    mp.appointment.findFirst.mockResolvedValue(null); // no conflict
    mp.appointment.create.mockResolvedValue(CREATED_APPT);
    mp.$transaction.mockImplementation(async (fn: (tx: typeof mp) => Promise<unknown>) => fn(mp));
  });

  it("creates an appointment successfully", async () => {
    const r = await svc.createAppointment("biz-001", INPUT);
    expect(r.id).toBe("appt-001");
    expect(mp.appointment.create).toHaveBeenCalledTimes(1);
  });

  it("returns existing record for duplicate idempotency key", async () => {
    mp.appointment.findUnique.mockResolvedValue({ id: "appt-existing" });
    const r = await svc.createAppointment("biz-001", { ...INPUT, idempotencyKey: "key-123" });
    expect(r.id).toBe("appt-existing");
    expect(mp.appointment.create).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when business not found", async () => {
    mp.business.findUnique.mockResolvedValue(null);
    await expect(svc.createAppointment("biz-001", INPUT)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when service not found", async () => {
    mp.service.findFirst.mockResolvedValue(null);
    await expect(svc.createAppointment("biz-001", INPUT)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when customer not found", async () => {
    mp.customer.findFirst.mockResolvedValue(null);
    await expect(svc.createAppointment("biz-001", INPUT)).rejects.toThrow(NotFoundError);
  });

  it("throws on conflict", async () => {
    mp.appointment.findFirst.mockResolvedValue({ id: "conflict-appt" });
    await expect(svc.createAppointment("biz-001", INPUT)).rejects.toThrow(/no longer available/i);
  });
});

// ── cancel ────────────────────────────────────────────────────────────────────

describe("AppointmentService.cancel", () => {
  let svc: AppointmentService;

  const BASE_APPT = {
    id: "appt-001", businessId: "biz-001", status: "CONFIRMED" as const,
    startTime: new Date(Date.now() + 48 * 3600_000), endTime: new Date(),
    service: { name: "Haircut", durationMinutes: 60 },
    customer: { name: "Jane", phone: null, email: null },
    staff: null,
  };

  beforeEach(() => {
    svc = new AppointmentService();
    jest.clearAllMocks();
    mp.business.findUnique.mockResolvedValue({ cancellationPolicyHours: 24 });
  });

  it("cancels a confirmed appointment", async () => {
    mp.appointment.findFirst.mockResolvedValue(BASE_APPT);
    mp.appointment.update.mockResolvedValue({ ...BASE_APPT, status: "CANCELLED" });
    const r = await svc.cancel("biz-001", "appt-001", "Customer request");
    expect(r.status).toBe("CANCELLED");
  });

  it("blocks cancel inside the notice window", async () => {
    mp.appointment.findFirst.mockResolvedValue({
      ...BASE_APPT,
      startTime: new Date(Date.now() + 2 * 3600_000),
    });
    await expect(svc.cancel("biz-001", "appt-001")).rejects.toThrow(/24 hours notice/i);
    expect(mp.appointment.update).not.toHaveBeenCalled();
  });

  it("allows owner force-cancel inside the notice window", async () => {
    const soon = { ...BASE_APPT, startTime: new Date(Date.now() + 2 * 3600_000) };
    mp.appointment.findFirst.mockResolvedValue(soon);
    mp.appointment.update.mockResolvedValue({ ...soon, status: "CANCELLED" });
    const r = await svc.cancel("biz-001", "appt-001", "Owner override", { force: true });
    expect(r.status).toBe("CANCELLED");
  });

  it("returns early without DB call if already cancelled", async () => {
    mp.appointment.findFirst.mockResolvedValue({ ...BASE_APPT, status: "CANCELLED" });
    const r = await svc.cancel("biz-001", "appt-001");
    expect(mp.appointment.update).not.toHaveBeenCalled();
    expect(r.status).toBe("CANCELLED");
  });

  it("throws ValidationError if already completed", async () => {
    mp.appointment.findFirst.mockResolvedValue({ ...BASE_APPT, status: "COMPLETED" });
    await expect(svc.cancel("biz-001", "appt-001")).rejects.toThrow(ValidationError);
  });
});
