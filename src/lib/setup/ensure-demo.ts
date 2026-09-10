/**
 * Ensures the Sunset Salon demo tenant exists (business, hours, services,
 * staff, AI config, owner user). Safe to call repeatedly — upserts only.
 *
 * Used so local + Vercel both work without a manual seed step.
 * Override credentials with DEMO_OWNER_EMAIL / DEMO_OWNER_PASSWORD.
 */

import { BusinessIndustry, DayOfWeek, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { logger } from "@/lib/logger";

export const DEMO_BUSINESS_SLUG = "sunset-salon";

export function getDemoOwnerCredentials() {
  return {
    email: (process.env.DEMO_OWNER_EMAIL || "owner@sunsetsalon.example").toLowerCase(),
    password: process.env.DEMO_OWNER_PASSWORD || "Sunset2026!",
  };
}

let ensureInFlight: Promise<{ businessId: string; created: boolean }> | null = null;

async function runEnsureDemoTenant(): Promise<{ businessId: string; created: boolean }> {
  const slug = process.env.DEMO_BUSINESS_SLUG || DEMO_BUSINESS_SLUG;
  const { email: ownerEmail, password: ownerPassword } = getDemoOwnerCredentials();

  const existing = await prisma.business.findUnique({
    where: { slug },
    select: { id: true },
  });

  const business = await prisma.business.upsert({
    where: { slug },
    update: { status: "ACTIVE" },
    create: {
      name: "Sunset Salon",
      slug,
      industry: BusinessIndustry.SALON,
      status: "ACTIVE",
      email: "hello@sunsetsalon.example",
      phone: "+12145550100",
      address: "123 Main St",
      city: "Dallas",
      state: "TX",
      postalCode: "75201",
      country: "US",
      timezone: "America/Chicago",
      bookingLeadTimeMinutes: 60,
      bookingMaxDaysAhead: 45,
      cancellationPolicyHours: 24,
    },
  });

  const hours: Array<{
    dayOfWeek: DayOfWeek;
    isOpen: boolean;
    openTime: string;
    closeTime: string;
  }> = [
    { dayOfWeek: DayOfWeek.MONDAY, isOpen: true, openTime: "09:00", closeTime: "18:00" },
    { dayOfWeek: DayOfWeek.TUESDAY, isOpen: true, openTime: "09:00", closeTime: "18:00" },
    { dayOfWeek: DayOfWeek.WEDNESDAY, isOpen: true, openTime: "09:00", closeTime: "18:00" },
    { dayOfWeek: DayOfWeek.THURSDAY, isOpen: true, openTime: "09:00", closeTime: "20:00" },
    { dayOfWeek: DayOfWeek.FRIDAY, isOpen: true, openTime: "09:00", closeTime: "20:00" },
    { dayOfWeek: DayOfWeek.SATURDAY, isOpen: true, openTime: "10:00", closeTime: "17:00" },
    { dayOfWeek: DayOfWeek.SUNDAY, isOpen: false, openTime: "00:00", closeTime: "00:00" },
  ];

  for (const h of hours) {
    await prisma.businessHours.upsert({
      where: {
        businessId_dayOfWeek: { businessId: business.id, dayOfWeek: h.dayOfWeek },
      },
      update: h,
      create: { businessId: business.id, ...h },
    });
  }

  const services = [
    { name: "Women's Haircut", durationMinutes: 60, price: 65, category: "Hair" },
    { name: "Men's Haircut", durationMinutes: 30, price: 35, category: "Hair" },
    { name: "Blowout", durationMinutes: 45, price: 50, category: "Hair" },
    { name: "Hair Color - Full", durationMinutes: 120, price: 140, category: "Color" },
    { name: "Hair Color - Partial", durationMinutes: 90, price: 95, category: "Color" },
    { name: "Highlights", durationMinutes: 120, price: 130, category: "Color" },
  ];

  for (const s of services) {
    const id = `seed-${business.id}-${s.name.toLowerCase().replace(/\s+/g, "-")}`;
    await prisma.service.upsert({
      where: { id },
      update: { isActive: true },
      create: {
        id,
        businessId: business.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
        price: s.price,
        category: s.category,
      },
    });
  }

  const staffMembers = [
    { name: "Maria Garcia", title: "Senior Stylist", email: "maria@sunsetsalon.example" },
    { name: "James Wilson", title: "Barber & Stylist", email: "james@sunsetsalon.example" },
  ];

  for (const s of staffMembers) {
    await prisma.staff.upsert({
      where: { businessId_email: { businessId: business.id, email: s.email } },
      update: { isActive: true },
      create: {
        businessId: business.id,
        name: s.name,
        title: s.title,
        email: s.email,
      },
    });
  }

  await prisma.aIConfiguration.upsert({
    where: { businessId: business.id },
    update: {},
    create: {
      businessId: business.id,
      agentName: "Sunny",
      agentPersonality:
        "Warm, confident, and professional — like an experienced salon receptionist.",
      aiProvider: "gemini",
      aiModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      humanHandoffEnabled: true,
      humanHandoffPhone: process.env.TWILIO_PHONE_NUMBER || "+12145550100",
      welcomeMessage:
        "Hi there! I'm Sunny at Sunset Salon. I can help you book an appointment, " +
        "check our services and pricing, or answer any questions. What can I do for you today?",
    },
  });

  // Always refresh owner password so demo login matches env / documented defaults
  const passwordHash = await hashPassword(ownerPassword);
  await prisma.user.upsert({
    where: { businessId_email: { businessId: business.id, email: ownerEmail } },
    update: {
      passwordHash,
      isActive: true,
      role: UserRole.BUSINESS_OWNER,
      name: "Sunset Salon Owner",
    },
    create: {
      businessId: business.id,
      email: ownerEmail,
      name: "Sunset Salon Owner",
      role: UserRole.BUSINESS_OWNER,
      passwordHash,
      isActive: true,
    },
  });

  const created = !existing;
  if (created) {
    logger.info("Demo tenant created", { businessId: business.id, slug, ownerEmail });
  }

  return { businessId: business.id, created };
}

export async function ensureDemoTenant(): Promise<{ businessId: string; created: boolean }> {
  if (ensureInFlight) return ensureInFlight;

  ensureInFlight = runEnsureDemoTenant().finally(() => {
    ensureInFlight = null;
  });

  return ensureInFlight;
}

/**
 * Ensure demo tenant when the requested slug is the demo slug and missing,
 * or when the owner user is missing.
 */
export async function ensureDemoTenantIfNeeded(slug: string): Promise<void> {
  const demoSlug = process.env.DEMO_BUSINESS_SLUG || DEMO_BUSINESS_SLUG;
  if (slug !== demoSlug) return;

  const business = await prisma.business.findUnique({
    where: { slug: demoSlug },
    select: { id: true },
  });

  if (!business) {
    await ensureDemoTenant();
    return;
  }

  const { email } = getDemoOwnerCredentials();
  const owner = await prisma.user.findFirst({
    where: { businessId: business.id, email, isActive: true },
    select: { id: true },
  });

  if (!owner) {
    await ensureDemoTenant();
  }
}
