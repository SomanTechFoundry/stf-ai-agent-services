/**
 * /chat/[businessSlug] — Customer-facing AI chat page.
 *
 * Hosted (no embed): first-party page, always allowed.
 * Embed (?embed=1): requires a valid widget token, or a first-party referer.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { ChatWidget } from "./ChatWidget";
import {
  assertWidgetAllowed,
  createChatSessionToken,
  generateWidgetToken,
} from "@/lib/security/chat-access";
import { originFromUrl } from "@/lib/utils/app-url";

interface Props {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ embed?: string; token?: string }>;
}

async function getBusinessData(slug: string) {
  const business = await prisma.business.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      status: true,
      phone: true,
      city: true,
      state: true,
      chatWidgetToken: true,
      allowedChatOrigins: true,
      aiConfiguration: {
        select: {
          agentName: true,
          welcomeMessage: true,
        },
      },
    },
  });

  if (!business || business.status === "SUSPENDED" || business.status === "CANCELLED") {
    return null;
  }

  let widgetToken = business.chatWidgetToken;
  if (!widgetToken) {
    widgetToken = generateWidgetToken();
    await prisma.business.update({
      where: { id: business.id },
      data: { chatWidgetToken: widgetToken },
    });
  }

  return {
    businessId: business.id,
    name: business.name,
    phone: business.phone ?? null,
    location:
      business.city && business.state ? `${business.city}, ${business.state}` : null,
    agentName: business.aiConfiguration?.agentName ?? "AI Assistant",
    welcomeMessage:
      business.aiConfiguration?.welcomeMessage ??
      `Hi! I'm the AI assistant for ${business.name}. How can I help you today?`,
    widgetToken,
    allowedChatOrigins: business.allowedChatOrigins,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { businessSlug } = await params;
  const data = await getBusinessData(businessSlug);
  if (!data) return { title: "Not Found" };
  return {
    title: `Chat with ${data.name}`,
    description: `Book appointments and get answers from ${data.agentName}, the AI assistant at ${data.name}.`,
  };
}

export default async function ChatPage({ params, searchParams }: Props) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const data = await getBusinessData(businessSlug);
  if (!data) {
    logger.event(
      "chat_page_not_found",
      "Chat page requested for unknown or inactive business",
      { slug: businessSlug, outcome: "failure" },
      "warn"
    );
    notFound();
  }

  const embed = query.embed === "1";
  if (embed) {
    const headerStore = await headers();
    const refererOrigin = originFromUrl(headerStore.get("referer"));
    try {
      assertWidgetAllowed({
        origin: refererOrigin,
        widgetToken: query.token,
        storedToken: data.widgetToken,
        allowedOrigins: data.allowedChatOrigins,
      });
    } catch {
      notFound();
    }
  }

  const chatSession = createChatSessionToken({ businessId: data.businessId });

  logger.event("chat_page_view", "Customer chat page opened", {
    businessId: data.businessId,
    slug: businessSlug,
    embed,
    outcome: "success",
  });

  return (
    <main className={embed ? "flex h-full min-h-[480px] flex-col bg-[#f4f2ee]" : "flex h-screen flex-col bg-[#f4f2ee]"}>
      <ChatWidget
        businessId={data.businessId}
        businessName={data.name}
        agentName={data.agentName}
        welcomeMessage={data.welcomeMessage}
        businessPhone={data.phone}
        businessLocation={data.location}
        chatSession={chatSession}
        embed={embed}
      />
    </main>
  );
}
