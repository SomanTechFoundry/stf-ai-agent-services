/**
 * Password reset tokens and email (when Resend is configured).
 * The raw token is never stored — only a SHA-256 hash.
 */

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { UnauthorizedError, ValidationError } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";

const RESET_TTL_MS = 60 * 60 * 1000;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashResetToken(token) };
}

export function buildResetUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
  return `${base}/dashboard/reset-password?token=${encodeURIComponent(token)}`;
}

async function sendAuthEmail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resend } = require("resend") as typeof import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({ from: fromEmail, to, subject, text });
    return true;
  } catch (err) {
    logger.error("Auth email failed", err, { event: "auth_email_failed" });
    return false;
  }
}

export class PasswordResetService {
  /**
   * Always succeeds from the caller's view if the email format is valid.
   * Does not reveal whether the account exists.
   */
  async requestReset(email: string): Promise<{ emailed: boolean; resetUrl?: string }> {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), isActive: true },
    });

    if (!user?.passwordHash) {
      logger.event("password_reset_unknown", "Reset requested for unknown email", {
        outcome: "skipped",
      });
      return { emailed: false };
    }

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const { token, tokenHash } = generateResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    const resetUrl = buildResetUrl(token);
    const emailed = await sendAuthEmail(
      user.email,
      "Reset your dashboard password",
      `Use this link to set a new password (valid for 1 hour):\n\n${resetUrl}\n`
    );

    logger.event("password_reset_created", "Password reset token created", {
      userId: user.id,
      businessId: user.businessId,
      emailed,
      outcome: "success",
    });

    const revealLink = process.env.NODE_ENV !== "production";
    return {
      emailed,
      ...(revealLink && { resetUrl }),
    };
  }

  async resetWithToken(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashResetToken(token);
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedError("This reset link is invalid or has expired.");
    }
    if (!record.user.isActive) {
      throw new UnauthorizedError("This account is not active.");
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    logger.event("password_reset_complete", "Password reset via email token", {
      userId: record.userId,
      businessId: record.user.businessId,
      outcome: "success",
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      throw new UnauthorizedError("Unable to change password.");
    }

    const { verifyPassword } = await import("@/lib/auth/password");
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedError("Current password is incorrect.");
    }
    if (currentPassword === newPassword) {
      throw new ValidationError("New password must be different from the current password.");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    logger.event("password_changed", "User changed their password", {
      userId,
      businessId: user.businessId,
      outcome: "success",
    });
  }
}

export const passwordResetService = new PasswordResetService();
