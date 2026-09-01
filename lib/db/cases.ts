import { prisma } from "./client.ts";
import { CaseStatus, Prisma, Urgency } from "../../generated/prisma/client.ts";
import type { Case } from "../../generated/prisma/client.ts";
import type { FinalDecision } from "../safety/rules.ts";

/**
 * Turns an ESCALATE decision into the staff workflow record. Never calls
 * the AI — everything here comes from the caller's already-validated
 * decision.
 *
 * TriageResult (lib/db/chatRecords.ts) answers "what did the AI/safety
 * engine decide" for every attempt. Case answers "what currently needs a
 * human," one per conversation (Case.conversationId is unique).
 */

const URGENCY_ORDER: Urgency[] = [Urgency.LOW, Urgency.MEDIUM, Urgency.HIGH, Urgency.CRITICAL];

function isStrongerUrgency(candidate: Urgency, current: Urgency): boolean {
  return URGENCY_ORDER.indexOf(candidate) > URGENCY_ORDER.indexOf(current);
}

const SUMMARY_SNIPPET_LENGTH = 200;

function buildCaseSummary(decision: FinalDecision, message: string): string {
  const why =
    decision.reasons.length > 0
      ? decision.reasons.join(" ")
      : `Escalated based on triage: category ${decision.category}, urgency ${decision.urgency}` +
        `${decision.safeguarding ? ", safeguarding concern" : ""}.`;
  const snippet = message.length > SUMMARY_SNIPPET_LENGTH ? `${message.slice(0, SUMMARY_SNIPPET_LENGTH)}…` : message;
  return `${why}\n\nOriginal message: "${snippet}"`;
}

/**
 * A case's safety state is never downgraded by a later, weaker decision:
 * safeguarding only goes false->true, urgency only moves up the scale.
 * Category and status are left untouched — category is why the case was
 * first escalated, and status changes belong to staff, not this path.
 */
function strongestSafetyState(current: Case, decision: FinalDecision) {
  return {
    safeguarding: current.safeguarding || decision.safeguarding,
    urgency: isStrongerUrgency(decision.urgency, current.urgency) ? decision.urgency : current.urgency,
  };
}

export interface EnsureEscalationCaseInput {
  conversationId: string;
  decision: FinalDecision;
  message: string;
}

/**
 * Idempotent: safe to call more than once for the same conversation,
 * including under concurrent/retried requests. The unique constraint on
 * Case.conversationId is the real safety net — a race between two
 * concurrent first-escalations is resolved by letting the database reject
 * the loser's INSERT (P2002) and falling through to read-and-merge the
 * winner's row, rather than trusting a find-then-create check alone.
 */
export async function ensureEscalationCase(input: EnsureEscalationCaseInput): Promise<Case> {
  const { conversationId, decision, message } = input;

  const existing = await prisma.case.findUnique({ where: { conversationId } });

  if (!existing) {
    try {
      return await prisma.case.create({
        data: {
          conversationId,
          summary: buildCaseSummary(decision, message),
          category: decision.category,
          urgency: decision.urgency,
          safeguarding: decision.safeguarding,
          status: CaseStatus.NEW,
          // claimedById omitted — defaults to null. No automatic staff assignment.
        },
      });
    } catch (error) {
      const isUniqueConstraintRace =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUniqueConstraintRace) throw error;
      // Fall through: another concurrent request won the race and created
      // the case first. Re-read and merge against that row below.
    }
  }

  const current = existing ?? (await prisma.case.findUniqueOrThrow({ where: { conversationId } }));
  const merged = strongestSafetyState(current, decision);

  const needsUpdate = merged.safeguarding !== current.safeguarding || merged.urgency !== current.urgency;
  if (!needsUpdate) {
    return current;
  }

  return prisma.case.update({
    where: { id: current.id },
    data: merged,
  });
}
