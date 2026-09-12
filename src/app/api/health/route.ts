import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";

export async function GET() {
  const timestamp = new Date().toISOString();
  const checks: Record<string, string> = { api: "ok" };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    checks.database = "error";
    logger.error("Health check database ping failed", err, {
      event: "health_check",
      outcome: "failure",
    });
  }

  const healthy = checks.database === "ok";
  logger.event(
    "health_check",
    healthy ? "Health check passed" : "Health check degraded",
    { checks, outcome: healthy ? "success" : "failure" },
    healthy ? "debug" : "error"
  );

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      service: "stf-ai-agent-services",
      version: "0.6.0",
      timestamp,
      environment: process.env.NODE_ENV ?? "unknown",
      checks,
    },
    { status: healthy ? 200 : 503 }
  );
}
