/**
 * POST /api/dashboard/login
 * Body: { email, password }
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { parseBody } from "@/lib/validation";
import { successResponse, errorResponse } from "@/lib/utils/api-response";
import { UnauthorizedError } from "@/lib/errors";
import { generateRequestId } from "@/lib/utils/id";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const ip = getClientIp(request);
    checkRateLimit(`login:${ip}`, 10, 60_000);

    const body = await request.json().catch(() => ({}));
    const { email, password } = parseBody(loginSchema, body);

    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), isActive: true },
      include: {
        business: { select: { id: true, name: true, slug: true, status: true } },
      },
    });

    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedError("Invalid email or password.");
    }

    if (user.business.status !== "ACTIVE" && user.business.status !== "TRIAL") {
      throw new UnauthorizedError("This business account is not active.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await setSessionCookie({
      userId: user.id,
      businessId: user.businessId,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return successResponse(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        business: user.business,
      },
      200,
      { requestId }
    );
  } catch (err) {
    return errorResponse(err, { requestId });
  }
}
