/**
 * Shared Zod validation schemas and helpers.
 *
 * Every API route validates its request body through a Zod schema
 * before passing data to the service layer. This ensures:
 * - Type safety at the boundary
 * - Clear validation error messages for API consumers
 * - No raw user input ever reaches the database
 */

import { z } from "zod";
import { ValidationError } from "@/lib/errors";

// ============================================================
// Parse helper — converts ZodError into our ValidationError type
// ============================================================

export function parseBody<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown
): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      fields[path || "root"] = issue.message;
    }
    throw new ValidationError("Validation failed", fields);
  }
  return result.data;
}

// ============================================================
// Reusable field schemas
// ============================================================

export const phoneSchema = z
  .string()
  .min(7)
  .max(20)
  .regex(/^[+\d\s\-().]+$/, "Invalid phone number format")
  .optional()
  .nullable();

export const emailSchema = z
  .string()
  .email("Invalid email address")
  .max(255)
  .optional()
  .nullable();

export const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only");

export const timezoneSchema = z
  .string()
  .min(1)
  .max(60)
  .default("America/Chicago");

export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:MM 24-hour format (e.g. "09:00")');

export const positiveIntSchema = z.number().int().positive();

export const priceSchema = z
  .number()
  .min(0, "Price cannot be negative")
  .max(100000, "Price seems unreasonably large");

// ============================================================
// Business schemas
// ============================================================

export const createBusinessSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema,
  industry: z.enum([
    "SALON",
    "AUTO_REPAIR",
    "CLEANING",
    "HVAC_PLUMBING",
    "REAL_ESTATE",
    "MED_SPA",
    "PET_GROOMING",
    "LANDSCAPING",
    "OTHER",
  ]),
  email: emailSchema,
  phone: phoneSchema,
  website: z.string().url("Invalid URL").max(255).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().length(2, "Country must be a 2-letter ISO code").default("US"),
  timezone: timezoneSchema,
  bookingLeadTimeMinutes: z.number().int().min(0).max(10080).default(60),
  bookingMaxDaysAhead: z.number().int().min(1).max(365).default(60),
  cancellationPolicyHours: z.number().int().min(0).max(168).default(24),
});

export const updateBusinessSchema = createBusinessSchema.partial().omit({ slug: true });

export type CreateBusinessInput = z.output<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;

// ============================================================
// Customer schemas
// ============================================================

const customerBaseSchema = z.object({
  name: z.string().min(1).max(200).optional().nullable(),
  phone: phoneSchema,
  email: emailSchema,
  notes: z.string().max(1000).optional().nullable(),
  preferredChannel: z.enum(["SMS", "EMAIL", "BOTH", "NONE"]).default("SMS"),
  smsOptIn: z.boolean().default(false),
  emailOptIn: z.boolean().default(false),
});

export const createCustomerSchema = customerBaseSchema.refine(
  (data) => data.phone || data.email,
  { message: "At least one of phone or email is required" }
);

// Update does not require phone/email — caller may update any subset of fields
export const updateCustomerSchema = customerBaseSchema.partial();

export type CreateCustomerInput = z.output<typeof customerBaseSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ============================================================
// Service schemas
// ============================================================

export const createServiceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  durationMinutes: z.number().int().min(5).max(480),
  price: priceSchema,
  currency: z.string().length(3, "Currency must be a 3-letter ISO code").default("USD"),
  category: z.string().max(100).optional().nullable(),
  bufferMinutes: z.number().int().min(0).max(120).default(0),
  isActive: z.boolean().default(true),
});

export const updateServiceSchema = createServiceSchema.partial();

export type CreateServiceInput = z.output<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

// ============================================================
// Staff schemas
// ============================================================

export const createStaffSchema = z.object({
  name: z.string().min(1).max(200),
  email: emailSchema,
  phone: phoneSchema,
  title: z.string().max(100).optional().nullable(),
  bio: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().default(true),
  acceptsBookings: z.boolean().default(true),
  serviceIds: z.array(z.string()).optional().default([]),
});

export const updateStaffSchema = createStaffSchema.partial();

export type CreateStaffInput = z.output<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

// ============================================================
// Business hours schemas
// ============================================================

const dayOfWeekEnum = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

export const businessHoursEntrySchema = z.object({
  dayOfWeek: dayOfWeekEnum,
  isOpen: z.boolean(),
  openTime: timeSchema,
  closeTime: timeSchema,
}).refine(
  (data) => !data.isOpen || data.openTime < data.closeTime,
  { message: "openTime must be before closeTime when the business is open" }
);

export const setBusinessHoursSchema = z.object({
  hours: z.array(businessHoursEntrySchema).min(1).max(7),
});

export type BusinessHoursEntry = z.infer<typeof businessHoursEntrySchema>;
export type SetBusinessHoursInput = z.infer<typeof setBusinessHoursSchema>;

// ============================================================
// Knowledge / FAQ schemas
// ============================================================

export const knowledgeCategorySchema = z.enum(["faq", "policy", "service_info"]);

export const createKnowledgeItemSchema = z.object({
  category: knowledgeCategorySchema.default("faq"),
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(4000),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(1).max(1000).default(100),
});

export const updateKnowledgeItemSchema = createKnowledgeItemSchema.partial();

export type CreateKnowledgeItemInput = z.output<typeof createKnowledgeItemSchema>;
export type UpdateKnowledgeItemInput = z.infer<typeof updateKnowledgeItemSchema>;

// ============================================================
// Dashboard user / password schemas
// ============================================================

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });

export const inviteTeamUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  role: z.literal("STAFF").default("STAFF"),
});

export const updateTeamUserSchema = z.object({
  isActive: z.boolean(),
});

export type InviteTeamUserInput = z.output<typeof inviteTeamUserSchema>;
export type UpdateTeamUserInput = z.infer<typeof updateTeamUserSchema>;
