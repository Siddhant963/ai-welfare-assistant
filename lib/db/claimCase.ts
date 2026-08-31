import { prisma } from "./client.ts";
import { CaseStatus } from "../../generated/prisma/client.ts";

export type ClaimCaseResult =
  | { claimed: true }
  | { claimed: false; reason: "not_found" | "already_claimed" };

/**
 * Atomically claims a case for a staff member.
 *
 * Implemented as a single conditional UPDATE (`WHERE id = ... AND claimedById
 * IS NULL`) rather than a read-then-write, so two staff members racing to
 * claim the same case can never both succeed — the database guarantees only
 * one UPDATE affects a row. This is deliberately NOT select-then-update.
 */
export async function claimCase(caseId: string, staffId: string): Promise<ClaimCaseResult> {
  const result = await prisma.case.updateMany({
    where: { id: caseId, claimedById: null },
    data: {
      claimedById: staffId,
      claimedAt: new Date(),
      status: CaseStatus.IN_PROGRESS,
    },
  });

  if (result.count === 1) {
    return { claimed: true };
  }

  const existing = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true },
  });

  return { claimed: false, reason: existing ? "already_claimed" : "not_found" };
}
