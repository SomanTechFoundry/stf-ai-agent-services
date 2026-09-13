/**
 * Dashboard team users (owner + front-desk logins). Not bookable stylists.
 */

import { randomBytes } from "crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import type { InviteTeamUserInput } from "@/lib/validation";

function generateTemporaryPassword(): string {
  return `Stf${randomBytes(6).toString("base64url")}!`;
}

async function sendInviteEmail(
  to: string,
  name: string,
  temporaryPassword: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) return false;
  try {
    const loginUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/dashboard/login`;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resend } = require("resend") as typeof import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: fromEmail,
      to,
      subject: "Your dashboard login",
      text:
        `Hi ${name},\n\nYou have been invited to the business dashboard.\n\n` +
        `Sign in: ${loginUrl}\nEmail: ${to}\nTemporary password: ${temporaryPassword}\n\n` +
        `Please change your password after signing in.\n`,
    });
    return true;
  } catch (err) {
    logger.error("Invite email failed", err, { event: "team_invite_email_failed" });
    return false;
  }
}

export class DashboardUserService {
  async list(businessId: string) {
    return prisma.user.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
  }

  async invite(
    businessId: string,
    input: InviteTeamUserInput
  ): Promise<{
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      isActive: boolean;
    };
    temporaryPassword: string;
    emailed: boolean;
  }> {
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { businessId_email: { businessId, email } },
    });
    if (existing) {
      throw new ValidationError("A team member with this email already exists.");
    }

    const temporaryPassword = generateTemporaryPassword();
    const user = await prisma.user.create({
      data: {
        businessId,
        email,
        name: input.name,
        role: UserRole.STAFF,
        passwordHash: await hashPassword(temporaryPassword),
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    const emailed = await sendInviteEmail(email, input.name, temporaryPassword);

    logger.event("team_user_invited", "Front-desk user created", {
      businessId,
      userId: user.id,
      emailed,
      outcome: "success",
    });

    return { user, temporaryPassword, emailed };
  }

  async setActive(
    businessId: string,
    actorUserId: string,
    targetUserId: string,
    isActive: boolean
  ) {
    if (actorUserId === targetUserId) {
      throw new ValidationError("You cannot deactivate your own account.");
    }

    const target = await prisma.user.findFirst({
      where: { id: targetUserId, businessId },
    });
    if (!target) {
      throw new NotFoundError("User", targetUserId);
    }

    if (
      !isActive &&
      (target.role === UserRole.BUSINESS_OWNER || target.role === UserRole.SUPER_ADMIN)
    ) {
      const owners = await prisma.user.count({
        where: {
          businessId,
          isActive: true,
          role: { in: [UserRole.BUSINESS_OWNER, UserRole.SUPER_ADMIN] },
        },
      });
      if (owners <= 1) {
        throw new ForbiddenError("Cannot deactivate the last owner.");
      }
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    logger.event("team_user_updated", "Team member active flag changed", {
      businessId,
      userId: targetUserId,
      isActive,
      outcome: "success",
    });

    return updated;
  }
}

export const dashboardUserService = new DashboardUserService();
