import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db/client.ts";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Database health check failed:", error);
    return NextResponse.json({ status: "error", database: "disconnected" }, { status: 503 });
  }
}
