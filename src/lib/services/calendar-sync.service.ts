/**
 * Google Calendar sync + local busy blocks for conflict checks.
 * Never throws into the booking flow — sync failures are logged.
 */

import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { AppError, ErrorCode } from "@/lib/errors";
import { intervalsOverlap } from "@/lib/utils/date-time";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import {
  exchangeGoogleCode,
  fetchGoogleEmail,
  googleDeleteEvent,
  googleFreeBusy,
  googleOAuthConfigured,
  googleUpsertEvent,
  refreshGoogleAccessToken,
} from "@/lib/integrations/google-calendar";

export interface BusyBlock {
  id: string;
  start: string;
  end: string;
  title: string;
}

export interface CalendarStatus {
  oauthConfigured: boolean;
  connected: boolean;
  email: string | null;
  calendarId: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  busyBlocks: BusyBlock[];
}

interface CalendarConfig {
  calendarId: string;
  email?: string | null;
  refreshTokenEnc?: string;
  accessTokenEnc?: string;
  accessTokenExpiresAt?: string;
  busyBlocks: BusyBlock[];
}

function emptyConfig(): CalendarConfig {
  return { calendarId: "primary", busyBlocks: [] };
}

function parseConfig(raw: unknown): CalendarConfig {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<CalendarConfig>;
  return {
    calendarId: obj.calendarId || "primary",
    email: obj.email ?? null,
    refreshTokenEnc: obj.refreshTokenEnc,
    accessTokenEnc: obj.accessTokenEnc,
    accessTokenExpiresAt: obj.accessTokenExpiresAt,
    busyBlocks: Array.isArray(obj.busyBlocks) ? obj.busyBlocks : [],
  };
}

export function isBlockedByCalendar(
  start: Date,
  end: Date,
  busy: Array<{ start: Date; end: Date }>
): boolean {
  return busy.some((b) => intervalsOverlap(start, end, b.start, b.end));
}

export class CalendarSyncService {
  async getStatus(businessId: string): Promise<CalendarStatus> {
    const row = await prisma.integration.findUnique({
      where: { businessId_type: { businessId, type: "GOOGLE_CALENDAR" } },
    });
    const config = parseConfig(row?.configJson);
    return {
      oauthConfigured: googleOAuthConfigured(),
      connected: Boolean(row?.isEnabled && config.refreshTokenEnc),
      email: config.email ?? null,
      calendarId: config.calendarId,
      lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
      lastError: row?.lastError ?? null,
      busyBlocks: config.busyBlocks,
    };
  }

  async connectFromOAuth(businessId: string, code: string): Promise<void> {
    const tokens = await exchangeGoogleCode(code);
    const email = await fetchGoogleEmail(tokens.accessToken);
    const existing = await this.loadRow(businessId);
    const config = parseConfig(existing?.configJson);
    config.email = email;
    config.accessTokenEnc = encryptSecret(tokens.accessToken);
    config.accessTokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
    if (tokens.refreshToken) {
      config.refreshTokenEnc = encryptSecret(tokens.refreshToken);
    }
    await this.saveRow(businessId, config, {
      isEnabled: true,
      lastError: null,
      lastErrorAt: null,
      lastSyncedAt: new Date(),
    });
    logger.event("google_calendar_connected", "Google Calendar connected", {
      businessId,
      outcome: "success",
    });
  }

  async disconnect(businessId: string): Promise<void> {
    const existing = await this.loadRow(businessId);
    const config = parseConfig(existing?.configJson);
    delete config.refreshTokenEnc;
    delete config.accessTokenEnc;
    delete config.accessTokenExpiresAt;
    config.email = null;
    await this.saveRow(businessId, config, {
      isEnabled: false,
      lastError: null,
      lastErrorAt: null,
    });
    logger.event("google_calendar_disconnected", "Google Calendar disconnected", {
      businessId,
      outcome: "success",
    });
  }

