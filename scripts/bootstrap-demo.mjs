/**
 * Bootstrap demo salon + owner user for staging / first production test.
 *
 * Safe by default:
 *   - Refuses unless ALLOW_DEMO_BOOTSTRAP=true
 *   - Never runs without DATABASE_URL
 *
 * Usage (against production/staging DB):
 *   ALLOW_DEMO_BOOTSTRAP=true node scripts/bootstrap-demo.mjs
 *
 * Optional overrides:
 *   DEMO_OWNER_EMAIL=you@yourdomain.com
 *   DEMO_OWNER_PASSWORD=ChooseAStrongPassword!
 *   DEMO_BUSINESS_SLUG=sunset-salon
 */

const { PrismaClient, BusinessIndustry, DayOfWeek, UserRole } = require("@prisma/client");
const { scrypt, randomBytes } = require("crypto");
const { promisify } = require("util");

const scryptAsync = promisify(scrypt);
const prisma = new PrismaClient();

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

async function main() {
  if (process.env.ALLOW_DEMO_BOOTSTRAP !== "true") {
    console.error(
      "Refusing to run. Set ALLOW_DEMO_BOOTSTRAP=true to bootstrap demo data.\n" +
        "Example: ALLOW_DEMO_BOOTSTRAP=true DEMO_OWNER_PASSWORD='YourPass!' node scripts/bootstrap-demo.mjs"
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const slug = process.env.DEMO_BUSINESS_SLUG || "sunset-salon";
  const ownerEmail = (process.env.DEMO_OWNER_EMAIL || "owner@sunsetsalon.example").toLowerCase();
  const ownerPassword = process.env.DEMO_OWNER_PASSWORD || "Sunset2026!";

  console.log("Bootstrapping demo business…");

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

  const hours = [
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
      where: { businessId_dayOfWeek: { businessId: business.id, dayOfWeek: h.dayOfWeek } },
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
      update: {},
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
      update: {},
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

  const passwordHash = await hashPassword(ownerPassword);
  await prisma.user.upsert({
    where: { businessId_email: { businessId: business.id, email: ownerEmail } },
    update: { passwordHash, isActive: true, role: UserRole.BUSINESS_OWNER },
    create: {
      businessId: business.id,
      email: ownerEmail,
      name: "Sunset Salon Owner",
      role: UserRole.BUSINESS_OWNER,
      passwordHash,
      isActive: true,
    },
  });

  console.log("\nBootstrap complete.");
  console.log(`  Business: ${business.name} (${business.id})`);
  console.log(`  Chat:     /chat/${slug}`);
  console.log(`  Login:    /dashboard/login`);
  console.log(`  Email:    ${ownerEmail}`);
  console.log(`  Password: (the DEMO_OWNER_PASSWORD you set)`);
}

main()
  .catch((err) => {
    console.error("Bootstrap failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
