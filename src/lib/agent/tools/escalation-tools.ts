/**
 * Escalation tools — hand off to a human agent when needed.
 */

import { z } from "zod";
import { conversationService } from "@/lib/services/conversation.service";
import { notificationService } from "@/lib/services/notification.service";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import type { AgentTool, ToolContext } from "./types";
import { toolSuccess, toolError } from "./types";

const handoffSchema = z.object({
  reason: z.string().min(1),
  urgency: z.enum(["low", "normal", "high"]).default("normal"),
  summary: z.string().optional(),
});

export const handoffToHumanTool: AgentTool = {
  definition: {
    name: "handoffToHuman",
    description:
      "Escalate the conversation to a human agent or staff member. " +
      "Call this when: the customer explicitly asks for a human, " +
      "the situation is too complex for you to handle, " +
      "an external system has failed repeatedly, " +
      "the customer is frustrated or upset, " +
      "or the request is outside your capabilities.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief reason for escalation (for staff context)",
        },
        urgency: {
          type: "string",
          enum: ["low", "normal", "high"],
          description: "Urgency level of the escalation",
        },
        summary: {
          type: "string",
          description: "Optional: brief summary of the conversation so far for the human agent",
        },
      },
      required: ["reason"],
    },
  },

  async execute(args: unknown, context: ToolContext) {
    const parsed = handoffSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return toolError("Unable to process escalation request.");
    }

    const { reason, urgency, summary } = parsed.data;

    try {
      // Mark conversation as escalated
      await conversationService.escalate(context.conversationId);

      await conversationService.updateAgentState(context.conversationId, {
        escalated: true,
        escalationReason: reason,
        bookingStatus: undefined,
      });

      // Get business contact info for the handoff message
      const aiConfig = await prisma.aIConfiguration.findUnique({
        where: { businessId: context.businessId },
        select: { humanHandoffPhone: true, humanHandoffEmail: true },
      });

      const contactInfo = aiConfig?.humanHandoffPhone
        ? `You can reach our team directly at ${aiConfig.humanHandoffPhone}.`
        : "Please contact us directly and a team member will assist you.";

      logger.warn("Conversation escalated to human", {
        businessId: context.businessId,
        conversationId: context.conversationId,
        reason,
        urgency,
      });

      const conversation = await prisma.conversation.findUnique({
        where: { id: context.conversationId },
        select: { channelIdentifier: true },
      });

      void notificationService.sendEscalationAlert({
        businessId: context.businessId,
        conversationId: context.conversationId,
        reason,
        urgency,
        summary: summary ?? null,
        customerPhone: conversation?.channelIdentifier ?? null,
      });

      return toolSuccess({
        escalated: true,
        reason,
        urgency,
        summary: summary ?? null,
        contactInfo,
        message: `I've flagged this conversation for our team. ${contactInfo} Thank you for your patience.`,
      });
    } catch (err) {
      logger.error("handoffToHuman tool error", err, {
        conversationId: context.conversationId,
      });
      return toolError("Unable to process escalation. Please contact us directly.");
    }
  },
};
