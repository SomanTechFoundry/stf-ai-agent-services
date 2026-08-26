/**
 * GET  /api/dashboard/settings — business + agent config
 * PATCH /api/dashboard/settings — update business profile + agent config
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireDashboardSession } from "@/lib/auth/dashboard-auth";
import { businessService } from "@/lib/services/business.service";
import { parseBody } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";

const patchSettingsSchema = z.object({
  business: z
    .object({
      phone: z.string().nullable().optional(),
      email: z.string().email().nullable().optional(),
      cancellationPolicyHours: z.number().int().min(0).optional(),
      bookingLeadTimeMinutes: z.number().int().min(0).optional(),
      bookingMaxDaysAhead: z.number().int().min(1).optional(),
    })
    .optional(),
  agent: z
    .object({
      agentName: z.string().min(1).optional(),
      welcomeMessage: z.string().nullable().optional(),
      personality: z.string().nullable().optional(),
      humanHandoffPhone: z.string().nullable().optional(),
      humanHandoffEmail: z.string().email().nullable().optional(),
    })
    .optional(),
});

export async function GET() {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardSession();

    const business = await prisma.business.findUnique({
      where: { id: session.businessId },
      include: {
        aiConfiguration: true,
        services: {
          where: { isActive: true },
          select: { id: true, name: true, durationMinutes: true, price: true },
          orderBy: { name: "asc" },
        },
        staff: {
          where: { isActive: true },
          select: { id: true, name: true, title: true },
          orderBy: { name: "asc" },
        },
      },
    });

    if (!business) {
      return errorResponse(new Error("Business not found"), { requestId });
    }

    const { aiConfiguration, services, staff, ...profile } = business;

    return successResponse(
      {
        business: profile,
        agent: aiConfiguration
          ? {
              agentName: aiConfiguration.agentName,
              welcomeMessage: aiConfiguration.welcomeMessage,
              personality: aiConfiguration.agentPersonality,
              aiProvider: aiConfiguration.aiProvider,
              aiModel: aiConfiguration.aiModel,
            }
          : null,
        services: services.map((s) => ({
          ...s,
          price: Number(s.price),
        })),
        staff,
      },
      200,
      { requestId }
    );
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const session = await requireDashboardSession();
    const body = await request.json().catch(() => ({}));
    const input = parseBody(patchSettingsSchema, body);

    if (input.business) {
      await businessService.update(session.businessId, input.business);
    }

    if (input.agent) {
      const { personality, ...agentFields } = input.agent;
      await prisma.aIConfiguration.upsert({
        where: { businessId: session.businessId },
        update: {
          ...agentFields,
          ...(personality !== undefined && { agentPersonality: personality }),
        },
        create: {
          businessId: session.businessId,
          agentName: agentFields.agentName ?? "AI Receptionist",
          welcomeMessage: agentFields.welcomeMessage ?? null,
          agentPersonality: personality ?? null,
          humanHandoffPhone: agentFields.humanHandoffPhone ?? null,
          humanHandoffEmail: agentFields.humanHandoffEmail ?? null,
        },
      });
    }

    return successResponse({ updated: true }, 200, { requestId });
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
