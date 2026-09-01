import { prisma } from "../db/client.ts";
import type { Staff } from "../../generated/prisma/client.ts";

/**
 * Server-only. Resolves "the current staff member" for the claim workflow.
 *
 * Not authentication — no login, session, or request credential is
 * involved. It reads a fixed id from a server-only env var (STAFF_DEV_ID)
 * and looks up the matching seeded Staff row.
 *
 * Callers must handle `null` (no dev identity configured, or the
 * configured id doesn't match a real Staff row) and must never accept a
 * staff identity supplied by the browser instead of calling this.
 *
 * See docs/staff-claiming.md.
 */
export async function getCurrentStaff(): Promise<Staff | null> {
  const devId = process.env.STAFF_DEV_ID;
  if (!devId) return null;
  return prisma.staff.findUnique({ where: { id: devId } });
}
