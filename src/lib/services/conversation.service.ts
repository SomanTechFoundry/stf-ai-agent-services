/**
 * ConversationService — manages conversation sessions and messages.
 *
 * A Conversation is the persistent record of a customer interaction.
 * Messages are the individual turns within that conversation.
 * The agentState JSON field tracks booking progress across turns.
 */

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { NotFoundError } from "@/lib/errors";
import type {
  Conversation,
  Message,
  ConversationChannel,
  ConversationStatus,
} from "@prisma/client";
import type { AIToolCall } from "@/lib/ai/types";

export type { ConversationChannel };

export interface AgentState {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerId?: string;
  requestedService?: string;
  requestedServiceId?: string;
  requestedStaff?: string;
  requestedStaffId?: string;
  requestedDate?: string;        // ISO date "2024-01-15"
  requestedTime?: string;        // "14:00"
  appointmentId?: string;
  bookingStatus?: "collecting_info" | "checking_availability" | "confirming" | "booked" | "cancelled";
  escalated?: boolean;
  escalationReason?: string;
  [key: string]: unknown;
}

export interface AppendMessageOptions {
  role: "CUSTOMER" | "AGENT" | "SYSTEM" | "HUMAN_AGENT";
  content: string;
  aiProvider?: string;
  aiModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  toolCalls?: AIToolCall[];
  toolResults?: unknown[];
  durationMs?: number;
}

export class ConversationService {
  /**
   * Find an active conversation by channel identifier (e.g. phone number for SMS).
   * Returns null if no active conversation found — caller should create one.
   */
  async findActiveByChannel(
    businessId: string,
    channel: ConversationChannel,
    channelIdentifier: string
  ): Promise<Conversation | null> {
    return prisma.conversation.findFirst({
      where: {
        businessId,
        channel,
        channelIdentifier,
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Create a new conversation session.
   */
  async create(
    businessId: string,
    options: {
      channel: ConversationChannel;
      channelIdentifier?: string;
      customerId?: string;
      initialState?: AgentState;
    }
  ): Promise<Conversation> {
    const conversation = await prisma.conversation.create({
      data: {
        businessId,
        channel: options.channel,
        channelIdentifier: options.channelIdentifier ?? null,
        customerId: options.customerId ?? null,
        agentState: (options.initialState ?? {}) as object,
        status: "ACTIVE",
      },
    });

    logger.info("Conversation created", {
      businessId,
      conversationId: conversation.id,
      channel: options.channel,
    });

    return conversation;
  }

  /**
   * Find or create a conversation for a channel session.
   * Used by SMS/chat webhooks to resume existing conversations.
   */
  async findOrCreate(
    businessId: string,
    channel: ConversationChannel,
    channelIdentifier: string
  ): Promise<{ conversation: Conversation; created: boolean }> {
    const existing = await this.findActiveByChannel(
      businessId,
      channel,
      channelIdentifier
    );

    if (existing) return { conversation: existing, created: false };

    const conversation = await this.create(businessId, {
      channel,
      channelIdentifier,
    });

    return { conversation, created: true };
  }

  async getById(businessId: string, conversationId: string): Promise<Conversation> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation || conversation.businessId !== businessId) {
      throw new NotFoundError("Conversation", conversationId);
    }

    return conversation;
  }

  /**
   * Load conversation with full message history.
   * The agent uses this to reconstruct context.
   */
  async getWithMessages(
    businessId: string,
    conversationId: string,
    options?: { messageLimit?: number }
  ): Promise<{ conversation: Conversation; messages: Message[] }> {
    const conversation = await this.getById(businessId, conversationId);

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: options?.messageLimit ?? 50,
    });

    return { conversation, messages };
  }

  /**
   * Append a message to a conversation and update usage records.
   */
  async appendMessage(
    conversationId: string,
    businessId: string,
    options: AppendMessageOptions
  ): Promise<Message> {
    const message = await prisma.message.create({
      data: {
        conversationId,
        role: options.role,
        content: options.content,
        aiProvider: options.aiProvider ?? null,
        aiModel: options.aiModel ?? null,
        inputTokens: options.inputTokens ?? null,
        outputTokens: options.outputTokens ?? null,
        toolCalls: options.toolCalls ? (options.toolCalls as object[]) : undefined,
        toolResults: options.toolResults ? (options.toolResults as object[]) : undefined,
        durationMs: options.durationMs ?? null,
      },
    });

    // Track AI usage for cost allocation
    if (options.role === "AGENT" && options.aiProvider) {
      await prisma.usageRecord.create({
        data: {
          businessId,
          usageType: "ai_request",
          aiProvider: options.aiProvider,
          aiModel: options.aiModel ?? null,
          inputTokens: options.inputTokens ?? null,
          outputTokens: options.outputTokens ?? null,
          conversationId,
          estimatedCostCents: this.estimateCostCents(
            options.aiProvider,
            options.aiModel ?? "",
            options.inputTokens ?? 0,
            options.outputTokens ?? 0
          ),
        },
      });
    }

    return message;
  }

  /**
   * Update the structured agent state (booking progress, collected info).
   */
  async updateAgentState(
    conversationId: string,
    statePatch: Partial<AgentState>
  ): Promise<void> {
    const current = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { agentState: true },
    });

    const merged = { ...(current?.agentState as AgentState ?? {}), ...statePatch };

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { agentState: merged as object },
    });
  }

  /**
   * Link a customer to a conversation once identified.
   */
  async linkCustomer(conversationId: string, customerId: string): Promise<void> {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { customerId },
    });
  }

  async resolve(conversationId: string): Promise<void> {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  }

  async escalate(conversationId: string): Promise<void> {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "ESCALATED", escalatedAt: new Date() },
    });
  }

  /**
   * List conversations for the owner dashboard (newest first).
   */
  async listForDashboard(
    businessId: string,
    options?: { limit?: number; status?: ConversationStatus }
  ) {
    const limit = Math.min(options?.limit ?? 50, 100);
    const where = {
      businessId,
      ...(options?.status ? { status: options.status } : {}),
    };

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          customer: { select: { name: true, phone: true, email: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, role: true, createdAt: true },
          },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
      }),
      prisma.conversation.count({ where }),
    ]);

    return { conversations, total };
  }

  /**
   * Rough cost estimate in USD cents.
   * Used for approximate cost tracking — not for billing customers.
   * Update these rates periodically as AI pricing changes.
   */
  private estimateCostCents(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    // Rates per 1M tokens in USD cents (approximate as of 2024)
    const rates: Record<string, { input: number; output: number }> = {
      "gemini-3.1-flash-lite": { input: 3.0, output: 12 },
      "gemini-1.5-pro": { input: 350, output: 1050 },
      "gpt-4o-mini": { input: 15, output: 60 },
      "gpt-4o": { input: 500, output: 1500 },
      "claude-3-haiku-20240307": { input: 25, output: 125 },
    };

    const key = model || provider;
    const rate = rates[key] ?? { input: 50, output: 150 };

    return Math.round(
      (inputTokens / 1_000_000) * rate.input +
      (outputTokens / 1_000_000) * rate.output
    );
  }
}

export const conversationService = new ConversationService();
