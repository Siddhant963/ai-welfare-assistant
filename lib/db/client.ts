import "dotenv/config";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill in your Neon connection string."
  );
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString });
  // "event" (not "stdout") emits nothing unless something calls
  // prisma.$on("query", ...) — inert by default, no console noise. Enabled
  // so verification scripts can prove query counts (e.g. no N+1 patterns)
  // instead of only asserting it from code inspection.
  return new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] });
}

// Next.js dev mode hot-reloads modules on every change, which would create a
// fresh PrismaClient (and connection pool) each time without this cache.
// Production runs one process per instance, so this is a no-op there.
declare global {
  var __prisma: PrismaClient<"query"> | undefined;
}

export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
