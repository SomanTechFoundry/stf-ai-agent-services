/**
 * /chat/[businessSlug] — Customer-facing AI chat page.
 *
 * Server component: resolves the business slug, then hands off
 * all interactive state to the ChatWidget client component.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { ChatWidget } from "./ChatWidget";

interface Props {
  params: Promise<{ businessSlug: string }>;
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

export default async function ChatPage({ params }: Props) {
  const { businessSlug } = await params;
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

  logger.event("chat_page_view", "Customer chat page opened", {
    businessId: data.businessId,
    slug: businessSlug,
    outcome: "success",
  });

  return (
    <main className="flex h-screen flex-col bg-[#f4f2ee]">
      <ChatWidget
        businessId={data.businessId}
        businessName={data.name}
        agentName={data.agentName}
        welcomeMessage={data.welcomeMessage}
        businessPhone={data.phone}
        businessLocation={data.location}
      />
    </main>
  );
}
