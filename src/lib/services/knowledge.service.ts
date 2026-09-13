/**
 * KnowledgeService — FAQs and policies the AI can quote.
 * All queries are scoped to businessId.
 */

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { NotFoundError } from "@/lib/errors";
import type {
  CreateKnowledgeItemInput,
  UpdateKnowledgeItemInput,
} from "@/lib/validation";
import type { KnowledgeItem } from "@prisma/client";

export class KnowledgeService {
  async list(businessId: string, activeOnly = false): Promise<KnowledgeItem[]> {
    return prisma.knowledgeItem.findMany({
      where: {
        businessId,
        ...(activeOnly && { isActive: true }),
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
  }

  async getById(businessId: string, itemId: string): Promise<KnowledgeItem> {
    const item = await prisma.knowledgeItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.businessId !== businessId) {
      throw new NotFoundError("Knowledge item", itemId);
    }
    return item;
  }

  async create(
    businessId: string,
    input: CreateKnowledgeItemInput
  ): Promise<KnowledgeItem> {
    const item = await prisma.knowledgeItem.create({
      data: {
        businessId,
        category: input.category,
        question: input.question,
        answer: input.answer,
        isActive: input.isActive,
        priority: input.priority,
      },
    });
    logger.info("Knowledge item created", { businessId, itemId: item.id });
    return item;
  }

  async update(
    businessId: string,
    itemId: string,
    input: UpdateKnowledgeItemInput
  ): Promise<KnowledgeItem> {
    await this.getById(businessId, itemId);
    return prisma.knowledgeItem.update({
      where: { id: itemId },
      data: {
        ...(input.category !== undefined && { category: input.category }),
        ...(input.question !== undefined && { question: input.question }),
        ...(input.answer !== undefined && { answer: input.answer }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.priority !== undefined && { priority: input.priority }),
      },
    });
  }

  async deactivate(businessId: string, itemId: string): Promise<KnowledgeItem> {
    await this.getById(businessId, itemId);
    return prisma.knowledgeItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });
  }
}

export const knowledgeService = new KnowledgeService();
