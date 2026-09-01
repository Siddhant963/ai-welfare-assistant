import { prisma } from "../db/client.ts";
import type { Staff } from "../../generated/prisma/client.ts";

/**
 * SERVER-ONLY. Resolves "the current staff member" for the claim workflow.
 *
 * ⚠️ THIS IS NOT AUTHENTICATION. There is no login, no session, no request
 * credential involved at all — it reads a fixed id from a server-only env
 * var (STAFF_DEV_ID) and looks up the matching seeded Staff row. It exists
 * only so the claim endpoint has *someone* to attribute a claim to while a
 * real authenticated-session identity layer doesn't exist yet.
 *
 * Every caller must be prepared for `null` (no dev identity configured, or
 * the configured id doesn't match a real Staff row) and must never accept
 * a staff identity supplied by the browser instead of calling this.
 *
 * See docs/staff-claiming.md for the production requirement this defers.
 */
export async function getCurrentStaff(): Promise<Staff | null> {
  const devId = process.env.STAFF_DEV_ID;
  if (!devId) return null;
  return prisma.staff.findUnique({ where: { id: devId } });
}
