/**
 * POST /api/onboard — create a new business + first owner.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { onboardingService } from "@/lib/services/onboarding.service";
import { setSessionCookie } from "@/lib/auth/session";
import { parseBody, slugSchema, timeSchema } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { generateRequestId } from "@/lib/utils/id";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { slugify } from "@/lib/utils/slug";

const onboardSchema = z.object({
  businessName: z.string().min(2).max(200),
  slug: slugSchema,
  timezone: z.string().min(1).max(60).default("America/Chicago"),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  ownerName: z.string().min(1).max(200),
  ownerEmail: z.string().email().max(255),
  password: z.string().min(8).max(200),
  weekdayOpen: timeSchema,
  weekdayClose: timeSchema,
  saturdayOpen: z.boolean(),
  services: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        durationMinutes: z.number().int().min(10).max(480),
        price: z.number().min(0).max(10000),
      })
    )
    .min(1)
    .max(8),
});

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    checkRateLimit(`onboard:${getClientIp(request)}`, 5, 60 * 60 * 1000);
    const body = await request.json().catch(() => ({}));
    const input = parseBody(onboardSchema, {
      ...body,
      slug: slugify(String(body.slug ?? body.businessName ?? "")),
      ownerEmail: String(body.ownerEmail ?? "").toLowerCase().trim(),
    });

    const { business, user } = await onboardingService.createTenant(input);
    await setSessionCookie({
      userId: user.id,
      businessId: business.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return successResponse(
      {
        business: { id: business.id, name: business.name, slug: business.slug },
        chatPath: `/chat/${business.slug}`,
      },
      201,
      { requestId }
    );
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