  async addBusyBlock(
    businessId: string,
    input: { start: Date; end: Date; title: string }
  ): Promise<BusyBlock> {
    if (!(input.start < input.end)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "End time must be after start time.", 400);
    }
    const existing = await this.loadRow(businessId);
    const config = parseConfig(existing?.configJson);
    const block: BusyBlock = {
      id: randomUUID(),
      start: input.start.toISOString(),
      end: input.end.toISOString(),
      title: input.title.trim() || "Blocked",
    };
    config.busyBlocks.push(block);
    await this.saveRow(businessId, config, {});
    return block;
  }

  async removeBusyBlock(businessId: string, blockId: string): Promise<void> {
    const existing = await this.loadRow(businessId);
    const config = parseConfig(existing?.configJson);
    config.busyBlocks = config.busyBlocks.filter((b) => b.id !== blockId);
    await this.saveRow(businessId, config, {});
  }

  async listBusy(
    businessId: string,
    rangeStart: Date,
    rangeEnd: Date
  ): Promise<Array<{ start: Date; end: Date }>> {
    const existing = await this.loadRow(businessId);
    const config = parseConfig(existing?.configJson);
    const local = config.busyBlocks
      .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
      .filter((b) => intervalsOverlap(rangeStart, rangeEnd, b.start, b.end));

    let remote: Array<{ start: Date; end: Date }> = [];
    if (existing?.isEnabled && config.refreshTokenEnc) {
      try {
        const token = await this.validAccessToken(businessId, config);
        if (token) {
          remote = await googleFreeBusy(token, config.calendarId, rangeStart, rangeEnd);
          await this.saveRow(businessId, config, {
            lastSyncedAt: new Date(),
            lastError: null,
            lastErrorAt: null,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Calendar lookup failed";
        logger.error("Google freeBusy failed", err, { businessId });
        await this.saveRow(businessId, config, {
          lastError: message.slice(0, 240),
          lastErrorAt: new Date(),
        });
      }
    }

    return [...local, ...remote];
  }

  async assertFree(
    businessId: string,
    start: Date,
    end: Date,
    exclude?: { start: Date; end: Date }
  ): Promise<void> {
    const busy = (await this.listBusy(businessId, start, end)).filter((b) => {
      if (!exclude) return true;
      return !(
        b.start.getTime() === exclude.start.getTime() &&
        b.end.getTime() === exclude.end.getTime()
      );
    });
    if (isBlockedByCalendar(start, end, busy)) {
      throw new AppError(
        ErrorCode.APPOINTMENT_CONFLICT,
        "That time is blocked on the salon calendar. Please choose another time.",
        409
      );
    }
  }

  async syncAppointment(
    businessId: string,
    appointmentId: string,
    action: "upsert" | "delete"
  ): Promise<void> {
    try {
      const appt = await prisma.appointment.findFirst({
        where: { id: appointmentId, businessId },
        include: {
          service: { select: { name: true } },
          customer: { select: { name: true } },
          staff: { select: { name: true } },
          business: { select: { name: true } },
        },
      });
      if (!appt) return;

      const existing = await this.loadRow(businessId);
      const config = parseConfig(existing?.configJson);
      const connected = Boolean(existing?.isEnabled && config.refreshTokenEnc);
      const summary = `${appt.service.name} — ${appt.customer.name ?? "Customer"} at ${appt.business.name}`;

      if (!connected) {
        logger.info("Calendar event preview (Google not connected)", {
          businessId,
          appointmentId,
          action,
          summary,
          start: appt.startTime.toISOString(),
          end: appt.endTime.toISOString(),
        });
        return;
      }

      const token = await this.validAccessToken(businessId, config);
      if (!token) return;

      if (action === "delete") {
        if (appt.googleCalendarEventId) {
          await googleDeleteEvent(token, config.calendarId, appt.googleCalendarEventId);
          await prisma.appointment.update({
            where: { id: appointmentId },
            data: { googleCalendarEventId: null },
          });
        }
      } else {
        const eventId = await googleUpsertEvent(
          token,
          config.calendarId,
          appt.googleCalendarEventId,
          {
            summary,
            description: [appt.staff?.name ? `With ${appt.staff.name}` : "", appt.notes ?? ""]
              .filter(Boolean)
              .join("\n"),
            start: appt.startTime,
            end: appt.endTime,
          }
        );
        if (eventId !== appt.googleCalendarEventId) {
          await prisma.appointment.update({
            where: { id: appointmentId },
            data: { googleCalendarEventId: eventId },
          });
        }
      }

      await this.saveRow(businessId, config, {
        lastSyncedAt: new Date(),
        lastError: null,
        lastErrorAt: null,
      });
    } catch (err) {
      logger.error("Calendar sync failed", err, { businessId, appointmentId, action });
      try {
        const existing = await this.loadRow(businessId);
        const config = parseConfig(existing?.configJson);
        await this.saveRow(businessId, config, {
          lastError: (err instanceof Error ? err.message : "Calendar sync failed").slice(0, 240),
          lastErrorAt: new Date(),
        });
      } catch {
        /* ignore secondary write */
      }
    }
  }

  private async validAccessToken(
    businessId: string,
    config: CalendarConfig
  ): Promise<string | null> {
    if (config.accessTokenEnc && config.accessTokenExpiresAt) {
      const exp = new Date(config.accessTokenExpiresAt).getTime();
      if (exp - Date.now() > 60_000) {
        return decryptSecret(config.accessTokenEnc);
      }
    }
    if (!config.refreshTokenEnc) return null;
    const refreshed = await refreshGoogleAccessToken(decryptSecret(config.refreshTokenEnc));
    config.accessTokenEnc = encryptSecret(refreshed.accessToken);
    config.accessTokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
    await this.saveRow(businessId, config, {});
    return refreshed.accessToken;
  }

  private loadRow(businessId: string) {
    return prisma.integration.findUnique({
      where: { businessId_type: { businessId, type: "GOOGLE_CALENDAR" } },
    });
  }

  private async saveRow(
    businessId: string,
    config: CalendarConfig,
    extra: {
      isEnabled?: boolean;
      lastSyncedAt?: Date | null;
      lastError?: string | null;
      lastErrorAt?: Date | null;
    }
  ) {
    await prisma.integration.upsert({
      where: { businessId_type: { businessId, type: "GOOGLE_CALENDAR" } },
      create: {
        businessId,
        type: "GOOGLE_CALENDAR",
        isEnabled: extra.isEnabled ?? false,
        configJson: config as unknown as Prisma.InputJsonValue,
        lastSyncedAt: extra.lastSyncedAt ?? undefined,
        lastError: extra.lastError ?? undefined,
        lastErrorAt: extra.lastErrorAt ?? undefined,
      },
      update: {
        configJson: config as unknown as Prisma.InputJsonValue,
        ...(extra.isEnabled !== undefined && { isEnabled: extra.isEnabled }),
        ...(extra.lastSyncedAt !== undefined && { lastSyncedAt: extra.lastSyncedAt }),
        ...(extra.lastError !== undefined && { lastError: extra.lastError }),
        ...(extra.lastErrorAt !== undefined && { lastErrorAt: extra.lastErrorAt }),
      },
    });
  }
}

export const calendarSyncService = new CalendarSyncService();
