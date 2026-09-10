/**
 * Tenant Isolation Tests
 *
 * These are the most critical tests in the platform.
 * They verify that Client A can NEVER access Client B's data.
 *
 * These tests run against a real database (Neon test database).
 * Each test cleans up after itself.
 */

import { prisma } from "@/lib/db/prisma";
import { businessService } from "@/lib/services/business.service";
import { customerService } from "@/lib/services/customer.service";
import { serviceService } from "@/lib/services/service.service";
import { staffService } from "@/lib/services/staff.service";
import { NotFoundError } from "@/lib/errors";

// Unique prefix to avoid collisions with other test runs
const TEST_PREFIX = `test-iso-${Date.now()}`;

let businessA: { id: string };
let businessB: { id: string };

beforeAll(async () => {
  // Create two isolated test businesses
  businessA = await businessService.create({
    name: "Test Business A",
    slug: `${TEST_PREFIX}-a`,
    industry: "SALON",
    country: "US",
    timezone: "America/Chicago",
    bookingLeadTimeMinutes: 60,
    bookingMaxDaysAhead: 60,
    cancellationPolicyHours: 24,
  });

  businessB = await businessService.create({
    name: "Test Business B",
    slug: `${TEST_PREFIX}-b`,
    industry: "SALON",
    country: "US",
    timezone: "America/Chicago",
    bookingLeadTimeMinutes: 60,
    bookingMaxDaysAhead: 60,
    cancellationPolicyHours: 24,
  });
}, 60_000);

afterAll(async () => {
  try {
    // Guard: beforeAll may have failed, leaving businesses undefined
    const ids = [businessA?.id, businessB?.id].filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );

    if (ids.length > 0) {
      await prisma.customer.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.service.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.staff.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.business.deleteMany({
        where: { id: { in: ids } },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

// ============================================================
// Customer isolation
// ============================================================

describe("Customer tenant isolation", () => {
  let customerAId: string;

  it("creates a customer for Business A", async () => {
    const customer = await customerService.create(businessA.id, {
      name: "Alice Smith",
      phone: "2145550001",
      preferredChannel: "SMS",
      smsOptIn: true,
      emailOptIn: false,
    });
    customerAId = customer.id;
    expect(customer.businessId).toBe(businessA.id);
    expect(customer.phone).toBe("+12145550001"); // normalized
  });

  it("Business B cannot access Business A's customer", async () => {
    await expect(
      customerService.getById(businessB.id, customerAId)
    ).rejects.toThrow(NotFoundError);
  });

  it("Business B's customer list does not include Business A's customers", async () => {
    const { customers } = await customerService.list(businessB.id);
    const ids = customers.map((c) => c.id);
    expect(ids).not.toContain(customerAId);
  });
});

// ============================================================
// Service isolation
// ============================================================

describe("Service tenant isolation", () => {
  let serviceAId: string;

  it("creates a service for Business A", async () => {
    const service = await serviceService.create(businessA.id, {
      name: "Women's Haircut",
      durationMinutes: 60,
      price: 65,
      currency: "USD",
      bufferMinutes: 0,
      isActive: true,
    });
    serviceAId = service.id;
    expect(service.businessId).toBe(businessA.id);
  });

  it("Business B cannot access Business A's service", async () => {
    await expect(
      serviceService.getById(businessB.id, serviceAId)
    ).rejects.toThrow(NotFoundError);
  });

  it("Business B's service list does not include Business A's services", async () => {
    const services = await serviceService.list(businessB.id, false);
    const ids = services.map((s) => s.id);
    expect(ids).not.toContain(serviceAId);
  });
});

// ============================================================
// Staff isolation
// ============================================================

describe("Staff tenant isolation", () => {
  let staffAId: string;

  it("creates a staff member for Business A", async () => {
    const staff = await staffService.create(businessA.id, {
      name: "Maria Garcia",
      title: "Senior Stylist",
      isActive: true,
      acceptsBookings: true,
      serviceIds: [],
    });
    staffAId = staff.id;
    expect(staff.businessId).toBe(businessA.id);
  });

  it("Business B cannot access Business A's staff member", async () => {
    await expect(
      staffService.getById(businessB.id, staffAId)
    ).rejects.toThrow(NotFoundError);
  });

  it("Business B's staff list does not include Business A's staff", async () => {
    const staff = await staffService.list(businessB.id, false);
    const ids = staff.map((s) => s.id);
    expect(ids).not.toContain(staffAId);
  });
});

// ============================================================
// Slug uniqueness
// ============================================================

describe("Business slug uniqueness", () => {
  it("rejects duplicate slugs", async () => {
    await expect(
      businessService.create({
        name: "Duplicate Slug Test",
        slug: `${TEST_PREFIX}-a`, // same as businessA
        industry: "SALON",
        country: "US",
        timezone: "America/Chicago",
        bookingLeadTimeMinutes: 60,
        bookingMaxDaysAhead: 60,
        cancellationPolicyHours: 24,
      })
    ).rejects.toThrow();
  });
});
