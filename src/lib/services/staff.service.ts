/**
 * StaffService — manage staff members and their service assignments.
 * All queries are scoped to businessId.
 */

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { CreateStaffInput, UpdateStaffInput } from "@/lib/validation";
import type { Staff } from "@prisma/client";

export type StaffWithServices = Staff & {
  services: { serviceId: string }[];
};

export class StaffService {
  private async assertServicesBelongToBusiness(
    businessId: string,
    serviceIds: string[]
  ): Promise<void> {
    if (serviceIds.length === 0) return;
    const unique = [...new Set(serviceIds)];
    const count = await prisma.service.count({
      where: { businessId, id: { in: unique } },
    });
    if (count !== unique.length) {
      throw new ValidationError("One or more services do not belong to this business.");
    }
  }

  async create(businessId: string, input: CreateStaffInput): Promise<StaffWithServices> {
    const serviceIds = input.serviceIds ?? [];
    await this.assertServicesBelongToBusiness(businessId, serviceIds);
    const staff = await prisma.staff.create({
      data: {
        businessId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        title: input.title ?? null,
        bio: input.bio ?? null,
        isActive: input.isActive,
        acceptsBookings: input.acceptsBookings,
        services: {
          create: serviceIds.map((serviceId) => ({ serviceId })),
        },
      },
      include: { services: { select: { serviceId: true } } },
    });

    logger.info("Staff created", { businessId, staffId: staff.id });
    return staff;
  }

  async getById(businessId: string, staffId: string): Promise<StaffWithServices> {
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      include: { services: { select: { serviceId: true } } },
    });

    if (!staff || staff.businessId !== businessId) {
      throw new NotFoundError("Staff", staffId);
    }

    return staff;
  }

  async list(businessId: string, activeOnly = true): Promise<StaffWithServices[]> {
    return prisma.staff.findMany({
      where: {
        businessId,
        ...(activeOnly && { isActive: true }),
      },
      include: { services: { select: { serviceId: true } } },
      orderBy: { name: "asc" },
    });
  }

  async update(
    businessId: string,
    staffId: string,
    input: UpdateStaffInput
  ): Promise<StaffWithServices> {
    await this.getById(businessId, staffId);
    if (input.serviceIds) {
      await this.assertServicesBelongToBusiness(businessId, input.serviceIds);
    }

    return prisma.staff.update({
      where: { id: staffId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.title !== undefined && { title: input.title }),
        ...(input.bio !== undefined && { bio: input.bio }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.acceptsBookings !== undefined && {
          acceptsBookings: input.acceptsBookings,
        }),
        ...(input.serviceIds !== undefined && {
          services: {
            deleteMany: {},
            create: input.serviceIds.map((serviceId) => ({ serviceId })),
          },
        }),
      },
      include: { services: { select: { serviceId: true } } },
    });
  }

  /**
   * Get staff members who can perform a specific service.
   * Used by the agent to find available stylists for a requested service.
   */
  async getByService(
    businessId: string,
    serviceId: string
  ): Promise<StaffWithServices[]> {
    return prisma.staff.findMany({
      where: {
        businessId,
        isActive: true,
        acceptsBookings: true,
        services: { some: { serviceId } },
      },
      include: { services: { select: { serviceId: true } } },
      orderBy: { name: "asc" },
    });
  }
}

export const staffService = new StaffService();
