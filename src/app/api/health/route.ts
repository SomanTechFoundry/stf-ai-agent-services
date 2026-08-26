import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const timestamp = new Date().toISOString();
  const checks: Record<string, string> = { api: "ok" };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const healthy = checks.database === "ok";

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
