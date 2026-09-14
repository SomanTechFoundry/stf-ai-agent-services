/**
 * Create a new salon tenant from the public onboarding wizard.
 */

import { BusinessIndustry, DayOfWeek, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { logger } from "@/lib/logger";
import { AppError, ErrorCode } from "@/lib/errors";
import { generateWidgetToken } from "@/lib/security/chat-access";
import { isReservedSlug } from "@/lib/utils/slug";

export interface OnboardInput {
  businessName: string;
  slug: string;
  timezone: string;
  city?: string;
  state?: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
  weekdayOpen: string;
  weekdayClose: string;
  saturdayOpen: boolean;
  services: Array<{ name: string; durationMinutes: number; price: number }>;
}

export class OnboardingService {
  async createTenant(input: OnboardInput) {
    if (isReservedSlug(input.slug)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "That URL is reserved. Choose another.", 409);
    }

    const existingSlug = await prisma.business.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (existingSlug) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "That chat URL is already taken.", 409);
    }

    const existingUser = await prisma.user.findFirst({
      where: { email: input.ownerEmail },
      select: { id: true },
    });
    if (existingUser) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "An account with that email already exists. Sign in instead.",
        409
      );
    }

    const passwordHash = await hashPassword(input.password);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: input.businessName,
          slug: input.slug,
          industry: BusinessIndustry.SALON,
          status: "TRIAL",
          timezone: input.timezone,
          city: input.city || null,
          state: input.state || null,
          trialEndsAt,
          chatWidgetToken: generateWidgetToken(),
        },
      });

      const hours: Array<{ dayOfWeek: DayOfWeek; isOpen: boolean; openTime: string; closeTime: string }> = [
        { dayOfWeek: DayOfWeek.MONDAY, isOpen: true, openTime: input.weekdayOpen, closeTime: input.weekdayClose },
        { dayOfWeek: DayOfWeek.TUESDAY, isOpen: true, openTime: input.weekdayOpen, closeTime: input.weekdayClose },
        { dayOfWeek: DayOfWeek.WEDNESDAY, isOpen: true, openTime: input.weekdayOpen, closeTime: input.weekdayClose },
        { dayOfWeek: DayOfWeek.THURSDAY, isOpen: true, openTime: input.weekdayOpen, closeTime: input.weekdayClose },
        { dayOfWeek: DayOfWeek.FRIDAY, isOpen: true, openTime: input.weekdayOpen, closeTime: input.weekdayClose },
        {
          dayOfWeek: DayOfWeek.SATURDAY,
          isOpen: input.saturdayOpen,
          openTime: input.weekdayOpen,
          closeTime: input.weekdayClose,
        },
        { dayOfWeek: DayOfWeek.SUNDAY, isOpen: false, openTime: "00:00", closeTime: "00:00" },
      ];
      await tx.businessHours.createMany({
        data: hours.map((h) => ({ businessId: business.id, ...h })),
      });

      const services = [];
      for (const s of input.services) {
        services.push(
          await tx.service.create({
            data: {
              businessId: business.id,
              name: s.name,
              durationMinutes: s.durationMinutes,
              price: s.price,
            },
          })
        );
      }

      const staff = await tx.staff.create({
        data: {
          businessId: business.id,
          name: input.ownerName,
          title: "Stylist",
          acceptsBookings: true,
        },
      });
      await tx.staffService.createMany({
        data: services.map((svc) => ({ staffId: staff.id, serviceId: svc.id })),
      });

      await tx.aIConfiguration.create({
        data: {
          businessId: business.id,
          agentName: "Reception",
          welcomeMessage: `Hi! I'm the receptionist at ${input.businessName}. I can help you book, reschedule, or answer questions.`,
          aiProvider: "gemini",
          aiModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
          humanHandoffEnabled: true,
        },
      });

      const user = await tx.user.create({
        data: {
          businessId: business.id,
          email: input.ownerEmail,
          name: input.ownerName,
          role: UserRole.BUSINESS_OWNER,
          passwordHash,
          isActive: true,
        },
      });

      return { business, user };
    });

    logger.event("tenant_onboarded", "New business created from onboarding", {
      businessId: result.business.id,
      slug: result.business.slug,
      outcome: "success",
    });

    return result;
  }
}

export const onboardingService = new OnboardingService();
